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
  Type,
  TypeCardinality,
  TypeCategory,
  addCollection,
  addNullable,
  anyType,
  baseType,
  booleanType,
  floatType,
  getTypeCardinality,
  getTypeModel,
  integerType,
  isExpectedType,
  nullType,
  primitiveTypes,
  stringType,
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
    return Object.values(projectASTs.plugins)
      .flatMap((p) => p)
      .concat(projectASTs.document);
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

    let type: Type = anyType;
    const typeAtom = kindFind(field.atoms, "type");
    if (typeAtom) {
      const typeText = typeAtom.identifier.text;
      if (_.includes(primitiveTypes, typeText)) {
        type = { kind: "primitive", primitiveKind: typeText } as Type;
      } else {
        errors.push(new CompilerError(typeAtom.identifier.token, ErrorCode.UnexpectedFieldType));
      }
    }
    const nullable = kindFind(field.atoms, "nullable");
    if (nullable) type = addNullable(type);
    field.name.type = type;
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
      reference.name.ref = {
        kind: "modelAtom",
        atomKind: "reference",
        parentModel: model.name.text,
        name: reference.name.text,
        model: to.identifier.ref.model,
        unique: !!kindFind(reference.atoms, "unique"),
      };
      let type: Type = { kind: "model", model: to.identifier.ref.model };
      const nullable = kindFind(reference.atoms, "nullable");
      if (nullable) type = addNullable(type);
      reference.name.type = type;
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

      const type: Type = { kind: "model", model: from.identifier.ref.model };
      const isOne = through.identifier.ref.unique;
      relation.name.type = isOne ? addNullable(type) : addCollection(type);
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
          console.log(rootRef);
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
      orderBy.orderBy.forEach((orderBy) => resolveIdentifierRefPath(orderBy.identifierPath, scope));
    }

    const select = kindFind(query.atoms, "select");
    if (select) resolveSelect(select.select, currentModel, scope);

    if (currentModel) {
      let baseType: Type;
      if (select) {
        baseType = selectToStruct(select.select);
      } else {
        baseType = { kind: "model", model: currentModel };
      }

      const aggregate = kindFind(query.atoms, "aggregate");
      let type: Type;
      switch (aggregate?.aggregate) {
        case "one":
          type = baseType;
          break;
        case "first":
          type = cardinality === "one" ? baseType : addNullable(baseType);
          break;
        case "count":
        case "sum":
          type = integerType;
          break;
        case undefined:
          type =
            cardinality === "one"
              ? baseType
              : cardinality === "nullable"
              ? addNullable(baseType)
              : addCollection(baseType);
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
    const type: Type = { kind: "struct", types: {} };

    select.forEach(({ target, select }) => {
      let name = target.name.text;
      let targetType: Type;
      if (select) {
        targetType = selectToStruct(select);
      } else {
        if (target.kind === "short") {
          targetType = target.name.type;
        } else {
          // TODO: is it correct cardinality?
          targetType = target.identifierPath.at(-1)!.type;
        }
        if (targetType.kind === "model") {
          name += "_id";
          targetType = integerType;
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
      resolveModelAtomRef(entrypoint.target, parentModel, "relation");
      entrypoint.target.type = baseType(entrypoint.target.type);
    }
    const currentModel = entrypoint.target.ref?.model;
    if (entrypoint.as) {
      entrypoint.as.identifier.ref = { kind: "target", targetKind: "entrypoint" };
      entrypoint.as.identifier.type = entrypoint.target.type;
      alias = entrypoint.as.identifier;
    }

    const identify = kindFind(entrypoint.atoms, "identify");
    if (identify) {
      const through = kindFind(identify.atoms, "through");
      if (through) resolveModelAtomRef(through.identifier, currentModel, "field");
    }

    const authorize = kindFind(entrypoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, booleanType);
      scope = addTypeGuard(authorize.expr, scope, false);
    }

    const response = kindFind(entrypoint.atoms, "response");
    if (response) resolveSelect(response.select, currentModel, scope);

    kindFilter(entrypoint.atoms, "endpoint").forEach((endpoint) =>
      resolveEndpoint(endpoint, currentModel, alias, _.cloneDeep(scope))
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

    const authorize = kindFind(endpoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, booleanType);
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
      orderBy.orderBy.forEach((orderBy) =>
        resolveIdentifierRefPath(orderBy.identifierPath, modelScope)
      );
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

      if (lastTarget?.ref && action.kind === "create") {
        switch (lastTarget.ref.kind) {
          case "model":
            break;
          case "modelAtom": {
            if (lastTarget.ref.atomKind === "relation") {
              break;
            }
            // fall through
          }
          default:
            errors.push(
              new CompilerError(lastTarget.token, ErrorCode.UnsuportedTargetInCreateAction)
            );
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
      action.as.identifier.type = { kind: "model", model: currentModel };
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
    let type: Type = anyType;
    const typeAtom = kindFind(virtualInput.atoms, "type");
    if (typeAtom) {
      const typeText = typeAtom.identifier.text;
      if (_.includes(primitiveTypes, typeText)) {
        type = { kind: "primitive", primitiveKind: typeText } as Type;
      } else {
        errors.push(new CompilerError(typeAtom.identifier.token, ErrorCode.VirtualInputType));
      }
    }
    if (kindFind(virtualInput.atoms, "nullable")) {
      type = addNullable(type);
    }
    virtualInput.name.ref = { kind: "virtualInput" };
    virtualInput.name.type = type;
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
      populate.target.type = baseType(populate.target.type);
    }
    const currentModel = populate.target.ref?.model;
    scope.model = currentModel;
    if (populate.as) {
      populate.as.identifier.ref = { kind: "target", targetKind: "populate" };
      populate.as.identifier.type = populate.target.type;
      addToScope(scope, populate.as.identifier);
    }

    kindFilter(populate.atoms, "repeat").forEach((repeat) => {
      if (repeat.as) {
        repeat.as.identifier.ref = { kind: "repeat" };
        repeat.as.identifier.type = {
          kind: "struct",
          types: {
            start: integerType,
            end: integerType,
            current: integerType,
          },
        };
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
        resolveIdentifierRefPath(target.identifierPath, scope);
        type = target.identifierPath.at(-1)!.type;
      }
      if (select) {
        const model = getTypeModel(type);
        if (!model) {
          const errorToken =
            target.kind === "short" ? target.name.token : target.identifierPath.at(-1)!.token;
          errors.push(new CompilerError(errorToken, ErrorCode.SelectCantNest));
          return;
        }
        const nestedScope = _.cloneDeep(scope);
        if (target.kind === "short") {
          nestedScope.model = model;
        } else {
          const identifier: IdentifierRef = {
            text: target.name.text,
            token: target.name.token,
            ref: target.identifierPath.at(-1)!.ref,
            type,
          };
          addToScope(nestedScope, identifier);
        }
        resolveSelect(select, model, nestedScope);
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
          literal.literal.kind === "null"
            ? nullType
            : { kind: "primitive", primitiveKind: literal.literal.kind };
      })
      .with({ kind: "function" }, (function_) => {
        function_.args.forEach((arg) => resolveExpression(arg, scope));
        const builtin = builtinFunctions.find((builtin) => builtin.name === function_.name.text);
        if (builtin) {
          if (function_.args.length === builtin.args.length) {
            for (let i = 0; i < builtin.args.length; i++) {
              const expected = builtin.args[i];
              const got = function_.args[i];
              checkExprType(got, expected);
            }
          } else {
            errors.push(
              new CompilerError(function_.name.token, ErrorCode.UnexpectedFunctionArgumentCount, {
                name: builtin.name,
                expected: builtin.args.length,
                got: function_.args.length,
              })
            );
          }
        } else {
          errors.push(new CompilerError(function_.name.token, ErrorCode.UnknownFunction));
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
      head.type = { kind: "model", model: headName };
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
        head.type = addNullable({ kind: "model", model: model.name.text });
      }
    }
    // simple nullable string, we don't check if auth plugin is present for this for now
    else if (headName === "@requestAuthToken") {
      head.ref = { kind: "authToken" };
      head.type = addNullable(stringType);
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
        identifier.type = addNullable(identifier.type);
      } else if (typeGuardOperation === "null") {
        identifier.type = nullType;
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
        identifier.type = addCollection(identifier.type);
        return true;
      case "nullable": {
        if (!resolveNextRef(identifier, previousType.type)) {
          return false;
        }
        identifier.type = addNullable(identifier.type);
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
      identifier.type = { kind: "model", model: model.name.text };
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
        const baseType: Type = integerType;
        identifier.type =
          referenceAtom.name.type.kind === "nullable" ? addNullable(baseType) : baseType;
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
      identifier.type = integerType;
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
        checkExprType(lhs, booleanType);
        checkExprType(rhs, booleanType);
        return booleanType;
      }
      case "is":
      case "is not": {
        // extra check to allow nullable as rhs
        if (!isExpectedType(lhs.type, rhs.type)) {
          checkExprType(rhs, lhs.type);
        }
        return booleanType;
      }
      case "in":
      case "not in": {
        checkExprType(rhs, addCollection(lhs.type));
        return booleanType;
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
        return booleanType;
      }
      case "+": {
        if (lhs.type.kind === "any" || rhs.type.kind === "any") return anyType;
        const lhsOk = checkExprType(lhs, "addable");
        const rhsOk = checkExprType(rhs, "addable");
        if (lhsOk && rhsOk) {
          if (isExpectedType(lhs.type, "number")) {
            checkExprType(rhs, "number");
            if (isExpectedType(lhs.type, floatType) || isExpectedType(rhs.type, floatType)) {
              return floatType;
            } else {
              return integerType;
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
          return anyType;
        }
      }
      case "-":
      case "*": {
        if (lhs.type.kind === "any" || rhs.type.kind === "any") return anyType;
        const lhsOk = checkExprType(lhs, "number");
        const rhsOk = checkExprType(rhs, "number");
        if (lhsOk && rhsOk) {
          if (isExpectedType(lhs.type, floatType) || isExpectedType(rhs.type, floatType)) {
            return floatType;
          } else {
            return integerType;
          }
        } else if (lhsOk) {
          return lhs.type;
        } else if (rhsOk) {
          return rhs.type;
        } else {
          return anyType;
        }
      }
      case "/": {
        checkExprType(lhs, "number");
        checkExprType(rhs, "number");
        return floatType;
      }
    }
  }

  function getUnaryOperatorType(op: UnaryOperator, expr: Expr): Type {
    switch (op) {
      case "not": {
        checkExprType(expr, booleanType);
        return booleanType;
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
