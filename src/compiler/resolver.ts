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
  DeleteAction,
  Endpoint,
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
  Ref,
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
import { authUserModelName } from "./plugins/authenticator";

import { FilteredByKind, kindFilter, kindFind } from "@src/common/kindFilter";

type Scope = {
  environment: "model" | "entrypoint";
  model: string | undefined;
  context: ScopeContext;
  typeGuard: TypeGuard;
};
type ScopeContext = { [P in string]?: { type: Type; ref: Ref } };

type TypeGuardOperation = "null" | "notNull";
// key is a path joined with '|'
type TypeGuard = { [P in string]?: TypeGuardOperation };

/**
 * Function that takes a boolean expression and creates new scope with more precise
 * types which assume that expression is `true`. This function only works if the `expr`
 * returns a boolean value.
 */
function addTypeGuard(expr: Expr, scope: Scope, isInverse: boolean): Scope {
  const typeGuard = createTypeGuard(expr, isInverse);
  // when adding a new type guard we use union
  return { ...scope, typeGuard: { ...scope.typeGuard, ...typeGuard } };
}

function createTypeGuard(expr: Expr, isInverse: boolean): TypeGuard {
  switch (expr.kind) {
    case "binary": {
      switch (expr.operator) {
        case "is": {
          const lhsOperation = getTypeGuardOperation(expr.lhs);
          const rhsOperation = getTypeGuardOperation(expr.rhs);
          if (lhsOperation && !rhsOperation) {
            return createTypeGuardFromPath(expr.rhs, modifyGuardOperation(lhsOperation, isInverse));
          } else if (!lhsOperation && rhsOperation) {
            return createTypeGuardFromPath(expr.lhs, modifyGuardOperation(rhsOperation, isInverse));
          }
          return {};
        }
        case "is not": {
          const lhsOperation = getTypeGuardOperation(expr.lhs);
          const rhsOperation = getTypeGuardOperation(expr.rhs);
          // use !isInverse because we want double inversion for is not
          if (lhsOperation && !rhsOperation) {
            return createTypeGuardFromPath(
              expr.rhs,
              modifyGuardOperation(lhsOperation, !isInverse)
            );
          } else if (!lhsOperation && rhsOperation) {
            return createTypeGuardFromPath(
              expr.lhs,
              modifyGuardOperation(rhsOperation, !isInverse)
            );
          }
          return {};
        }
        case "and": {
          const lhsGuard = createTypeGuard(expr.lhs, isInverse);
          const rhsGuard = createTypeGuard(expr.rhs, isInverse);
          // return union of guards
          return { ...lhsGuard, ...rhsGuard };
        }
        case "or": {
          const lhsGuard = createTypeGuard(expr.lhs, isInverse);
          const rhsGuard = createTypeGuard(expr.rhs, isInverse);
          // return intersection of guards
          const intersection: TypeGuard = {};
          Object.keys(lhsGuard).forEach((key) => {
            if (lhsGuard[key] && rhsGuard[key] && lhsGuard[key] === rhsGuard[key]) {
              intersection[key] = lhsGuard[key];
            }
          });
          return intersection;
        }
        default:
          return {};
      }
    }
    case "group":
      return createTypeGuard(expr.expr, isInverse);
    case "unary":
      return createTypeGuard(expr.expr, !isInverse);
    case "function":
    case "path":
    case "literal":
      // we are not smart enough to get a guard for a function
      // literal and path should be handled in a binary operation
      return {};
  }
}

function modifyGuardOperation(operation: TypeGuardOperation, isInverse: boolean) {
  return isInverse ? (operation === "null" ? "notNull" : "null") : operation;
}

function createTypeGuardFromPath(expr: Expr, guardOperation: TypeGuardOperation): TypeGuard {
  switch (expr.kind) {
    case "group":
      return createTypeGuardFromPath(expr.expr, guardOperation);
    case "path": {
      const result: TypeGuard = {};
      if (guardOperation === "notNull") {
        expr.path.forEach((identifier, i) => {
          if (identifier.type.kind !== "nullable") return;
          const path = expr.path
            .slice(0, i + 1)
            .map((i) => i.identifier.text)
            .join("|");
          result[path] = "notNull";
        });
      }
      if (guardOperation === "null" && expr.path.at(-1)?.type.kind === "nullable") {
        const path = expr.path.map((i) => i.identifier.text).join("|");
        result[path] = "null";
      }
      return result;
    }
    default:
      return {};
  }
}

