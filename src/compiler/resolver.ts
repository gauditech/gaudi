import _ from "lodash";
import { match } from "ts-pattern";

import {
  Action,
  ActionAtomSet,
  ActionAtomVirtualInput,
  ActionHook,
  AnonymousQuery,
  Api,
  BinaryOperator,
  Computed,
  DeleteAction,
  Endpoint,
  EndpointType,
  Entrypoint,
  ExecuteAction,
  Expr,
  FetchAction,
  Field,
  FieldValidationHook,
  GlobalAtom,
  Hook,
  IdentifierRef,
  Model,
  ModelAction,
  ModelAtom,
  ModelHook,
  Populate,
  Populator,
  ProjectASTs,
  Query,
  RefModelAtom,
  RefModelField,
  RefModelReference,
  RefVirtualInput,
  Reference,
  Relation,
  Runtime,
  Select,
  UnaryOperator,
  Validator,
} from "./ast/ast";
import { builtinFunctions } from "./ast/functions";
import { Scope, addTypeGuard } from "./ast/scope";
import {
  PrimitiveType,
  Type,
  TypeCardinality,
  TypeCategory,
  baseType,
  getTypeCardinality,
  getTypeModel,
  isExpectedType,
  primitiveTypes,
  removeNullable,
} from "./ast/type";
import { CompilerError, ErrorCode } from "./compilerError";
import { authUserModelName } from "./plugins/authenticator";

import { kindFilter, kindFind } from "@src/common/kindFilter";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";

