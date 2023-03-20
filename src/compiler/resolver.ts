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
  hasTypeModifier,
  isExpectedType,
  primitiveTypes,
  removeTypeModifier,
  unknownType,
} from "./ast/type";
import { CompilerError, ErrorCode } from "./compilerError";

import { kindFilter, kindFind, patternFind } from "@src/common/patternFilter";

type ScopeDb =
  | { kind: "querySimple"; model: string | undefined }
  | { kind: "queryAlias"; models: { model: string | undefined; as: string }[] };

type ScopeCode = {
  kind: "entrypoint";
  model: string | undefined;
  models: { model: string | undefined; as: string }[];
  context: ScopeContext;
};
type ScopeContext = {
  [P in string]?: Type;
};

type Scope = ScopeDb | ScopeCode;

export function resolve(definition: Definition) {
  const errors: CompilerError[] = [];

  const models = kindFilter(definition, "model");

  function resolveDefinition(definition: Definition) {
    definition.forEach((d) =>
      match(d)
        .with({ kind: "model" }, resolveModel)
        .with({ kind: "entrypoint" }, (entrypoint) =>
          resolveEntrypoint(entrypoint, null, {
            kind: "entrypoint",
            model: undefined,
            models: [],
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

    match(atom)
      .with({ kind: "field" }, (field) => resolveField(model, field))
      .with({ kind: "reference" }, (reference) => resolveReference(model, reference))
      .with({ kind: "relation" }, (relation) => resolveRelation(model, relation))
      .with({ kind: "query" }, (query) => resolveQuery(model, query))
      .with({ kind: "computed" }, (computed) => resolveComputed(model, computed))
      .with({ kind: "hook" }, (hook) => resolveModelHook(model, hook))
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
    const unique = kindFind(field.atoms, "unique");
    if (unique) type = addTypeModifier(type, "unique");
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
    };

    if (to?.identifier.ref.kind === "model") {
      let type: Type = { kind: "model", model: to.identifier.ref.model };
      const nullable = kindFind(reference.atoms, "nullable");
      if (nullable) type = addTypeModifier(type, "nullable");
      const unique = kindFind(reference.atoms, "unique");
      if (unique) type = addTypeModifier(type, "unique");
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
    };

    if (from?.identifier.ref.kind === "model") {
      const type: Type = { kind: "model", model: from.identifier.ref.model };
      const isOne = through ? hasTypeModifier(through.identifier.type, "unique") : false;
      relation.type = addTypeModifier(type, isOne ? "nullable" : "collection");
    }
  }

  function resolveQuery(model: Model, query: Query | AnonymousQuery) {
    let currentModel: string | undefined;
    let scope: ScopeDb = { kind: "querySimple", model: undefined };
    let cardinality = "one" as TypeCardinality;

    const from = kindFind(query.atoms, "from");
    if (from) {
      // TODO: allow global queries
      currentModel = model.name.text;
      from.identifierPath.map((identifier) => {
        resolveModelAtomRef(identifier, currentModel, "reference", "relation", "query");

        currentModel = getTypeModel(identifier.type);
        cardinality = getTypeCardinality(identifier.type, cardinality);
        identifier.type = removeTypeModifier(
          removeTypeModifier(identifier.type, "nullable"),
          "collection"
        );

        return identifier;
      });

      if (from.as) {
        const models = from.as.identifierPath.map((as, i) => {
          const target = from.identifierPath[i];
          as.ref = target.ref;
          as.type = target.type;
          const model = getTypeModel(as.type);
          return { model, as: as.identifier.text };
        });
        scope = { kind: "queryAlias", models };
      } else {
        scope = { kind: "querySimple", model: currentModel };
      }
    } else if (query.kind === "anonymousQuery") {
      currentModel = model.name.text;
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

    if (query.kind === "anonymousQuery") return;

    if (currentModel) {
      query.ref = {
        kind: "modelAtom",
        atomKind: "query",
        name: query.name.text,
        model: currentModel,
      };

      const baseType: Type = { kind: "model", model: currentModel };

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
    }
  }

  function resolveComputed(model: Model, computed: Computed) {
    resolveExpression(computed.expr, {
      kind: "querySimple",
      environment: "db",
      model: model.name.text,
    });

    computed.ref = {
      kind: "modelAtom",
      atomKind: "computed",
      name: computed.name.text,
      model: model.name.text,
    };

    computed.type = computed.expr.type;
  }

  // passing null as a parent model means this is root model, while undefined means it is unresolved
  function resolveEntrypoint(
    entrypoint: Entrypoint,
    parentModel: string | undefined | null,
    scope: ScopeCode
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
        currentModel = getTypeModel(target.identifier.type);
      }
      if (target.as) {
        target.as.identifier.ref = target.identifier.ref;
        target.as.identifier.type = target.identifier.type;
        scope.models.push({ model: currentModel, as: target.as.identifier.identifier.text });
      }
    }

    const identifyWith = kindFind(entrypoint.atoms, "identifyWith");
    if (identifyWith) resolveModelAtomRef(identifyWith.identifier, currentModel, "field");

    const response = kindFind(entrypoint.atoms, "response");
    if (response) resolveSelect(response.select, currentModel, scope);

    const authorize = kindFind(entrypoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      if (!isExpectedType(authorize.expr.type, { kind: "primitive", primitiveKind: "boolean" })) {
        errors.push(new CompilerError(authorize.keyword, ErrorCode.UnexpectedType));
      }
    }

    kindFilter(entrypoint.atoms, "endpoint").forEach((endpoint) =>
      resolveEndpoint(endpoint, currentModel, { ..._.cloneDeep(scope), model: currentModel })
    );

    kindFilter(entrypoint.atoms, "entrypoint").forEach((entrypoint) =>
      resolveEntrypoint(entrypoint, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveEndpoint(endpoint: Endpoint, model: string | undefined, scope: ScopeCode) {
    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.forEach((action) => {
        resolveAction(action, model, scope);
      });
    }

    const authorize = kindFind(endpoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      if (!isExpectedType(authorize.expr.type, { kind: "primitive", primitiveKind: "boolean" })) {
        errors.push(new CompilerError(authorize.keyword, ErrorCode.UnexpectedType));
      }
    }
  }

  function resolveAction(action: Action, parentModel: string | undefined, scope: ScopeCode) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, (action) =>
        resolveModelAction(action, parentModel, scope)
      )
      .with({ kind: "delete" }, (action) => resolveDeleteAction(action, scope))
      .with({ kind: "execute" }, (action) => resolveExecuteAction(action, scope))
      .with({ kind: "fetch" }, (action) => resolveFetchAction(action, scope))
      .exhaustive();
  }

  function resolveModelAction(
    action: ModelAction,
    parentModel: string | undefined,
    scope: ScopeCode
  ) {
    let currentModel: string | undefined = parentModel;
    if (action.target) {
      resolveIdentifierRefPath(action.target, scope);
      const lastTarget = action.target.at(-1);
      currentModel = getTypeModel(lastTarget?.type);
      if (lastTarget && action.as) {
        action.as.identifier.ref = lastTarget.ref;
        action.as.identifier.type = lastTarget.type;
        scope.models.push({ model: currentModel, as: action.as.identifier.identifier.text });
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

  function resolveDeleteAction(action: DeleteAction, scope: ScopeCode) {
    if (action.target) {
      resolveIdentifierRefPath(action.target, scope);
    }
  }

  function resolveExecuteAction(action: ExecuteAction, scope: ScopeCode) {
    kindFilter(action.atoms, "virtualInput").forEach((virtualInput) =>
      resolveActionAtomVirtualInput(virtualInput, scope)
    );
    const hook = kindFind(action.atoms, "hook");
    if (hook) resolveActionHook(hook, scope);
  }

  function resolveFetchAction(action: FetchAction, scope: ScopeCode) {
    kindFilter(action.atoms, "virtualInput").forEach((virtualInput) =>
      resolveActionAtomVirtualInput(virtualInput, scope)
    );
    const query = kindFind(action.atoms, "anonymousQuery");
    const model = scope.model ? findModel(scope.model) : undefined;
    if (query && model) resolveQuery(model, query);
  }

  function resolveActionAtomSet(set: ActionAtomSet, model: string | undefined, scope: ScopeCode) {
    resolveModelAtomRef(set.target, model, "field", "reference");
    match(set.set)
      .with({ kind: "hook" }, (hook) => resolveActionHook(hook, scope))
      .with({ kind: "expr" }, ({ expr }) => {
        resolveExpression(expr, scope);
        if (!isExpectedType(expr.type, set.target.type)) {
          errors.push(new CompilerError(set.target.identifier.token, ErrorCode.UnexpectedType));
        }
      })
      .exhaustive();
  }

  function resolveActionAtomVirtualInput(virtualInput: ActionAtomVirtualInput, scope: ScopeCode) {
    let type = unknownType;
    virtualInput.ref = { kind: "runtime", path: virtualInput.name.text };
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
      resolvePopulate(populate, null, {
        kind: "entrypoint",
        model: undefined,
        models: [],
        context: {},
      })
    );
  }

  function resolvePopulate(
    populate: Populate,
    parentModel: string | undefined | null,
    scope: ScopeCode
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
      if (target.as) {
        target.as.identifier.ref = target.identifier.ref;
        target.as.identifier.type = target.identifier.type;
        scope.models.push({ model: currentModel, as: target.as.identifier.identifier.text });
      }
    }

    kindFilter(populate.atoms, "set").forEach((set) =>
      resolveActionAtomSet(set, currentModel, scope)
    );

    kindFilter(populate.atoms, "populate").forEach((populate) =>
      resolvePopulate(populate, currentModel, _.cloneDeep(scope))
    );
  }

  function resolveModelHook(model: Model, hook: ModelHook) {
    resolveHook(hook);
    kindFilter(hook.atoms, "arg_query").forEach(({ query }) => resolveQuery(model, query));
    hook.ref = {
      kind: "modelAtom",
      atomKind: "hook",
      name: hook.name.text,
      model: model.name.text,
    };
  }

  function resolveFieldValidationHook(hook: FieldValidationHook) {
    resolveHook(hook);
  }

  function resolveActionHook(hook: ActionHook, scope: ScopeCode) {
    resolveHook(hook);
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
      let nestedModel: string | undefined;
      if (target.kind === "short") {
        resolveIdentifierRefPathForModel([target.name], model, "model");
        nestedModel = getTypeModel(target.name.type);
      } else {
        resolveIdentifierRefPath(target.identifierPath, scope);
        nestedModel = getTypeModel(target.identifierPath.at(-1)?.type);
      }
      if (select) {
        if (!nestedModel) {
          const errorToken =
            target.kind === "short"
              ? target.name.identifier.token
              : target.identifierPath.at(-1)!.identifier.token;
          errors.push(new CompilerError(errorToken, ErrorCode.SelectCantNest));
          return;
        }
        const as = target.kind === "short" ? target.name.identifier.text : target.name.text;
        const nestedScope: Scope =
          scope.kind === "querySimple"
            ? { kind: "querySimple", model: nestedModel }
            : {
                kind: "queryAlias",
                models: [...scope.models, { model: nestedModel, as }],
              };
        resolveSelect(select, nestedModel, nestedScope);
      }
    });
  }

  function resolveExpression<s extends Scope, k extends s extends ScopeDb ? "db" : "code">(
    expr: Expr<k>,
    scope: s
  ) {
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

  function resolveIdentifierRefPath(path: IdentifierRef[], scope: Scope) {
    switch (scope.kind) {
      case "entrypoint": {
        const [head, ...tail] = path;

        const type = scope.context[head.identifier.text];
        if (type) {
          head.ref = { kind: "runtime", path: head.identifier.text };
          head.type = type;
          return;
        }

        let model: string | undefined = undefined;
        if (head.identifier.text === "@auth") {
          model = "@auth";
        } else {
          model = scope.models.find((model) => model.as === head.identifier.text)?.model;
        }

        if (model) {
          head.ref = { kind: "model", model };
          head.type = { kind: "model", model };
          resolveIdentifierRefPathForModel(tail, model, "entrypoint");
          return;
        }

        const contextType = tail.length === 0 ? scope.context[head.identifier.text] : undefined;
        if (contextType) {
          head.ref = { kind: "runtime", path: head.identifier.text };
          head.type = contextType;
          return;
        }

        if (scope.model) {
          resolveIdentifierRefPathForModel(path, scope.model, "entrypoint");
          return;
        }

        errors.push(new CompilerError(head.identifier.token, ErrorCode.CantResolveModel));
        return;
      }
      case "queryAlias": {
        const [head, ...tail] = path;
        const model = scope.models.find((model) => model.as === head.identifier.text)?.model;
        if (!model) {
          errors.push(new CompilerError(head.identifier.token, ErrorCode.CantResolveModel));
        } else {
          head.ref = { kind: "model", model };
          head.type = { kind: "model", model };
        }
        resolveIdentifierRefPathForModel(tail, model, "db");
        return;
      }
      case "querySimple": {
        resolveIdentifierRefPathForModel(path, scope.model, "db");
        return;
      }
    }
  }

  function resolveIdentifierRefPathForModel(
    path: IdentifierRef[],
    model: string | undefined,
    environment: "db" | "model" | "entrypoint"
  ) {
    let currentModel = model;
    path.forEach((identifier) => {
      const kinds: ModelAtom["kind"][] =
        environment === "db"
          ? ["field", "reference", "relation", "query", "computed"]
          : ["field", "reference", "relation", "query", "computed", "hook"];
      resolveModelAtomRef(identifier, currentModel, ...kinds);
      currentModel = getTypeModel(identifier.type);
    });
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
    modelName: string | undefined,
    ...kinds: ModelAtom["kind"][]
  ) {
    if (!modelName) return;
    const model = findModel(modelName);
    if (!model) return;

    const targetName = identifier.identifier.text;
    const atom = patternFind(model.atoms, { name: { text: targetName } });

    // Id of a reference in model can be targeted
    if (!atom && targetName.endsWith("_id") && kinds.includes("field")) {
      const referenceAtom = patternFind(model.atoms, { name: { text: targetName.slice(0, -3) } });
      if (referenceAtom?.kind === "reference") {
        identifier.ref = {
          kind: "modelAtom",
          atomKind: "field",
          model: modelName,
          name: targetName,
        };
        identifier.type = {
          kind: "primitive",
          primitiveKind: "integer",
        };
        return;
      }
    }
    // Model id can be targeted
    if (!atom && targetName === "id" && kinds.includes("field")) {
      identifier.ref = {
        kind: "modelAtom",
        atomKind: "field",
        model: modelName,
        name: targetName,
      };
      identifier.type = {
        kind: "primitive",
        primitiveKind: "integer",
      };
      return;
    }

    for (const kind of kinds) {
      if (kind === atom?.kind) {
        resolveModelAtom(model, atom);
        identifier.ref = atom.ref;
        identifier.type = atom.type;
        return;
      }
    }

    errors.push(new CompilerError(identifier.identifier.token, ErrorCode.CantResolveModelAtom));
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
        checkExpectedType(lhs.type, booleanType);
        checkExpectedType(rhs.type, booleanType);
        return booleanType;
      }
      case "is":
      case "is not": {
        checkExpectedType(rhs.type, lhs.type);
        return booleanType;
      }
      case "in":
      case "not in": {
        checkExpectedType(rhs.type, addTypeModifier(lhs.type, "collection"));
        return booleanType;
      }
      case "<":
      case "<=":
      case ">":
      case ">=": {
        checkExpectedType(lhs.type, "comparable");
        checkExpectedType(rhs.type, "comparable");
        if (isExpectedType(lhs.type, "number")) {
          checkExpectedType(rhs.type, "number");
        } else {
          checkExpectedType(rhs.type, lhs.type);
        }
        return booleanType;
      }
      case "+": {
        checkExpectedType(lhs.type, "addable");
        checkExpectedType(rhs.type, "addable");
        if (isExpectedType(lhs.type, "number")) {
          checkExpectedType(rhs.type, "number");
          if (isExpectedType(lhs.type, floatType) || isExpectedType(rhs.type, floatType)) {
            return floatType;
          } else {
            return integerType;
          }
        } else {
          checkExpectedType(rhs.type, lhs.type);
        }
        return booleanType;
      }
      case "-":
      case "*": {
        checkExpectedType(lhs.type, "number");
        checkExpectedType(rhs.type, "number");
        if (isExpectedType(lhs.type, floatType) || isExpectedType(rhs.type, floatType)) {
          return floatType;
        } else {
          return integerType;
        }
      }
      case "/": {
        checkExpectedType(lhs.type, "number");
        checkExpectedType(rhs.type, "number");
        return floatType;
      }
    }
  }

  function getUnaryOperatorType(op: UnaryOperator, expr: Expr): Type {
    const booleanType: Type = { kind: "primitive", primitiveKind: "boolean" };

    switch (op) {
      case "not": {
        checkExpectedType(expr.type, booleanType);
        return booleanType;
      }
    }
  }

  function checkExpectedType(type: Type, expected: Type | TypeCategory) {
    if (!isExpectedType(type, expected)) {
      // TODO: push error
      //errors.push(new CompilerError(tok, ErrorCode.UnexpectedType));
    }
  }

  resolveDefinition(definition);

  return errors;
}