function getTypeGuardOperation(expr: Expr): TypeGuardOperation | undefined {
  switch (expr.type.kind) {
    case "unknown":
    case "nullable":
      return undefined;
    case "primitive": {
      if (expr.type.primitiveKind === "null") return "null";
      else return "notNull";
    }
    default:
      return "notNull";
  }
}

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

  function getAllRuntimes(): Runtime[] {
    return kindFilter(getSumDocument(), "runtime");
  }

  function resolveDocument(document: GlobalAtom[]) {
    document.forEach((a) =>
      match(a)
        .with({ kind: "model" }, resolveModel)
        .with({ kind: "entrypoint" }, (entrypoint) =>
          resolveEntrypoint(entrypoint, null, {
            environment: "entrypoint",
            model: undefined,
            context: {},
            typeGuard: {},
          })
        )
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
    if (through) {
      resolveModelAtomRef(through.identifier, fromModel, "reference");
      const throughModel = getTypeModel(through.identifier.type);
      if (throughModel && throughModel !== model.name.text) {
        errors.push(
          new CompilerError(
            through.identifier.identifier.token,
            ErrorCode.ThroughReferenceHasIncorrectModel
          )
        );
      }
    }

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
    resolveExpression(computed.expr, {
      environment: "model",
      model: model.name.text,
      context: {},
      typeGuard: {},
    });

    computed.ref = {
      kind: "modelAtom",
      atomKind: "computed",
      name: computed.name.text,
      model: model.name.text,
      unique: false,
    };

    const exprType = computed.expr.type;
    if (
      exprType.kind === "primitive" ||
      (exprType.kind === "nullable" && exprType.type.kind === "primitive") ||
      exprType.kind === "unknown"
    ) {
      computed.type = computed.expr.type;
    } else {
      errors.push(
        new CompilerError(computed.keyword, ErrorCode.ComputedType, { exprType: exprType.kind })
      );
    }
  }

  // passing null as a parent model means this is root model, while undefined means it is unresolved
  function resolveEntrypoint(
    entrypoint: Entrypoint,
    parentModel: string | undefined | null,
    scope: Scope
  ) {
    let currentModel: string | undefined;
    let alias: IdentifierRef | undefined;

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
        target.as.identifier.ref = { kind: "context", contextKind: "entrypointTarget" };
        target.as.identifier.type = target.identifier.type;
        alias = target.as.identifier;
      }
    }

    const identifyWith = kindFind(entrypoint.atoms, "identifyWith");
    if (identifyWith) resolveModelAtomRef(identifyWith.identifier, currentModel, "field");

    const authorize = kindFind(entrypoint.atoms, "authorize");
    if (authorize) {
      resolveExpression(authorize.expr, scope);
      checkExprType(authorize.expr, { kind: "primitive", primitiveKind: "boolean" });
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
      checkExprType(authorize.expr, { kind: "primitive", primitiveKind: "boolean" });
      scope = addTypeGuard(authorize.expr, scope, false);
    }

    const action = kindFind(endpoint.atoms, "action");
    if (action) {
      action.actions.forEach((action) => {
        resolveAction(action, model, scope);
      });
    }

    const orderBy = kindFind(endpoint.atoms, "orderBy");
    if (orderBy) {
      // order by will be executed in query which means it will be used in "model" scope
      const scope: Scope = {
        environment: "model",
        model: model!,
        context: {},
        typeGuard: {},
      };

      orderBy.orderBy.forEach((orderBy) => resolveIdentifierRefPath(orderBy.identifierPath, scope));
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

      if (lastTarget && action.kind === "create") {
        switch (lastTarget.ref.kind) {
          case "unresolved":
          case "model":
            break;
          case "modelAtom": {
            if (lastTarget.ref.atomKind === "relation") {
              break;
            }
            // fall through
          }
          case "context":
            errors.push(
              new CompilerError(
                lastTarget.identifier.token,
                ErrorCode.UnsuportedTargetInCreateAction
              )
            );
        }
      }
    }
    if (currentModel && action.as) {
      action.as.identifier.ref = { kind: "model", model: currentModel };
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

    const allIdentifiers = action.atoms.flatMap((a) =>
      match(a)
        .with({ kind: "virtualInput" }, ({ name, ref, type }) => [{ identifier: name, ref, type }])
        .with({ kind: "set" }, ({ target }) => target)
        .with({ kind: "referenceThrough" }, ({ target }) => target)
        .with({ kind: "deny" }, ({ fields }) => (fields.kind === "all" ? [] : fields.fields))
        .with({ kind: "input" }, ({ fields }) => fields.map(({ field }) => field))
        .exhaustive()
    );
    const references = allIdentifiers.filter(
      ({ ref }) => ref.kind === "modelAtom" && ref.atomKind === "reference"
    );
    references.forEach((r) => {
      const idName = r.identifier.text + "_id";
      if (allIdentifiers.map((i) => i.identifier.text).includes(idName)) {
        errors.push(new CompilerError(r.identifier.token, ErrorCode.DuplicateActionAtom));
      }
    });
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
      const identifier: IdentifierRef = {
        identifier: action.name,
        ref: { kind: "context", contextKind: "fetch" },
        type: removeTypeModifier(query.type, "collection", "nullable"),
      };
      addToScope(scope, identifier);
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
    virtualInput.ref = { kind: "context", contextKind: "virtualInput" };
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
    const identifier: IdentifierRef = {
      identifier: virtualInput.name,
      ref: virtualInput.ref,
      type,
    };
    addToScope(scope, identifier);
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
    let currentModel: string | undefined;
    let through: string | undefined;

    const target = kindFind(populate.atoms, "target");
    if (target) {
      if (parentModel === null) {
        resolveModelRef(target.identifier);
        currentModel =
          target.identifier.ref.kind === "model" ? target.identifier.ref.model : undefined;
      } else {
        const relation = resolveModelAtomRef(target.identifier, parentModel, "relation");
        if (relation) {
          through = kindFind(relation.atoms, "through")?.identifier.identifier.text;
        }
        currentModel = getTypeModel(target.identifier.type);
      }
      scope.model = currentModel;
      if (target.as) {
        target.as.identifier.ref = { kind: "context", contextKind: "populateTarget" };
        target.as.identifier.type = target.identifier.type;
        addToScope(scope, target.as.identifier);
      }
    }

    kindFilter(populate.atoms, "repeat").forEach((repeater) => {
      if (repeater.repeater.name) {
        const type: Type = {
          kind: "struct",
          types: {
            start: { kind: "primitive", primitiveKind: "integer" },
            end: { kind: "primitive", primitiveKind: "integer" },
            current: { kind: "primitive", primitiveKind: "integer" },
          },
        };
        const identifier: IdentifierRef = {
          identifier: repeater.repeater.name,
          ref: { kind: "context", contextKind: "repeater" },
          type,
        };
        addToScope(scope, identifier);
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
              const isSet = target.identifier.text === a.name.text;
              if (!isSet && a.kind === "reference") {
                return target.identifier.text === a.name.text + "_id";
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
      const runtimes = kindFilter(getAllRuntimes(), "runtime");
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
        const model = getTypeModel(type);
        if (!model) {
          const errorToken =
            target.kind === "short"
              ? target.name.identifier.token
              : target.identifierPath.at(-1)!.identifier.token;
          errors.push(new CompilerError(errorToken, ErrorCode.SelectCantNest));
          return;
        }
        const nestedScope = _.cloneDeep(scope);
        if (target.kind === "short") {
          nestedScope.model = model;
        } else {
          const identifier: IdentifierRef = {
            identifier: target.name,
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
    const context = scope.context[headName];

    // try to resolve from model scope
    if (scope.model && !tryResolveNextRef(head, { kind: "model", model: scope.model })) {
      // don't set ref and type because it is set in tryResolveNextRef
    }
    // try to resolve from context
    else if (context) {
      head.ref = context.ref;
      head.type = context.type;
    }
    // try to resolve from global models, if global is allowed
    else if (allowGlobal && findModel(headName)) {
      head.ref = { kind: "model", model: headName };
      head.type = addTypeModifier({ kind: "model", model: headName }, "collection");
    }
    // special case, try to resolve @auth
    else if (headName === "@auth") {
      const model = findModel(authUserModelName);
      if (!model) {
        // fail resolve
        errors.push(new CompilerError(head.identifier.token, ErrorCode.CantResolveModel));
        return;
      } else {
        head.ref = { kind: "model", model: model.name.text };
        head.type = addTypeModifier({ kind: "model", model: model.name.text }, "nullable");
      }
    }
    // simple nullable string, we don't check if auth plugin is present for this for now
    else if (headName === "@requestAuthToken") {
      head.ref = { kind: "context", contextKind: "authToken" };
      head.type = addTypeModifier({ kind: "primitive", primitiveKind: "string" }, "nullable");
    } else {
      // fail resolve
      errors.push(
        new CompilerError(head.identifier.token, ErrorCode.CantFindNameInScope, { name: headName })
      );
      return;
    }

    // resolve rest of the path
    resolveRefPath(tail, head.type);

    // go through the path and set more precise type from current type guards
    path.forEach((identifier, i) => {
      const key = path
        .slice(0, i + 1)
        .map((i) => i.identifier.text)
        .join("|");
      const typeGuardOperation = scope.typeGuard[key];
      if (typeGuardOperation === "notNull") {
        identifier.type = removeTypeModifier(identifier.type, "nullable");
      } else if (typeGuardOperation === "null") {
        identifier.type = { kind: "primitive", primitiveKind: "null" };
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
    switch (previousType.kind) {
      case "model": {
        const result = tryResolveModelAtomRef(identifier, previousType.model);
        if (result instanceof CompilerError) return result;
        return undefined;
      }
      case "struct": {
        const type = previousType.types[identifier.identifier.text];
        if (type) {
          identifier.ref = { kind: "context", contextKind: "struct" };
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

  function tryResolveModelAtomRef(
    identifier: IdentifierRef,
    modelName: string
  ): ModelAtom | undefined | CompilerError {
    const model = findModel(modelName);
    if (!model) throw Error("Unexpected resolver error");
    const name = identifier.identifier.text;

    const atom = model.atoms.find((m) => m.name.text === name);

    // Id of a reference in model can be targeted
    if (atom) {
      resolveModelAtom(model, atom);
      identifier.ref = atom.ref;
      identifier.type = atom.type;
      return atom;
    }

    if (name.endsWith("_id")) {
      const referenceAtom = model.atoms.find((m) => m.name.text === name.slice(0, -3));
      if (referenceAtom?.kind === "reference") {
        identifier.ref = {
          kind: "modelAtom",
          atomKind: "field",
          model: model.name.text,
          name,
          unique: false,
        };
        const baseType: Type = { kind: "primitive", primitiveKind: "integer" };
        identifier.type =
          referenceAtom.type.kind === "nullable" ? addTypeModifier(baseType, "nullable") : baseType;
        return undefined;
      }
    }
    // Model id can be targeted
    if (name === "id") {
      identifier.ref = {
        kind: "modelAtom",
        atomKind: "field",
        model: model.name.text,
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

  function resolveModelAtomRef<k extends ModelAtom["kind"]>(
    identifier: IdentifierRef,
    model: string | undefined,
    ...kinds: k[]
  ): FilteredByKind<ModelAtom, k> | undefined {
    if (!model) return undefined;
    const resultOrError = tryResolveModelAtomRef(identifier, model);
    if (resultOrError instanceof CompilerError) errors.push(resultOrError);
    const result = resultOrError instanceof CompilerError ? undefined : resultOrError;

    const resolvedKind =
      (identifier.ref.kind === "modelAtom" && identifier.ref.atomKind) || undefined;
    for (const kind of kinds) {
      if (kind === resolvedKind) {
        return (kind === result?.kind ? result : undefined) as
          | FilteredByKind<ModelAtom, k>
          | undefined;
      }
    }

    errors.push(
      new CompilerError(identifier.identifier.token, ErrorCode.CantResolveModelAtomWrongKind, {
        atom: resolvedKind,
        expected: kinds,
      })
    );
    return undefined;
  }

  function findModel(name: string): Model | undefined {
    return getAllModels().find((m) => m.name.text === name);
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
        // extra check to allow nullable as rhs
        if (!isExpectedType(lhs.type, rhs.type)) {
          checkExprType(rhs, lhs.type);
        }
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

  function addToScope(scope: Scope, identifier: IdentifierRef) {
    const text = identifier.identifier.text;
    // fails if name already exists in context or if there is a model defined with the same name
    if (scope.context[text] || getAllModels().find((m) => m.name.text === text)) {
      errors.push(new CompilerError(identifier.identifier.token, ErrorCode.NameAlreadyInScope));
    } else {
      scope.context[text] = { type: identifier.type, ref: identifier.ref };
    }
  }

  resolveDocument(projectASTs.document);

  return errors;
}