export function resolve(projectASTs: ProjectASTs) {
  const errors: CompilerError[] = [];
  const resolvingModelAtoms = new Set<string>();
  const resolvedModelAtoms = new Set<string>();

  function getSumDocument(): GlobalAtom[] {
    return _.concat(...projectASTs.plugins, projectASTs.document);
  }

  function getAllModels(): Model[] {
    return kindFilter(getSumDocument(), "model");
  }

  /**
   * Note that code can't see runtimes of plugins. This is on purpose so that
   * Code can have one runtime and that would be a default runtime without
   * using default keyword.
   */
  function getRuntimes(): Runtime[] {
    return kindFilter(projectASTs.document, "runtime");
  }

  function resolveDocument(document: GlobalAtom[]) {
    document.forEach((a) =>
      match(a)
        .with({ kind: "model" }, resolveModel)
        .with({ kind: "api" }, resolveApi)
        .with({ kind: "populator" }, resolvePopulator)
        .with({ kind: "runtime" }, () => undefined)
        .with({ kind: "authenticator" }, () => undefined)
        .with({ kind: "generator" }, () => undefined)
        .exhaustive()
    );
  }

  function resolveModel(model: Model) {
    model.atoms.forEach((a) => resolveModelAtom(model, a));
  }

  function resolveModelAtom(model: Model, atom: ModelAtom) {
    const atomKey = model.name.text + "|" + atom.name.text;
    if (resolvedModelAtoms.has(atomKey)) return;
    // if atom is already resolving means there is circular reference somewhere
    if (resolvingModelAtoms.has(atomKey)) {
      errors.push(new CompilerError(atom.name.token, ErrorCode.CircularModelMemberDetected));
      return;
    }
    resolvingModelAtoms.add(atomKey);

    const scope: Scope = {
      environment: "model",
      model: model.name.text,
      context: {},
      typeGuard: {},
    };
    match(atom)
      .with({ kind: "field" }, (field) => resolveField(model, field))
      .with({ kind: "reference" }, (reference) => resolveReference(model, reference))
      .with({ kind: "relation" }, (relation) => resolveRelation(model, relation))
      .with({ kind: "query" }, (query) => resolveQuery(query, scope))
      .with({ kind: "computed" }, (computed) => resolveComputed(model, computed))
      .with({ kind: "hook" }, (hook) => resolveModelHook(hook, scope))
      .exhaustive();

    resolvedModelAtoms.add(atomKey);
    resolvingModelAtoms.delete(atomKey);
  }

  function resolveField(model: Model, field: Field) {
    kindFilter(field.atoms, "validate").map((validate) =>
      validate.validators.forEach(resolveValidator)
    );

    field.name.ref = {
      kind: "modelAtom",
      atomKind: "field",
      parentModel: model.name.text,
      name: field.name.text,
      unique: !!kindFind(field.atoms, "unique"),
    };

    let type: Type = Type.any;
    const typeAtom = kindFind(field.atoms, "type");
    if (typeAtom) {
      const typeText = typeAtom.identifier.text;
      if (_.includes(primitiveTypes, typeText)) {
        type = Type.primitive(typeText as PrimitiveType["primitiveKind"]);
      } else {
        errors.push(new CompilerError(typeAtom.identifier.token, ErrorCode.UnexpectedFieldType));
      }
    }
    const nullable = kindFind(field.atoms, "nullable");
    field.name.type = nullable ? Type.nullable(type) : type;
  }

  function resolveValidator(validator: Validator) {
    match(validator)
      .with({ kind: "hook" }, resolveFieldValidationHook)
      .with({ kind: "builtin" }, () => undefined) // TODO: do nothing?
      .exhaustive();
  }

  function resolveReference(model: Model, reference: Reference) {
    const to = kindFind(reference.atoms, "to");
    if (to) {
      resolveModelRef(to.identifier);
    }

    if (to?.identifier.ref?.kind === "model") {
      const nullable = !!kindFind(reference.atoms, "nullable");
      reference.name.ref = {
        kind: "modelAtom",
        atomKind: "reference",
        parentModel: model.name.text,
        name: reference.name.text,
        model: to.identifier.ref.model,
        unique: !!kindFind(reference.atoms, "unique"),
        nullable,
      };
      const type = Type.model(to.identifier.ref.model);
      reference.name.type = nullable ? Type.nullable(type) : type;
    }
  }

  function resolveRelation(model: Model, relation: Relation) {
    const from = kindFind(relation.atoms, "from");
    if (from) resolveModelRef(from.identifier);

    const through = kindFind(relation.atoms, "through");
    if (through) {
      resolveModelAtomRef(through.identifier, from?.identifier.ref?.model, "reference");
      const throughModel = through.identifier.ref?.model;
      if (throughModel && throughModel !== model.name.text) {
        errors.push(
          new CompilerError(through.identifier.token, ErrorCode.ThroughReferenceHasIncorrectModel)
        );
      }
    }

    if (from?.identifier.ref && through?.identifier.ref) {
      relation.name.ref = {
        kind: "modelAtom",
        atomKind: "relation",
        parentModel: model.name.text,
        name: relation.name.text,
        model: from.identifier.ref.model,
        through: through.identifier.ref.name,
      };

      const type = Type.model(from.identifier.ref.model);
      const isOne = through.identifier.ref.unique;
      relation.name.type = isOne ? Type.nullable(type) : Type.collection(type);
    }
  }

  function resolveQuery(query: Query | AnonymousQuery, parentScope: Scope) {
    let currentModel: string | undefined;
    const scope: Scope = _.cloneDeep({ ...parentScope, environment: "model" });
    let cardinality = "one" as TypeCardinality;

    const from = kindFind(query.atoms, "from");
    if (from) {
      resolveIdentifierRefPath(from.identifierPath, parentScope, { allowGlobal: true });
      from.identifierPath.forEach((identifier) => {
        currentModel = getTypeModel(identifier.type);
        cardinality = getTypeCardinality(identifier.type, cardinality);
        identifier.type = baseType(identifier.type);
      });

      if (from.as) {
        const rootRef = from.identifierPath[0].ref;
        // TODO: what if root is "context" or another "queryTarget"
        const initialPath = rootRef?.kind === "modelAtom" ? [rootRef.parentModel] : [];
        from.as.identifierPath.forEach((as, i) => {
          const target = from.identifierPath[i];
          const path = [...initialPath, ...from.identifierPath.slice(0, i + 1).map((i) => i.text)];
          as.ref = { kind: "queryTarget", path };
          as.type = target.type;
          addToScope(scope, as);
        });
        scope.model = undefined;
      } else {
        scope.model = currentModel;
      }
    } else if (query.kind === "anonymousQuery") {
      currentModel = parentScope.model;
      scope.model = currentModel;
    }

    const filter = kindFind(query.atoms, "filter");
    if (filter) {
      resolveExpression(filter.expr, scope);
      // if filter is present on cardinality 'one', cardinality changes to 'nullable'
      if (cardinality === "one") {
        cardinality = "nullable";
      }
    }

    const orderBy = kindFind(query.atoms, "orderBy");
    if (orderBy) {
      orderBy.orderBy.forEach((orderBy) => resolveExpression(orderBy.expr, scope));
    }

    const select = kindFind(query.atoms, "select");
    if (select) {
      resolveSelect(select.select, currentModel, scope);
    }

    if (currentModel) {
      let baseType: Type;
      if (select) {
        baseType = selectToStruct(select.select);
      } else {
        baseType = Type.model(currentModel);
      }

      const aggregate = kindFind(query.atoms, "aggregate");
      let type: Type;
      switch (aggregate?.aggregate) {
        case "one":
          type = baseType;
          break;
        case "first":
          type = cardinality === "one" ? baseType : Type.nullable(baseType);
          break;
        case "count":
        case "sum":
          type = Type.integer;
          break;
        case undefined:
          type =
            cardinality === "one"
              ? baseType
              : cardinality === "nullable"
              ? Type.nullable(baseType)
              : Type.collection(baseType);
          break;
      }

      if (query.kind === "query" && parentScope.model) {
        query.name.ref = {
          kind: "modelAtom",
          atomKind: "query",
          parentModel: parentScope.model,
          name: query.name.text,
          model: currentModel,
        };
        query.name.type = type;
      }
      if (query.kind === "anonymousQuery") {
        query.type = type;
      }
    }
  }

  function selectToStruct(select: Select): Type {
    const type = Type.struct({});

    select.forEach(({ target, select }) => {
      let name = target.name.text;
      let targetType: Type;
      if (select) {
        targetType = selectToStruct(select);
      } else {
        if (target.kind === "short") {
          targetType = target.name.type;
        } else {
          targetType = target.expr.type;
        }
        if (targetType.kind === "model") {
          name += "_id";
          targetType = Type.integer;
        }
      }
      type.types[name] = targetType;
    });

    return type;
  }

  function resolveComputed(model: Model, computed: Computed) {
    resolveExpression(computed.expr, {
      environment: "model",
      model: model.name.text,
      context: {},
      typeGuard: {},
    });

    computed.name.ref = {
      kind: "modelAtom",
      atomKind: "computed",
      parentModel: model.name.text,
      name: computed.name.text,
    };

    const exprType = computed.expr.type;
    if (
      !exprType ||
      exprType.kind === "primitive" ||
      (exprType.kind === "nullable" && exprType.type.kind === "primitive")
    ) {
      computed.name.type = computed.expr.type;
    } else {
      errors.push(
        new CompilerError(computed.keyword, ErrorCode.ComputedType, { exprType: exprType.kind })
      );
    }
  }

  function resolveApi(api: Api) {
    api.atoms.forEach((a) =>
      match(a)
        .with({ kind: "entrypoint" }, (entrypoint) =>
          resolveEntrypoint(entrypoint, null, {
            environment: "entrypoint",
            model: undefined,
            context: {},
            typeGuard: {},
          })
        )
        .exhaustive()
    );
  }

  // passing null as a parent model means this is root model, while undefined means it is unresolved
  function resolveEntrypoint(
    entrypoint: Entrypoint,
    parentModel: string | undefined | null,
    scope: Scope
  ) {
    let alias: IdentifierRef | undefined;

    if (parentModel === null) {
      resolveModelRef(entrypoint.target);
    } else {
      resolveModelAtomRef(entrypoint.target, parentModel, "reference", "relation");
    }
    const cardinality = getTypeCardinality(entrypoint.target.type);
    const currentModel = entrypoint.target.ref?.model;
    if (entrypoint.as) {
      entrypoint.as.identifier.ref = { kind: "target", targetKind: "entrypoint" };
      entrypoint.as.identifier.type = baseType(entrypoint.target.type);
      alias = entrypoint.as.identifier;
    }

    const identify = kindFind(entrypoint.atoms, "identify");
    if (identify) {
      if (cardinality === "collection") {
        const through = kindFind(identify.atoms, "through");
        if (through) resolveModelAtomRef(through.identifier, currentModel, "field");
      } else {
        errors.push(
          new CompilerError(identify.keyword, ErrorCode.SingleCardinalityEntrypointHasIdentify)
        );
      }
    }

    const authorize = kindFind(entrypoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, Type.boolean);
      scope = addTypeGuard(authorize.expr, scope, false);
    }

    const response = kindFind(entrypoint.atoms, "response");
    if (response) {
      resolveSelect(response.select, currentModel, { ..._.cloneDeep(scope), model: currentModel });
    }

    kindFilter(entrypoint.atoms, "endpoint").forEach((endpoint) =>
      resolveEndpoint(endpoint, currentModel, cardinality, alias, _.cloneDeep(scope))
    );

    const childEntrypointScope = _.cloneDeep(scope);
    if (alias) addToScope(childEntrypointScope, alias);
    kindFilter(entrypoint.atoms, "entrypoint").forEach((entrypoint) =>
      resolveEntrypoint(entrypoint, currentModel, childEntrypointScope)
    );
  }

  function resolveEndpoint(
    endpoint: Endpoint,
    model: string | undefined,
    parentCardinality: TypeCardinality,
    alias: IdentifierRef | undefined,
    scope: Scope
  ) {
    // add current target alias to all endpoints with cardinality one
    switch (endpoint.type) {
      case "custom": {
        const cardinality = kindFind(endpoint.atoms, "cardinality")?.cardinality;
        if (cardinality !== "one") break;
        // fall through
      }
      case "get":
      case "delete":
      case "update": {
        if (alias) addToScope(scope, alias);
        break;
      }
      default:
        break;
    }

    const isSupportedByParentCardinality = match(endpoint.type)
      .with("get", "update", () => true)
      .with(
        "delete",
        "create",
        () => parentCardinality === "collection" || parentCardinality === "nullable"
      )
      .with("list", () => parentCardinality === "collection")
      .with(
        "custom",
        () =>
          kindFind(endpoint.atoms, "cardinality")?.cardinality !== "many" ||
          parentCardinality === "collection"
      )
      .exhaustive();
    if (!isSupportedByParentCardinality) {
      const endpointString = endpoint.type === "custom" ? "custom-many" : endpoint.type;
      errors.push(
        new CompilerError(
          endpoint.keywordType,
          ErrorCode.UnsupportedEndpointByEntrypointCardinality,
          { endpoint: endpointString, cardinality: parentCardinality }
        )
      );
    }

    const authorize = kindFind(endpoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, Type.boolean);
      scope = addTypeGuard(authorize.expr, scope, false);
    }

    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.forEach((action) => {
        resolveAction(action, endpoint.type, model, alias, scope);
      });

      // check for primary action
      if (endpoint.type === "create" || endpoint.type === "update" || endpoint.type === "delete") {
        let hasPrimary = false;
        for (const a of action.actions) {
          if (a.kind === endpoint.type && a.isPrimary) {
            if (hasPrimary) {
              errors.push(
                new CompilerError(a.keyword, ErrorCode.ActionBlockAlreadyHasPrimaryAction)
              );
            } else {
              hasPrimary = true;
            }
          }
        }
        if (!hasPrimary) {
          errors.push(
            new CompilerError(action.keyword, ErrorCode.ActionBlockDoesNotHavePrimaryAciton)
          );
        }
      }
    }
    const orderBy = kindFind(endpoint.atoms, "orderBy");
    if (orderBy) {
      // this will be executed in query which means it will be used in "model" scope
      // TODO: should model be in entire endpoint scope?
      const modelScope: Scope = { ...scope, model, environment: "model" };
      orderBy.orderBy.forEach((orderBy) => resolveExpression(orderBy.expr, modelScope));
    }

    const filter = kindFind(endpoint.atoms, "filter");
    if (filter) {
      // this will be executed in query which means it will be used in "model" scope
      // TODO: should model be in entire endpoint scope?
      const modelScope: Scope = { ...scope, model, environment: "model" };
      resolveExpression(filter.expr, modelScope);
    }
  }

  function resolveAction(
    action: Action,
    endpointType: EndpointType,
    parentModel: string | undefined,
    targetAlias: IdentifierRef | undefined,
    scope: Scope
  ) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, (action) =>
        resolveModelAction(action, endpointType, parentModel, targetAlias, scope)
      )
      .with({ kind: "delete" }, (action) => resolveDeleteAction(action, endpointType, scope))
      .with({ kind: "execute" }, (action) => resolveExecuteAction(action, scope))
      .with({ kind: "fetch" }, (action) => resolveFetchAction(action, scope))
      .exhaustive();
  }

  function resolveModelAction(
    action: ModelAction,
    endpointType: EndpointType,
    parentModel: string | undefined,
    targetAlias: IdentifierRef | undefined,
    scope: Scope
  ) {
    let currentModel: string | undefined = parentModel;
    if (action.target) {
      resolveIdentifierRefPath(action.target, scope, { allowGlobal: action.kind === "create" });
      const lastTarget = action.target.at(-1);
      currentModel = getTypeModel(lastTarget!.type);

      if (lastTarget?.ref) {
        let targetIsSupported;
        switch (lastTarget.ref.kind) {
          case "model": {
            targetIsSupported = action.kind === "create";
            break;
          }
          case "modelAtom": {
            if (lastTarget.ref.atomKind === "relation") {
              targetIsSupported = action.kind === "create";
            }
            if (lastTarget.ref.atomKind === "reference") {
              targetIsSupported = action.kind === "update" || lastTarget.ref.nullable;
            }
            break;
          }
          case "action":
          case "target": {
            targetIsSupported = action.kind === "update";
            break;
          }
          default:
            targetIsSupported = false;
        }
        if (!targetIsSupported) {
          const code =
            action.kind === "create"
              ? ErrorCode.UnsuportedTargetInCreateAction
              : ErrorCode.UnsuportedTargetInUpdateAction;
          errors.push(new CompilerError(lastTarget.token, code));
        }
      }

      // check if target is primary action
      if (action.target.length === 1 && endpointType === action.kind) {
        const primaryTarget = action.kind === "update" ? targetAlias?.text : parentModel;
        if (action.target[0].text === primaryTarget) {
          action.isPrimary = true;
        }
      }
    } else {
      // action without target must be primary action
      if (endpointType === action.kind) {
        action.isPrimary = true;
      } else {
        errors.push(
          new CompilerError(action.keyword, ErrorCode.PrimaryActionInWrongEntrypoint, {
            action: action.kind,
            endpoint: endpointType,
          })
        );
      }
    }

    if (currentModel && action.as) {
      action.as.identifier.ref = { kind: "action" };
      action.as.identifier.type = Type.model(currentModel);
      addToScope(scope, action.as.identifier);
    }

    scope = { ...scope, model: currentModel };

    // first resolve all virtual inputs so they can be referenced
    kindFilter(action.atoms, "virtualInput").forEach((virtualInput) =>
      resolveActionAtomVirtualInput(virtualInput, scope)
    );

    action.atoms.forEach((a) =>
      match(a)
        .with({ kind: "virtualInput" }, () => undefined) // already resolved
        .with({ kind: "set" }, (set) => resolveActionAtomSet(set, currentModel, scope))
        .with({ kind: "referenceThrough" }, ({ target, through }) => {
          resolveModelAtomRef(target, currentModel, "reference");
          resolveModelAtomRef(through, target.ref?.model, "field");
        })
        .with({ kind: "deny" }, ({ fields }) => {
          if (fields.kind === "list") {
            fields.fields.forEach((field) =>
              resolveModelAtomRef(field, currentModel, "field", "reference", "relation")
            );
          }
        })
        .with({ kind: "input" }, ({ fields }) => {
          fields.forEach(({ field, atoms }) => {
            resolveModelAtomRef(field, currentModel, "field", "reference", "relation");
            kindFilter(atoms, "default").map(({ value }) => resolveExpression(value, scope));
          });
        })
        .exhaustive()
    );

    const allIdentifiers = action.atoms.flatMap(
      (a): IdentifierRef<RefVirtualInput | RefModelField | RefModelReference>[] =>
        match(a)
          .with({ kind: "virtualInput" }, ({ name }) => [name])
          .with({ kind: "set" }, ({ target }) => [target])
          .with({ kind: "referenceThrough" }, ({ target }) => [target])
          .with({ kind: "deny" }, ({ fields }) => (fields.kind === "all" ? [] : fields.fields))
          .with({ kind: "input" }, ({ fields }) => fields.map(({ field }) => field))
          .exhaustive()
    );
    const references = allIdentifiers.filter(
      ({ ref }) => ref?.kind === "modelAtom" && ref.atomKind === "reference"
    );
    references.forEach(({ text, token }) => {
      const idName = text + "_id";
      if (allIdentifiers.map((i) => i.text).includes(idName)) {
        errors.push(new CompilerError(token, ErrorCode.DuplicateActionAtom));
      }
    });
  }

  function resolveDeleteAction(action: DeleteAction, endpointType: EndpointType, scope: Scope) {
    if (action.target) {
      resolveIdentifierRefPath(action.target, scope);
    } else {
      // action without target must be primary action
      if (endpointType === action.kind) {
        action.isPrimary = true;
      } else {
        errors.push(
          new CompilerError(action.keyword, ErrorCode.PrimaryActionInWrongEntrypoint, {
            action: action.kind,
            endpoint: endpointType,
          })
        );
      }
    }
  }

  function resolveExecuteAction(action: ExecuteAction, scope: Scope) {
    kindFilter(action.atoms, "virtualInput").forEach((virtualInput) =>
      resolveActionAtomVirtualInput(virtualInput, scope)
    );
    const hook = kindFind(action.atoms, "hook");
    if (hook) resolveActionHook(hook, scope);
  }

  function resolveFetchAction(action: FetchAction, scope: Scope) {
    kindFilter(action.atoms, "virtualInput").forEach((virtualInput) =>
      resolveActionAtomVirtualInput(virtualInput, scope)
    );
    const query = kindFind(action.atoms, "anonymousQuery");
    if (query) {
      resolveQuery(query, scope);
      action.name.ref = { kind: "action" };
      // TODO: for now, we magicaly get non modified type from fetch query
      action.name.type = baseType(query.type);
      addToScope(scope, action.name);
    }
  }

  function resolveActionAtomSet(set: ActionAtomSet, model: string | undefined, scope: Scope) {
    resolveModelAtomRef(set.target, model, "field", "reference");
    match(set.set)
      .with({ kind: "hook" }, (hook) => resolveActionHook(hook, scope))
      .with({ kind: "expr" }, ({ expr }) => {
        resolveExpression(expr, scope);
        checkExprType(expr, set.target.type);
      })
      .exhaustive();
  }

  function resolveActionAtomVirtualInput(virtualInput: ActionAtomVirtualInput, scope: Scope) {
    let type: Type = Type.any;
    const typeAtom = kindFind(virtualInput.atoms, "type");
    if (typeAtom) {
      const typeText = typeAtom.identifier.text;
      if (_.includes(primitiveTypes, typeText)) {
        type = Type.primitive(typeText as PrimitiveType["primitiveKind"]);
      } else {
        errors.push(new CompilerError(typeAtom.identifier.token, ErrorCode.VirtualInputType));
      }
    }
    const nullable = kindFind(virtualInput.atoms, "nullable");
    virtualInput.name.ref = { kind: "virtualInput" };
    virtualInput.name.type = nullable ? Type.nullable(type) : type;
    addToScope(scope, virtualInput.name);
  }

  function resolvePopulator(populator: Populator) {
    populator.atoms.forEach((populate) =>
      resolvePopulate(populate, null, {
        environment: "entrypoint",
        model: undefined,
        context: {},
        typeGuard: {},
      })
    );
  }

  function resolvePopulate(
    populate: Populate,
    parentModel: string | undefined | null,
    scope: Scope
  ) {
    let through: string | undefined;

    if (parentModel === null) {
      resolveModelRef(populate.target);
    } else {
      resolveModelAtomRef(populate.target, parentModel, "relation");
      if (
        populate.target.ref?.kind === "modelAtom" &&
        populate.target.ref.atomKind === "relation"
      ) {
        through = populate.target.ref.through;
      }
    }
    const currentModel = populate.target.ref?.model;
    scope.model = currentModel;
    if (populate.as) {
      populate.as.identifier.ref = { kind: "target", targetKind: "populate" };
      populate.as.identifier.type = baseType(populate.target.type);
      addToScope(scope, populate.as.identifier);
    }

    kindFilter(populate.atoms, "repeat").forEach((repeat) => {
      if (repeat.as) {
        repeat.as.identifier.ref = { kind: "repeat" };
        repeat.as.identifier.type = Type.struct({
          start: Type.integer,
          end: Type.integer,
          current: Type.integer,
        });
        addToScope(scope, repeat.as.identifier);
      }
    });

    const sets = kindFilter(populate.atoms, "set");
    sets.forEach((set) => resolveActionAtomSet(set, currentModel, scope));
    const model = (currentModel && findModel(currentModel)) || undefined;
    if (model) {
      const missingSetters: string[] = [];
      // model atoms should already be resolved

      model.atoms.forEach((a) => {
        switch (a.kind) {
          case "field":
          case "reference": {
            // don't need to set reference that can be set from parent
            if (a.name.text === through) return;

            const hasDefault = !!kindFind(a.atoms, "default");
            const hasNullable = !!kindFind(a.atoms, "nullable");
            if (hasDefault || hasNullable) return;

            const relatedSet = sets.find(({ target }) => {
              const isSet = target.text === a.name.text;
              if (!isSet && a.kind === "reference") {
                return target.text === a.name.text + "_id";
              }
              return isSet;
            });
            if (!relatedSet) {
              missingSetters.push(a.name.text);
            }
            return;
          }
          default:
            return;
        }
      });
      if (missingSetters.length > 0) {
        errors.push(
          new CompilerError(populate.keyword, ErrorCode.PopulateIsMissingSetters, {
            atoms: missingSetters,
          })
        );
      }
    }

    kindFilter(populate.atoms, "populate").forEach((populate) =>
      resolvePopulate(populate, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveModelHook(hook: ModelHook, scope: Scope) {
    resolveHook(hook);
    kindFilter(hook.atoms, "arg_query").forEach(({ query }) => resolveQuery(query, scope));
    kindFilter(hook.atoms, "arg_expr").forEach(({ expr }) => resolveExpression(expr, scope));
    if (scope.model) {
      hook.name.ref = {
        kind: "modelAtom",
        atomKind: "hook",
        parentModel: scope.model,
        name: hook.name.text,
      };
    }
  }

  function resolveFieldValidationHook(hook: FieldValidationHook) {
    resolveHook(hook);
  }

  function resolveActionHook(hook: ActionHook, scope: Scope) {
    resolveHook(hook);
    kindFilter(hook.atoms, "arg_query").forEach(({ query }) => resolveQuery(query, scope));
    kindFilter(hook.atoms, "arg_expr").forEach(({ expr }) => resolveExpression(expr, scope));
  }

  function resolveHook(hook: Hook<"model" | "validation" | "action">) {
    const source = kindFind(hook.atoms, "source");
    if (source) {
      const runtimes = getRuntimes();
      const runtimeAtom = kindFind(hook.atoms, "runtime");

      let runtime: Runtime | undefined = undefined;
      if (runtimeAtom) {
        runtime = runtimes.find((r) => r.name.text === runtimeAtom.identifier.text);
      } else {
        runtime = runtimes.find((r) => kindFind(r.atoms, "default"));
        if (!runtime && runtimes.length === 1) {
          runtime = runtimes[0];
        }
      }

      const internalExecRuntimeName = getInternalExecutionRuntimeName();
      if (runtime) {
        source.runtime = runtime.name.text;
      } else if (runtimeAtom?.identifier.text === internalExecRuntimeName) {
        source.runtime = internalExecRuntimeName;
      }
    }
  }

  function resolveSelect(select: Select, model: string | undefined, scope: Scope) {
    select.forEach(({ target, select }) => {
      let type: Type;
      if (target.kind === "short") {
        tryResolveModelAtomRef(target.name, model);
        type = target.name.type;
      } else {
        resolveExpression(target.expr, scope);
        type = target.expr.type;
      }
      if (select) {
        const model = getTypeModel(type);
        if (!model) {
          const errorToken = target.kind === "short" ? target.name.token : target.expr.sourcePos;
          errors.push(new CompilerError(errorToken, ErrorCode.SelectCantNest));
          return;
        }
        resolveSelect(select, model, { ..._.cloneDeep(scope), model });
      }
    });
  }

  function resolveExpression(expr: Expr, scope: Scope) {
    match(expr)
      .with({ kind: "binary" }, (binary) => {
        resolveExpression(binary.lhs, scope);
        let rhsScope = scope;
        if (binary.lhs.type.kind === "primitive" && binary.lhs.type.primitiveKind === "boolean") {
          if (binary.operator === "and") {
            rhsScope = addTypeGuard(binary.lhs, scope, false);
          } else if (binary.operator === "or") {
            rhsScope = addTypeGuard(binary.lhs, scope, true);
          }
        }
        resolveExpression(binary.rhs, rhsScope);
        binary.type = getBinaryOperatorType(binary.operator, binary.lhs, binary.rhs);
      })
      .with({ kind: "group" }, (group) => {
        resolveExpression(group.expr, scope);
        group.type = group.expr.type;
      })
      .with({ kind: "array" }, (array) => {
        let type: Type | undefined = undefined;
        for (const element of array.elements) {
          resolveExpression(element, scope);
          if (element.type.kind === "collection") {
            errors.push(
              new CompilerError(element.sourcePos, ErrorCode.CollectionInsideArray, {
                type: element.type,
              })
            );
          } else if (!type) {
            type = element.type;
          } else if (isExpectedType(type, element.type)) {
            type = element.type;
          } else {
            checkExprType(element, type);
          }
        }
        if (!type) type = Type.any;
        array.type = Type.collection(type);
      })
      .with({ kind: "unary" }, (unary) => {
        resolveExpression(unary.expr, scope);
        unary.type = getUnaryOperatorType(unary.operator, unary.expr);
      })
      .with({ kind: "path" }, (path) => {
        const resolveOptions: ResolveOptions = {
          modelAtomKinds: scope.environment === "entrypoint" ? ["field"] : undefined,
        };
        resolveIdentifierRefPath(path.path, scope, resolveOptions);
        path.type = path.path.at(-1)!.type;
      })
      .with({ kind: "literal" }, (literal) => {
        literal.type =
          literal.literal.kind === "null" ? Type.null : Type.primitive(literal.literal.kind);
      })
      .with({ kind: "function" }, (function_) => {
        function_.args.forEach((arg) => resolveExpression(arg, scope));
        const builtin = builtinFunctions.find((builtin) => builtin.name === function_.name.text);
        if (!builtin) {
          errors.push(new CompilerError(function_.name.token, ErrorCode.UnknownFunction));
          return;
        }
        if (function_.args.length !== builtin.args.length) {
          errors.push(
            new CompilerError(function_.name.token, ErrorCode.UnexpectedFunctionArgumentCount, {
              name: builtin.name,
              expected: builtin.args.length,
              got: function_.args.length,
            })
          );
          return;
        }

        // typecheck arguments
        for (let i = 0; i < builtin.args.length; i++) {
          const expected = builtin.args[i];
          const got = function_.args[i];
          checkExprType(got, expected);
        }

        // sum is a special case as it is 'generic'
        if (builtin.name === "sum") {
          const resultType = baseType(function_.args[0].type);
          if (resultType && isExpectedType(resultType, "number")) {
            function_.type = resultType;
          }
        } else {
          function_.type = builtin.result;
        }
      })
      .exhaustive();
  }

  type ResolveOptions = { allowGlobal?: boolean; modelAtomKinds?: ModelAtom["kind"][] };
  function resolveIdentifierRefPath(path: IdentifierRef[], scope: Scope, options?: ResolveOptions) {
    if (path.length <= 0) return;
    const [head, ...tail] = path;
    const headName = head.text;

    const modelAtomKind =
      tryResolveModelAtomRef(head, scope.model, false) && head.ref?.kind === "modelAtom"
        ? head.ref.atomKind
        : undefined;

    const context = scope.context[headName];

    // try to resolve from model scope
    if (
      modelAtomKind &&
      (options?.modelAtomKinds ? options.modelAtomKinds.includes(modelAtomKind) : true)
    ) {
      // don't set ref and type because it is set in tryResolveNextRef
    }
    // try to resolve from context
    else if (context) {
      head.ref = context.ref;
      head.type = context.type;
    }
    // try to resolve from global models, if global is allowed
    else if (options?.allowGlobal && findModel(headName)) {
      head.ref = { kind: "model", model: headName };
      head.type = Type.model(headName);
    }
    // special case, try to resolve @auth
    else if (headName === "@auth") {
      const model = findModel(authUserModelName);
      if (!model) {
        // fail resolve
        errors.push(new CompilerError(head.token, ErrorCode.CantResolveModel));
        return;
      } else {
        head.ref = { kind: "auth", model: model.name.text };
        head.type = Type.nullable(Type.model(model.name.text));
      }
    }
    // simple nullable string, we don't check if auth plugin is present for this for now
    else if (headName === "@requestAuthToken") {
      head.ref = { kind: "authToken" };
      head.type = Type.nullable(Type.string);
    } else {
      // fail resolve
      errors.push(new CompilerError(head.token, ErrorCode.CantFindNameInScope, { name: headName }));
      return;
    }

    // resolve rest of the path
    resolveRefPath(tail, head.type);

    // go through the path and set more precise type from current type guards
    path.forEach((identifier, i) => {
      const key = path
        .slice(0, i + 1)
        .map((i) => i.text)
        .join("|");
      const typeGuardOperation = scope.typeGuard[key];
      if (typeGuardOperation === "notNull") {
        identifier.type = removeNullable(identifier.type);
      } else if (typeGuardOperation === "null") {
        identifier.type = Type.null;
      }
    });
  }

  function resolveRefPath(path: IdentifierRef[], previousType: Type): boolean {
    let type = previousType;
    for (const i of path) {
      if (resolveNextRef(i, type)) {
        type = i.type;
      } else {
        return false;
      }
    }
    return true;
  }

  function resolveNextRef(identifier: IdentifierRef, previousType: Type): boolean {
    switch (previousType.kind) {
      case "any":
        return true;
      case "model": {
        return tryResolveModelAtomRef(identifier, previousType.model);
      }
      case "struct": {
        const type = previousType.types[identifier.text];
        if (type) {
          identifier.ref = { kind: "struct" };
          identifier.type = type;
          return true;
        } else {
          errors.push(new CompilerError(identifier.token, ErrorCode.CantResolveStructMember));
          return false;
        }
      }
      case "collection":
        if (!resolveNextRef(identifier, previousType.type)) {
          return false;
        }
        identifier.type = Type.collection(identifier.type);
        return true;
      case "nullable": {
        if (!resolveNextRef(identifier, previousType.type)) {
          return false;
        }
        identifier.type = Type.nullable(identifier.type);
        return true;
      }
      case "null":
      case "primitive":
        errors.push(new CompilerError(identifier.token, ErrorCode.TypeHasNoMembers));
        return false;
    }
  }

  function resolveModelRef(identifier: IdentifierRef) {
    const model = findModel(identifier.text);
    if (!model) {
      errors.push(new CompilerError(identifier.token, ErrorCode.CantResolveModel));
    } else {
      identifier.ref = { kind: "model", model: model.name.text };
      identifier.type = Type.collection(Type.model(model.name.text));
    }
  }

  /**
   * returned undefined represents autogenerated fields ("id" and "_id")
   */
  function tryResolveModelAtomRef(
    identifier: IdentifierRef,
    modelName?: string,
    shouldFail = true
  ): boolean {
    if (!modelName) return false;
    const model = findModel(modelName);
    if (!model) return false;
    const name = identifier.text;

    const atom = model.atoms.find((m) => m.name.text === name);

    // Id of a reference in model can be targeted
    if (atom) {
      resolveModelAtom(model, atom);
      identifier.ref = atom.name.ref;
      identifier.type = atom.name.type;
      return true;
    }

    if (name.endsWith("_id")) {
      const referenceAtom = model.atoms.find((m) => m.name.text === name.slice(0, -3));
      if (referenceAtom?.kind === "reference") {
        identifier.ref = {
          kind: "modelAtom",
          atomKind: "field",
          parentModel: model.name.text,
          name,
          unique: false,
        };
        const baseType: Type = Type.integer;
        identifier.type =
          referenceAtom.name.type.kind === "nullable" ? Type.nullable(baseType) : baseType;
        return true;
      }
    }
    // Model id can be targeted
    if (name === "id") {
      identifier.ref = {
        kind: "modelAtom",
        atomKind: "field",
        parentModel: model.name.text,
        name,
        unique: true,
      };
      identifier.type = Type.integer;
      identifier.type;
      return true;
    }

    if (shouldFail) {
      errors.push(new CompilerError(identifier.token, ErrorCode.CantResolveModelAtom, { name }));
    }
    return false;
  }

  function resolveModelAtomRef(
    identifier: IdentifierRef,
    model: string | undefined,
    ...kinds: RefModelAtom["atomKind"][]
  ) {
    if (!tryResolveModelAtomRef(identifier, model)) return;
    if (identifier.ref?.kind !== "modelAtom") return;

    for (const kind of kinds) {
      if (kind === identifier.ref.atomKind) return;
    }

    errors.push(
      new CompilerError(identifier.token, ErrorCode.CantResolveModelAtomWrongKind, {
        atom: identifier.ref.atomKind,
        expected: kinds,
      })
    );
    return;
  }

  function findModel(name: string): Model | undefined {
    return getAllModels().find((m) => m.name.text === name);
  }

  function getBinaryOperatorType(op: BinaryOperator, lhs: Expr, rhs: Expr): Type {
    switch (op) {
      case "or":
      case "and": {
        checkExprType(lhs, Type.boolean);
        checkExprType(rhs, Type.boolean);
        return Type.boolean;
      }
      case "is":
      case "is not": {
        // extra check to allow nullable as rhs
        if (!isExpectedType(lhs.type, rhs.type)) {
          checkExprType(rhs, lhs.type);
        }
        return Type.boolean;
      }
      case "in":
      case "not in": {
        checkExprType(rhs, Type.collection(lhs.type));
        return Type.boolean;
      }
      case "<":
      case "<=":
      case ">":
      case ">=": {
        const lhsOk = checkExprType(lhs, "comparable");
        const rhsOk = checkExprType(rhs, "comparable");
        if (lhsOk && rhsOk) {
          if (isExpectedType(lhs.type, "number")) {
            checkExprType(rhs, "number");
          } else {
            checkExprType(rhs, lhs.type);
          }
        }
        return Type.boolean;
      }
      case "+": {
        if (lhs.type.kind === "any" || rhs.type.kind === "any") return Type.any;
        const lhsOk = checkExprType(lhs, "addable");
        const rhsOk = checkExprType(rhs, "addable");
        if (lhsOk && rhsOk) {
          if (isExpectedType(lhs.type, "number")) {
            checkExprType(rhs, "number");
            if (isExpectedType(lhs.type, Type.float) || isExpectedType(rhs.type, Type.float)) {
              return Type.float;
            } else {
              return Type.integer;
            }
          } else {
            checkExprType(rhs, lhs.type);
            return lhs.type;
          }
        } else if (lhsOk) {
          return lhs.type;
        } else if (rhsOk) {
          return rhs.type;
        } else {
          return Type.any;
        }
      }
      case "-":
      case "*": {
        if (lhs.type.kind === "any" || rhs.type.kind === "any") return Type.any;
        const lhsOk = checkExprType(lhs, "number");
        const rhsOk = checkExprType(rhs, "number");
        if (lhsOk && rhsOk) {
          if (isExpectedType(lhs.type, Type.float) || isExpectedType(rhs.type, Type.float)) {
            return Type.float;
          } else {
            return Type.integer;
          }
        } else if (lhsOk) {
          return lhs.type;
        } else if (rhsOk) {
          return rhs.type;
        } else {
          return Type.any;
        }
      }
      case "/": {
        checkExprType(lhs, "number");
        checkExprType(rhs, "number");
        return Type.float;
      }
    }
  }

  function getUnaryOperatorType(op: UnaryOperator, expr: Expr): Type {
    switch (op) {
      case "not": {
        checkExprType(expr, Type.boolean);
        return Type.boolean;
      }
    }
  }

  function checkExprType(expr: Expr, expected: Type | TypeCategory): boolean {
    if (!isExpectedType(expr.type, expected)) {
      errors.push(
        new CompilerError(expr.sourcePos, ErrorCode.UnexpectedType, {
          expected: expected,
          got: expr.type,
        })
      );
      return false;
    }
    return true;
  }

  function addToScope(scope: Scope, identifier: IdentifierRef) {
    const text = identifier.text;
    // fails if name already exists in context or if there is a model defined with the same name
    if (scope.context[text] || getAllModels().find((m) => m.name.text === text)) {
      errors.push(new CompilerError(identifier.token, ErrorCode.NameAlreadyInScope));
    } else if (identifier.ref) {
      scope.context[text] = { type: identifier.type, ref: identifier.ref };
    }
  }

  resolveDocument(projectASTs.document);

  return errors;
}
