import _ from "lodash";
import { match } from "ts-pattern";

import {
  Action,
  ActionAtomSet,
  ActionAtomVirtualInput,
  ActionHook,
  AnonymousQuery,
  BinaryOperator,
  Computed,
  Definition,
  DeleteAction,
  Endpoint,
  Entrypoint,
  ExecuteAction,
  Expr,
  FetchAction,
  Field,
  FieldValidationHook,
  Hook,
  IdentifierRef,
  Model,
  ModelAction,
  ModelAtom,
  ModelHook,
  Populate,
  Populator,
  Query,
  Reference,
  Relation,
  Runtime,
  Select,
  UnaryOperator,
  Validator,
} from "./ast/ast";
import {
  Type,
  TypeCardinality,
  TypeCategory,
  addTypeModifier,
  getTypeCardinality,
  getTypeModel,
  isExpectedType,
  primitiveTypes,
  removeTypeModifier,
  unknownType,
} from "./ast/type";
import { CompilerError, ErrorCode } from "./compilerError";

import { kindFilter, kindFind, patternFind } from "@src/common/patternFilter";

type Scope = {
  environment: "model" | "entrypoint";
  model: string | undefined;
  context: ScopeContext;
};
type ScopeContext = {
  [P in string]?: Type;
};

export function resolve(definition: Definition) {
  const errors: CompilerError[] = [];

  const models = kindFilter(definition, "model");

  function resolveDefinition(definition: Definition) {
    definition.forEach((d) =>
      match(d)
        .with({ kind: "model" }, resolveModel)
        .with({ kind: "entrypoint" }, (entrypoint) =>
          resolveEntrypoint(entrypoint, null, {
            environment: "entrypoint",
            model: undefined,
            context: {},
          })
        )
        .with({ kind: "populator" }, resolvePopulator)
        .with({ kind: "runtime" }, () => undefined)
        .with({ kind: "authenticator" }, () => undefined)
        .exhaustive()
    );
  }

  function resolveModel(model: Model) {
    model.atoms.forEach((a) => resolveModelAtom(model, a));
  }

  function resolveModelAtom(model: Model, atom: ModelAtom) {
    if (atom.resolved) return;
    atom.resolved = true;

    const scope: Scope = { environment: "model", model: model.name.text, context: {} };
    match(atom)
      .with({ kind: "field" }, (field) => resolveField(model, field))
      .with({ kind: "reference" }, (reference) => resolveReference(model, reference))
      .with({ kind: "relation" }, (relation) => resolveRelation(model, relation))
      .with({ kind: "query" }, (query) => resolveQuery(query, scope))
      .with({ kind: "computed" }, (computed) => resolveComputed(model, computed))
      .with({ kind: "hook" }, (hook) => resolveModelHook(hook, scope))
      .exhaustive();
  }

  function resolveField(model: Model, field: Field) {
    kindFilter(field.atoms, "validate").map((validate) =>
      validate.validators.forEach(resolveValidator)
    );

    field.ref = {
      kind: "modelAtom",
      atomKind: "field",
      name: field.name.text,
      model: model.name.text,
      unique: !!kindFind(field.atoms, "unique"),
    };

    let type = unknownType;
    const typeAtom = kindFind(field.atoms, "type");
    if (typeAtom) {
      const typeText = typeAtom.identifier.text;
      if (typeText !== "null" && _.includes(primitiveTypes, typeText)) {
        type = { kind: "primitive", primitiveKind: typeText } as Type;
      } else {
        errors.push(new CompilerError(typeAtom.identifier.token, ErrorCode.UnexpectedFieldType));
      }
    }
    const nullable = kindFind(field.atoms, "nullable");
    if (nullable) type = addTypeModifier(type, "nullable");
    field.type = type;
  }

  function resolveValidator(validator: Validator) {
    match(validator)
      .with({ kind: "hook" }, resolveFieldValidationHook)
      .with({ kind: "builtin" }, () => undefined) // TODO: do nothing?
      .exhaustive();
  }

  function resolveReference(model: Model, reference: Reference) {
    const to = kindFind(reference.atoms, "to");
    if (to) resolveModelRef(to.identifier);

    reference.ref = {
      kind: "modelAtom",
      atomKind: "reference",
      name: reference.name.text,
      model: model.name.text,
      unique: !!kindFind(reference.atoms, "unique"),
    };

    if (to?.identifier.ref.kind === "model") {
      let type: Type = { kind: "model", model: to.identifier.ref.model };
      const nullable = kindFind(reference.atoms, "nullable");
      if (nullable) type = addTypeModifier(type, "nullable");
      reference.type = type;
    }
  }

  function resolveRelation(model: Model, relation: Relation) {
    const from = kindFind(relation.atoms, "from");
    if (from) resolveModelRef(from.identifier);
    const fromModel = from?.identifier.ref.kind === "model" ? from.identifier.ref.model : undefined;

    const through = kindFind(relation.atoms, "through");
    if (through) resolveModelAtomRef(through.identifier, fromModel, "reference");

    relation.ref = {
      kind: "modelAtom",
      atomKind: "relation",
      name: relation.name.text,
      model: model.name.text,
      unique: false,
    };

    if (from?.identifier.ref.kind === "model") {
      const type: Type = { kind: "model", model: from.identifier.ref.model };
      const isOne =
        through && through.identifier.ref.kind === "modelAtom" && through.identifier.ref.unique;
      relation.type = addTypeModifier(type, isOne ? "nullable" : "collection");
    }
  }

  function resolveQuery(query: Query | AnonymousQuery, parentScope: Scope) {
    let currentModel: string | undefined;
    const scope = _.cloneDeep(parentScope);
    let cardinality = "one" as TypeCardinality;

    const from = kindFind(query.atoms, "from");
    if (from) {
      resolveIdentifierRefPath(from.identifierPath, parentScope, true);
      from.identifierPath.forEach((identifier) => {
        currentModel = getTypeModel(identifier.type);
        cardinality = getTypeCardinality(identifier.type, cardinality);
        identifier.type = removeTypeModifier(identifier.type, "collection", "nullable");
      });

      if (from.as) {
        from.as.identifierPath.forEach((as, i) => {
          const target = from.identifierPath[i];
          as.ref = target.ref;
          as.type = target.type;
          scope.context[as.identifier.text] = as.type;
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
      switch (aggregate?.aggregate) {
        case "one":
          query.type = baseType;
          break;
        case "first":
          query.type = cardinality === "one" ? baseType : addTypeModifier(baseType, "nullable");
          break;
        case "count":
          query.type = { kind: "primitive", primitiveKind: "integer" };
          break;
        default:
          query.type = cardinality === "one" ? baseType : addTypeModifier(baseType, cardinality);
          break;
      }

      if (query.kind === "query") {
        query.ref = {
          kind: "modelAtom",
          atomKind: "query",
          name: query.name.text,
          model: currentModel,
          unique: false,
        };
      }
    }
  }

  function selectToStruct(select: Select): Type {
    const type: Type = { kind: "struct", types: {} };

    select.forEach(({ target, select }) => {
      let name: string;
      let targetType: Type;
      if (target.kind === "short") {
        name = target.name.identifier.text;
      } else {
        name = target.name.text;
      }
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
          targetType = { kind: "primitive", primitiveKind: "integer" };
        }
      }
      type.types[name] = targetType;
    });

    return type;
  }

  function resolveComputed(model: Model, computed: Computed) {
    resolveExpression(computed.expr, { environment: "model", model: model.name.text, context: {} });

    computed.ref = {
      kind: "modelAtom",
      atomKind: "computed",
      name: computed.name.text,
      model: model.name.text,
      unique: false,
    };

    computed.type = computed.expr.type;
  }

  // passing null as a parent model means this is root model, while undefined means it is unresolved
  function resolveEntrypoint(
    entrypoint: Entrypoint,
    parentModel: string | undefined | null,
    scope: Scope
  ) {
    let currentModel: string | undefined;

    const target = kindFind(entrypoint.atoms, "target");
    if (target) {
      if (parentModel === null) {
        resolveModelRef(target.identifier);
        currentModel =
          target.identifier.ref.kind === "model" ? target.identifier.ref.model : undefined;
      } else {
        resolveModelAtomRef(target.identifier, parentModel, "relation");
        target.identifier.type = removeTypeModifier(
          target.identifier.type,
          "collection",
          "nullable"
        );
        currentModel = getTypeModel(target.identifier.type);
      }
      if (target.as) {
        target.as.identifier.ref = target.identifier.ref;
        target.as.identifier.type = target.identifier.type;
        scope.context[target.as.identifier.identifier.text] = target.identifier.type;
      }
    }

    const identifyWith = kindFind(entrypoint.atoms, "identifyWith");
    if (identifyWith) resolveModelAtomRef(identifyWith.identifier, currentModel, "field");

    const response = kindFind(entrypoint.atoms, "response");
    if (response) resolveSelect(response.select, currentModel, scope);

    const authorize = kindFind(entrypoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, { kind: "primitive", primitiveKind: "boolean" });
    }

    kindFilter(entrypoint.atoms, "endpoint").forEach((endpoint) =>
      resolveEndpoint(endpoint, currentModel, { ..._.cloneDeep(scope), model: currentModel })
    );

    kindFilter(entrypoint.atoms, "entrypoint").forEach((entrypoint) =>
      resolveEntrypoint(entrypoint, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveEndpoint(endpoint: Endpoint, model: string | undefined, scope: Scope) {
    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.forEach((action) => {
        resolveAction(action, model, scope);
      });
    }

    const authorize = kindFind(endpoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, { kind: "primitive", primitiveKind: "boolean" });
    }
  }

  function resolveAction(action: Action, parentModel: string | undefined, scope: Scope) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, (action) =>
        resolveModelAction(action, parentModel, scope)
      )
      .with({ kind: "delete" }, (action) => resolveDeleteAction(action, scope))
      .with({ kind: "execute" }, (action) => resolveExecuteAction(action, scope))
      .with({ kind: "fetch" }, (action) => resolveFetchAction(action, scope))
      .exhaustive();
  }

  function resolveModelAction(action: ModelAction, parentModel: string | undefined, scope: Scope) {
    let currentModel: string | undefined = parentModel;
    if (action.target) {
      resolveIdentifierRefPath(action.target, scope, action.kind === "create");
      const lastTarget = action.target.at(-1);
      currentModel = getTypeModel(lastTarget?.type);
      if (lastTarget && action.as) {
        action.as.identifier.ref = lastTarget.ref;
        action.as.identifier.type = removeTypeModifier(lastTarget.type, "collection", "nullable");
        scope.context[action.as.identifier.identifier.text] = action.as.identifier.type;
      }
    }

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
          resolveModelAtomRef(through, getTypeModel(target.type), "field");
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
  }

  function resolveDeleteAction(action: DeleteAction, scope: Scope) {
    if (action.target) {
      resolveIdentifierRefPath(action.target, scope, true);
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
      // TODO: for now, we magicaly get non modified type from fetch query
      scope.context[action.name.text] = removeTypeModifier(query.type, "collection", "nullable");
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
    let type = unknownType;
    virtualInput.ref = { kind: "context" };
    const typeAtom = kindFind(virtualInput.atoms, "type");
    if (typeAtom) {
      const typeText = typeAtom.identifier.text;
      if (typeText !== "null" && _.includes(primitiveTypes, typeText)) {
        type = { kind: "primitive", primitiveKind: typeText } as Type;
      } else {
        errors.push(new CompilerError(typeAtom.identifier.token, ErrorCode.VirtualInputType));
      }
    }
    if (kindFind(virtualInput.atoms, "nullable")) {
      type = addTypeModifier(type, "nullable");
    }
    virtualInput.type = type;
    scope.context[virtualInput.name.text] = type;
  }

  function resolvePopulator(populator: Populator) {
    populator.atoms.forEach((populate) =>
      resolvePopulate(populate, null, { environment: "entrypoint", model: undefined, context: {} })
    );
  }

  function resolvePopulate(
    populate: Populate,
    parentModel: string | undefined | null,
    scope: Scope
  ) {
    let currentModel: string | undefined;

    const target = kindFind(populate.atoms, "target");
    if (target) {
      if (parentModel === null) {
        resolveModelRef(target.identifier);
        currentModel =
          target.identifier.ref.kind === "model" ? target.identifier.ref.model : undefined;
      } else {
        resolveModelAtomRef(target.identifier, parentModel, "relation");
        currentModel = getTypeModel(target.identifier.type);
      }
      scope.model = currentModel;
      if (target.as) {
        target.as.identifier.ref = target.identifier.ref;
        target.as.identifier.type = target.identifier.type;
        scope.context[target.as.identifier.identifier.text] = target.identifier.type;
      }
    }

    kindFilter(populate.atoms, "repeat").forEach((repeater) => {
      if (repeater.repeater.name) {
        scope.context[repeater.repeater.name.text] = {
          kind: "struct",
          types: {
            start: { kind: "primitive", primitiveKind: "integer" },
            end: { kind: "primitive", primitiveKind: "integer" },
            current: { kind: "primitive", primitiveKind: "integer" },
          },
        };
      }
    });

    kindFilter(populate.atoms, "set").forEach((set) =>
      resolveActionAtomSet(set, currentModel, scope)
    );

    kindFilter(populate.atoms, "populate").forEach((populate) =>
      resolvePopulate(populate, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveModelHook(hook: ModelHook, scope: Scope) {
    resolveHook(hook);
    kindFilter(hook.atoms, "arg_query").forEach(({ query }) => resolveQuery(query, scope));
    kindFilter(hook.atoms, "arg_expr").forEach(({ expr }) => resolveExpression(expr, scope));
    if (scope.model) {
      hook.ref = {
        kind: "modelAtom",
        atomKind: "hook",
        name: hook.name.text,
        model: scope.model,
        unique: false,
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

  function resolveHook(hook: Hook<boolean, boolean>) {
    const source = kindFind(hook.atoms, "source");
    if (source) {
      const runtimes = kindFilter(definition, "runtime");
      const runtimeAtom = kindFind(hook.atoms, "runtime");

      let runtime: Runtime | undefined = undefined;
      if (runtimeAtom) {
        runtime = runtimes.find((r) => r.name.text === runtimeAtom.identifier.text);
      } else {
        runtime = runtimes.find((r) => kindFind(r.atoms, "default"));
      }

      if (runtime) {
        const runtimePath = kindFind(runtime.atoms, "sourcePath")?.path.value;
        if (runtimePath) {
          source.runtimePath = runtimePath;
        }
      }
    }
  }

  function resolveSelect(select: Select, model: string | undefined, scope: Scope) {
    select.forEach(({ target, select }) => {
      let type: Type;
      if (target.kind === "short") {
        const parentType: Type = model ? { kind: "model", model } : unknownType;
        resolveNextRef(target.name, parentType);
        type = target.name.type;
      } else {
        resolveIdentifierRefPath(target.identifierPath, scope);
        type = target.identifierPath.at(-1)?.type ?? unknownType;
      }
      if (select) {
        if (type.kind !== "model") {
          const errorToken =
            target.kind === "short"
              ? target.name.identifier.token
              : target.identifierPath.at(-1)!.identifier.token;
          errors.push(new CompilerError(errorToken, ErrorCode.SelectCantNest));
          return;
        }
        const name = target.kind === "short" ? target.name.identifier.text : target.name.text;
        const model = getTypeModel(type);
        const nestedScope: Scope =
          target.kind === "short"
            ? { ..._.cloneDeep(scope), model }
            : { ..._.cloneDeep(scope), context: { ...scope.context, [name]: type } };
        resolveSelect(select, model, nestedScope);
      }
    });
  }

  function resolveExpression(expr: Expr, scope: Scope) {
    match(expr)
      .with({ kind: "binary" }, (binary) => {
        resolveExpression(binary.lhs, scope);
        resolveExpression(binary.rhs, scope);
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
        resolveIdentifierRefPath(path.path, scope);
        path.type = path.path.at(-1)?.type ?? unknownType;
      })
      .with({ kind: "literal" }, (literal) => {
        literal.type = { kind: "primitive", primitiveKind: literal.literal.kind };
      })
      .with({ kind: "function" }, (function_) => {
        function_.args.forEach((arg) => resolveExpression(arg, scope));
      })
      .exhaustive();
  }

  function resolveIdentifierRefPath(path: IdentifierRef[], scope: Scope, allowGlobal = false) {
    if (path.length <= 0) return;
    const [head, ...tail] = path;
    const headName = head.identifier.text;

    // try to resolve from model scope
    if (scope.model && !tryResolveNextRef(head, { kind: "model", model: scope.model })) {
      resolveRefPath(tail, head.type);
      return;
    }

    // try to resolve from context
    const context = scope.context[headName];
    if (context) {
      head.ref = { kind: "context" };
      head.type = context;
      resolveRefPath(tail, head.type);
      return;
    }

    // try to resolve from global models, if global is allowed
    if (allowGlobal && findModel(headName)) {
      head.ref = { kind: "model", model: headName };
      head.type = addTypeModifier({ kind: "model", model: headName }, "collection");
      resolveRefPath(tail, head.type);
      return;
    }

    // TODO: what is the @auth type/model??? we don't resolve it this pass
    if (headName === "@auth") {
      return;
    }
    if (headName === "@requestAuthToken") {
      head.ref = { kind: "context" };
      head.type = addTypeModifier({ kind: "primitive", primitiveKind: "string" }, "nullable");
      resolveRefPath(tail, head.type);
      return;
    }

    errors.push(new CompilerError(head.identifier.token, ErrorCode.CantFindNameInScope));
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
    const error = tryResolveNextRef(identifier, previousType);
    if (error) {
      errors.push(error);
      return false;
    }
    return true;
  }

  function tryResolveNextRef(
    identifier: IdentifierRef,
    previousType: Type
  ): CompilerError | undefined {
    const name = identifier.identifier.text;

    switch (previousType.kind) {
      case "model": {
        const model = findModel(previousType.model);
        if (!model) throw Error("Unexpected resolver error");

        const atom = patternFind(model.atoms, { name: { text: name } });

        // Id of a reference in model can be targeted
        if (atom) {
          resolveModelAtom(model, atom);
          identifier.ref = atom.ref;
          identifier.type = atom.type;
          return undefined;
        }

        if (name.endsWith("_id")) {
          const referenceAtom = patternFind(model.atoms, {
            name: { text: name.slice(0, -3) },
          });
          if (referenceAtom?.kind === "reference") {
            identifier.ref = {
              kind: "modelAtom",
              atomKind: "field",
              model: previousType.model,
              name,
              unique: false,
            };
            identifier.type = {
              kind: "primitive",
              primitiveKind: "integer",
            };
            return undefined;
          }
        }
        // Model id can be targeted
        if (name === "id") {
          identifier.ref = {
            kind: "modelAtom",
            atomKind: "field",
            model: previousType.model,
            name,
            unique: true,
          };
          identifier.type = {
            kind: "primitive",
            primitiveKind: "integer",
          };
          identifier.type;
          return undefined;
        }

        return new CompilerError(identifier.identifier.token, ErrorCode.CantResolveModelAtom);
      }
      case "struct": {
        const type = previousType.types[name];
        if (type) {
          identifier.ref = { kind: "context" };
          identifier.type = type;
          return undefined;
        } else {
          return new CompilerError(identifier.identifier.token, ErrorCode.CantResolveStructMember);
        }
      }
      case "collection":
      case "nullable": {
        const error = tryResolveNextRef(identifier, previousType.type);
        if (error) {
          return error;
        }
        identifier.type = addTypeModifier(identifier.type, previousType.kind);
        return undefined;
      }
      case "primitive":
        return new CompilerError(identifier.identifier.token, ErrorCode.TypeHasNoMembers);
      case "unknown":
        return undefined;
    }
  }

  function resolveModelRef(identifier: IdentifierRef) {
    const model = findModel(identifier.identifier.text);
    if (!model) {
      errors.push(new CompilerError(identifier.identifier.token, ErrorCode.CantResolveModel));
    } else {
      identifier.ref = { kind: "model", model: model.name.text };
      identifier.type = { kind: "model", model: model.name.text };
    }
  }

  function resolveModelAtomRef(
    identifier: IdentifierRef,
    model: string | undefined,
    ...kinds: ModelAtom["kind"][]
  ) {
    if (!model) return;
    resolveNextRef(identifier, { kind: "model", model });

    const resolvedKind =
      (identifier.ref.kind === "modelAtom" && identifier.ref.atomKind) || undefined;
    for (const kind of kinds) {
      if (kind === resolvedKind) {
        return;
      }
    }

    errors.push(
      new CompilerError(identifier.identifier.token, ErrorCode.CantResolveModelAtomWrongKind, {
        atom: resolvedKind,
        expected: kinds,
      })
    );
  }

  function findModel(name: string): Model | undefined {
    return patternFind(models, { name: { text: name } });
  }

  function getBinaryOperatorType(op: BinaryOperator, lhs: Expr, rhs: Expr): Type {
    const booleanType: Type = { kind: "primitive", primitiveKind: "boolean" };
    const integerType: Type = { kind: "primitive", primitiveKind: "integer" };
    const floatType: Type = { kind: "primitive", primitiveKind: "float" };

    switch (op) {
      case "or":
      case "and": {
        checkExprType(lhs, booleanType);
        checkExprType(rhs, booleanType);
        return booleanType;
      }
      case "is":
      case "is not": {
        checkExprType(rhs, lhs.type);
        return booleanType;
      }
      case "in":
      case "not in": {
        checkExprType(rhs, addTypeModifier(lhs.type, "collection"));
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
        if (lhs.type.kind === "unknown") return unknownType;
        if (rhs.type.kind === "unknown") return unknownType;
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
          return unknownType;
        }
      }
      case "-":
      case "*": {
        if (lhs.type.kind === "unknown") return unknownType;
        if (rhs.type.kind === "unknown") return unknownType;
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
          return unknownType;
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
    const booleanType: Type = { kind: "primitive", primitiveKind: "boolean" };

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

  resolveDefinition(definition);

  return errors;
}
