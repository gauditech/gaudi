import _ from "lodash";

import { SimpleActionAtoms, SimpleActionSpec, simplifyActionSpec } from "./actions/simpleActions";

import { FilteredKind } from "@src/common/patternFilter";
import { getRef, getTargetModel } from "@src/common/refs";
import {
  UnreachableError,
  assertUnreachable,
  ensureEmpty,
  ensureEqual,
  ensureExists,
  ensureNot,
  ensureThrow,
  resolveItems,
} from "@src/common/utils";
import { composeHook } from "@src/composer/hooks";
import { composeValidators, validateType } from "@src/composer/models";
import { composeQuery } from "@src/composer/query";
import {
  VarContext,
  getTypedIterator,
  getTypedLiteralValue,
  getTypedPath,
  getTypedPathWithLeaf,
  getTypedRequestPath,
} from "@src/composer/utils";
import {
  ActionDef,
  ActionHookDef,
  ChangesetDef,
  ChangesetOperationDef,
  CreateOneAction,
  Definition,
  DeleteOneAction,
  EndpointType,
  ExecuteHookAction,
  FetchOneAction,
  FieldSetter,
  FunctionName,
  ModelDef,
  QueryDef,
  TargetDef,
  UpdateOneAction,
} from "@src/types/definition";
import {
  ActionAtomSpecSet,
  ActionSpec,
  ExpSpec,
  ModelActionSpec,
  QuerySpec,
} from "@src/types/specification";

/**
 * Composes the custom actions block for an endpoint. Adds a default action
 * based on `endpoint.kind` if one is not defined in blueprint.
 * Requires `targets` to construct an initial variable context.
 */
export function composeActionBlock(
  def: Definition,
  specs: ActionSpec[],
  targets: TargetDef[],
  endpointKind: EndpointType,
  /*
   * NOTE: `iteratorCtx` is used by populator only
   * TODO we should add support for iterators in actions
   */
  iteratorCtx: VarContext = {}
): ActionDef[] {
  // we currently allow actions only on create, update and custom endpoints
  if (!_.includes<EndpointType>(["create", "update", "custom-one", "custom-many"], endpointKind)) {
    ensureEqual(specs.length, 0, `${endpointKind} endpoint doesn't support action block`);
  }

  const targetsCtx = getInitialContext(def, targets, endpointKind);

  /**
   * Ensure no overlap between target context and iterator context.
   * Current target may not be in the context, but we can't reuse the alias, so we take aliases
   * directly from `targets` rather than from the `targetsCtx` keys.
   */
  const targetAliases = targets.map((t) => t.alias);
  ensureEqual(
    _.intersection(targetAliases, _.keys(iteratorCtx)).length,
    0,
    `Overlap between iterator context and targets context: ${_.intersection(
      targetAliases,
      _.keys(iteratorCtx)
    ).join(", ")}`
  );
  const initialCtx = _.merge(targetsCtx, iteratorCtx);

  // Collect actions from the spec, updating the context during the pass through.
  const [ctx, actions] = specs.reduce(
    (acc, atom) => {
      const [currentCtx, actions] = acc;
      switch (atom.kind) {
        case "create":
        case "update": {
          const action = composeModelAction(def, atom, currentCtx, targets, endpointKind);
          currentCtx[action.alias] = { kind: "record", modelName: action.model };
          return [currentCtx, [...actions, action]];
        }
        case "delete": {
          const action = composeDeleteAction(def, atom, currentCtx, _.last(targets)!, endpointKind);
          // FIXME delete an alias from `currentCtx`
          return [currentCtx, [...actions, action]];
        }
        case "execute": {
          const action = composeExecuteAction(def, atom, currentCtx);
          return [currentCtx, [...actions, action]];
        }
        case "fetch": {
          const action = composeFetchAction(def, atom, currentCtx);
          currentCtx[action.alias] = { kind: "record", modelName: action.model };
          return [currentCtx, [...actions, action]];
        }
      }
    },
    [initialCtx, []] as [VarContext, ActionDef[]]
  );

  // Create a default context action if not specified in blueprint.
  const target = _.last(targets)!;
  const defaultActions = specs.filter(
    // action must target "target model" and not be "fetch" action since they don't change model
    (spec) =>
      getActionTargetScope(def, spec, target.alias, ctx) === "target" && spec.kind !== "fetch"
  );

  if (defaultActions.length === 1) {
    return actions;
  } else if (defaultActions.length > 1) {
    throw new Error(`Multiple default action definitions`);
  } else {
    ensureEqual(defaultActions.length, 0);
    switch (endpointKind) {
      case "get":
      case "list": {
        // No action here, since selecting the records from the db is not an `ActionDef`.
        return actions;
      }
      case "custom-one":
      case "custom-many": {
        // no default action here since it's a "custom" endpoint
        return actions;
      }
      case "delete": {
        const action = composeDeleteAction(
          def,
          {
            kind: "delete",
            targetPath: undefined,
          },
          ctx,
          _.last(targets)!,
          endpointKind
        );
        return [action, ...actions];
      }
      case "create":
      case "update": {
        /**
         * Make custom default action and insert at the beginning.
         *
         *
         * NOTE for `create`, this inserts default action at the beginning,
         *      however we didn't account for that in the `initialContext` so
         *      other actions can't reference the alias unless in this case.
         *      We could improve it, but it would require us to know if user defined
         *      a default target action some time later - in order to be able to decide
         *      if user is referencing a default target alias before it's initialisation
         *      or after.
         */
        const action: CreateOneAction | UpdateOneAction = composeModelAction(
          def,
          {
            kind: endpointKind,
            alias: undefined,
            targetPath: undefined,
            actionAtoms: [],
          },
          ctx,
          targets,
          endpointKind
        );

        return [action, ...actions];
      }
      default: {
        return assertUnreachable(endpointKind);
      }
    }
  }
}

/**
 * Calculates initial context variables available in the endpoint, based on `TargetDef`s and
 * endpoint kind. For example, `create` endpoints don't see their own target in the context
 * until it's created by an action, while `update` sees is immediately, as it already exists
 * in the database.
 */
export function getInitialContext(
  def: Definition,
  targets: TargetDef[],
  endpointKind: EndpointType
): VarContext {
  const parentContext: VarContext = _.fromPairs(
    _.initial(targets).map((t): [string, VarContext[string]] => [
      t.alias,
      { kind: "record", modelName: t.retType },
    ])
  );

  if (def.authenticator) {
    parentContext["@auth"] = {
      kind: "record",
      modelName: def.authenticator.authUserModel.name,
    };
    parentContext["@requestAuthToken"] = {
      kind: "requestAuthToken",
    };
  }

  switch (endpointKind) {
    case "create":
    case "list":
    case "custom-many": {
      return parentContext;
    }
    case "update":
    case "delete":
    case "get":
    case "custom-one": {
      const thisTarget = _.last(targets)!;
      return {
        ...parentContext,
        [thisTarget.alias]: { kind: "record", modelName: thisTarget.retType },
      };
    }
  }
}

function composeDeleteAction(
  def: Definition,
  spec: FilteredKind<ActionSpec, "delete">,
  ctx: VarContext,
  target: TargetDef,
  endpointKind: EndpointType
): DeleteOneAction {
  // Targeting model, context-path or reimplementing a default action?
  const actionTargetScope = getActionTargetScope(def, spec, target.alias, ctx);
  // Reimplementing a default action
  if (actionTargetScope === "target") {
    ensureAllowedTargetAction(spec, target, endpointKind);
  }
  const targetPath = spec.targetPath ?? [target.alias];
  return {
    kind: "delete-one",
    targetPath,
    model: findChangesetModel(def, ctx, targetPath, target).refKey,
  };
}

function composeFetchAction(
  def: Definition,
  spec: FilteredKind<ActionSpec, "fetch">,
  ctx: VarContext
): FetchOneAction {
  const changeset: ChangesetDef = [];

  ensureExists(spec.alias, `Alias is required in fetch actions`);

  spec.atoms.forEach((atom) => {
    const op = atomToChangesetOperation(def, atom, [], null, ctx, changeset);
    changeset.push(op);
  });
  // fetch action's model is derived from it's query
  const startModel = getRef.model(def, spec.query.fromModel[0]);
  const changesetCtx: VarContext = {
    ...ctx,
    "@changeset": { kind: "changeset-value", keys: changeset.map((c) => c.name) },
  };
  const query = composeQuery(def, startModel, spec.query, changesetCtx);
  return {
    kind: "fetch-one",
    alias: spec.alias,
    changeset,
    model: query.retType,
    query: query,
  };
}

function composeExecuteAction(
  def: Definition,
  spec: FilteredKind<ActionSpec, "execute">,
  ctx: VarContext
): ExecuteHookAction {
  const changeset: ChangesetDef = [];

  spec.atoms.forEach((atom) => {
    const op = atomToChangesetOperation(def, atom, [], null, ctx, changeset);
    changeset.push(op);
  });

  const actionHook: ActionHookDef = {
    args: _.chain(spec.hook.args)
      .toPairs()
      .map(([name, arg]) =>
        setterToChangesetOperation(def, { kind: "set", target: name, set: arg }, ctx, changeset)
      )
      .value(),

    hook: composeHook(def, spec.hook),
  };

  return {
    kind: "execute-hook",
    hook: actionHook,
    changeset,
    responds: spec.responds,
  };
}

/**
 * Composes a single `ActionDef` based on current variable context, entrypoint, endpoint and action specs.
 */
function composeModelAction(
  def: Definition,
  spec: ModelActionSpec,
  ctx: VarContext,
  targets: TargetDef[],
  endpointKind: EndpointType
): CreateOneAction | UpdateOneAction {
  const target = _.last(targets)!;
  const model = findChangesetModel(def, ctx, spec.targetPath, target);

  // Targeting model, context-path or reimplementing a default action?
  const actionTargetScope = getActionTargetScope(def, spec, target.alias, ctx);
  // Reimplementing a default action
  if (actionTargetScope === "target") {
    ensureAllowedTargetAction(spec, target, endpointKind);
  } else {
    // check alias
    ensureNot(spec.alias, undefined, `Custom action must have an alias`);
    // ensure alias doesn't reuse an existing name
    const message = `Cannot name an action with ${spec.alias}, name already exists in the context`;

    // FIXME not sure if this logic works
    ensureThrow(() => getRef(def, spec.alias!), message);
    ensureEqual(spec.alias! in ctx, false, message);
  }

  const specWithParentSetter = assignParentContextSetter(def, spec, ctx, targets);
  const simpleSpec = simplifyActionSpec(def, specWithParentSetter, target.alias, model);

  const changeset: ChangesetDef = [];
  const resolveResult = resolveItems(
    // atoms to be resolved
    simpleSpec.actionAtoms,
    // item name resolver
    (atom: SimpleActionAtoms) => {
      switch (atom.kind) {
        case "input":
          return atom.fieldSpec.name;
        case "reference":
          return atom.target;
        case "set":
          return atom.target;
        case "virtual-input":
          return atom.name;
      }
    },
    // item resolver
    (atom) => {
      const fieldsetNamespace =
        actionTargetScope === "target" || actionTargetScope === "none"
          ? _.compact([simpleSpec.blueprintAlias])
          : [simpleSpec.alias];

      const op = atomToChangesetOperation(def, atom, fieldsetNamespace, model, ctx, changeset);
      // Add the changeset operation only if not added before
      if (!_.find(changeset, { name: op.name })) {
        changeset.push(op);
      }
    }
  );
  // handle error
  if (resolveResult.kind === "error") {
    console.log(
      "ERRORS",
      resolveResult.errors.map((e) => `${e.name} [${e.error.message ?? e.error}]`)
    );

    throw new Error(
      `Couldn't resolve all field setters: ${resolveResult.errors.map((i) => i.name).join()}`
    );
  }

  // TODO: resolving should break on any error other than "not yet resolved"
  // TODO ensure changeset has covered every non-optional field in the model!

  // Build the desired `ActionDef`.
  return modelActionFromParts(simpleSpec, actionTargetScope, target, model, changeset);
}

function expandSetterExpression(
  def: Definition,
  exp: ExpSpec,
  ctx: VarContext,
  changeset: ChangesetDef
): FieldSetter {
  switch (exp.kind) {
    case "literal": {
      return getTypedLiteralValue(exp.literal);
    }
    case "identifier": {
      const path = exp.identifier;

      // is path alias in the context?
      if (path[0] in ctx) {
        const alias = path[0];
        const ctxVar = ctx[alias]!;
        switch (ctxVar.kind) {
          case "iterator": {
            const iterator = getTypedIterator(def, path, ctx);
            return {
              kind: "reference-value",
              target: {
                alias: iterator.name,
                access: _.compact([iterator.leaf]),
              },
            };
          }
          case "requestAuthToken": {
            const request = getTypedRequestPath(path, ctx);
            return {
              kind: request.kind,
              access: request.access,
            };
          }
          case "record": {
            const typedPath = getTypedPathWithLeaf(def, path, ctx);
            const namePath = typedPath.nodes.map((p) => p.name);
            const access = [...namePath, typedPath.leaf.name];
            return {
              kind: "reference-value",
              target: { alias: path[0], access },
            };
          }
          case "changeset-value": {
            throw new UnreachableError(
              `Changeset context shouldn't be accessed through identifier`
            );
          }
          default: {
            return assertUnreachable(ctxVar);
          }
        }
      } else {
        // FIXME sibling call should be a qualified form
        // if path has more than 1 element, it can't be a sibling call
        ensureEqual(path.length, 1, `Unresolved expression path ${path}`);
        const siblingName = path[0];
        // check if sibling name is defined in the changeset
        const siblingOp = _.find(changeset, { name: siblingName });
        if (siblingOp) {
          return { kind: "changeset-reference", referenceName: siblingName };
        } else {
          throw new Error(`Unresolved expression path: ${path}`);
        }
      }
    }
    case "unary": {
      return {
        kind: "function",
        name: exp.operator as FunctionName, // FIXME proper validation
        args: [expandSetterExpression(def, exp.exp, ctx, changeset)],
      };
    }
    case "binary": {
      return {
        kind: "function",
        name: exp.operator as FunctionName, // FIXME proper validation
        args: [
          expandSetterExpression(def, exp.lhs, ctx, changeset),
          expandSetterExpression(def, exp.rhs, ctx, changeset),
        ],
      };
    }
    case "function": {
      return {
        kind: "function",
        name: exp.name as FunctionName, // FIXME proper validation
        args: exp.args.map((a) => expandSetterExpression(def, a, ctx, changeset)),
      };
    }
  }
}

function setterToChangesetOperation(
  def: Definition,
  atom: ActionAtomSpecSet,
  ctx: VarContext,
  changeset: ChangesetDef
): ChangesetOperationDef {
  switch (atom.set.kind) {
    case "hook": {
      const args = _.chain(atom.set.hook.args)
        .toPairs()
        .map(([name, arg]) =>
          setterToChangesetOperation(def, { kind: "set", target: name, set: arg }, ctx, changeset)
        )
        .value();
      return {
        name: atom.target,
        setter: { kind: "fieldset-hook", hook: composeHook(def, atom.set.hook), args },
      };
    }
    case "expression": {
      const exp = atom.set.exp;
      const setter = expandSetterExpression(def, exp, ctx, changeset);
      return { name: atom.target, setter };
    }
    case "query": {
      const changesetCtx: VarContext = {
        ...ctx,
        "@changeset": { kind: "changeset-value", keys: changeset.map((c) => c.name) },
      };
      return {
        name: atom.target,
        setter: { kind: "query", query: queryFromSpec(def, atom.set.query, changesetCtx) },
      };
    }
  }
}

function atomToChangesetOperation(
  def: Definition,
  atom: SimpleActionSpec["actionAtoms"][number],
  fieldsetNamespace: string[],
  model: ModelDef | null,
  ctx: VarContext,
  changeset: ChangesetDef
): ChangesetOperationDef {
  switch (atom.kind) {
    case "virtual-input": {
      return {
        name: atom.name,
        setter: {
          kind: "fieldset-virtual-input",
          type: validateType(atom.type),
          required: !atom.optional,
          nullable: atom.nullable,
          fieldsetAccess: [...fieldsetNamespace, atom.name],
          validators: composeValidators(def, validateType(atom.type), atom.validators),
        },
      };
    }
    case "input": {
      ensureNot(model, null, `input atom can't be used with actions without target model`);
      const field = getRef.field(def, model.name, atom.fieldSpec.name);
      return {
        name: atom.fieldSpec.name,
        setter: {
          kind: "fieldset-input",
          type: field.type,
          required: !atom.fieldSpec.optional,
          fieldsetAccess: [...fieldsetNamespace, atom.fieldSpec.name],
        },
      };
    }
    case "reference": {
      ensureNot(model, null, `input atom can't be used with actions without target model`);
      const reference = getRef.reference(def, model.name, atom.target);
      const throughField = getRef.field(def, reference.toModelRefKey, atom.through);
      return {
        name: atom.target,
        setter: {
          kind: "fieldset-reference-input",
          throughRefKey: throughField.refKey,
          fieldsetAccess: [...fieldsetNamespace, `${atom.target}_${atom.through}`],
        },
      };
    }
    case "set": {
      return setterToChangesetOperation(def, atom, ctx, changeset);
    }
  }
}

/**
 * Ensures that a action kind is allowed in given endpoint.
 *
 * Eg. on `create endpoint` there can only be a `create` specification
 * for a default action.
 *
 * Eg. `custom-one` endpoints allow only `update`, `delete`, `execute` and `fetch` actions.
 */
function ensureAllowedTargetAction(
  spec: ActionSpec,
  target: TargetDef,
  endpointKind: EndpointType
) {
  // --- check endpoint action types
  // custom endpoint action types depend on their cardinality
  if (endpointKind === "custom-one" || endpointKind === "custom-many") {
    if (
      endpointKind === "custom-many" &&
      !_.includes<ActionSpec["kind"]>(["create", "execute", "fetch"], spec.kind)
    ) {
      throw new Error(
        `"custom-many" endpoint does not allow "${spec.kind}" action on default target`
      );
    }
    if (
      endpointKind === "custom-one" &&
      !_.includes<ActionSpec["kind"]>(["update", "delete", "execute", "fetch"], spec.kind)
    ) {
      throw new Error(
        `"custom-one" endpoint does not allow "${spec.kind}" action on default target`
      );
    }
  } else {
    // standard endpoint action types' cardinality is implicit and reflects on allowed default action type
    if (spec.kind !== endpointKind) {
      throw new Error(
        `Mismatching context action: overriding ${endpointKind} endpoint with a ${spec.kind} action on default target`
      );
    }
  }

  if (spec.kind === "create") {
    if (spec.alias && spec.alias !== target.alias) {
      throw new Error(
        `Default target create action cannot be re-aliased: expected ${target.alias}, got ${spec.alias}`
      );
    }
  }
}

/**
 * `ActionTargetScope` defines what an action operation is targeting.
 * Options:
 * - `model`, targets a model directly, not related to any context
 *    eg. `create Item {}`
 * - `target`, overwriting the default target action
 *    eg. `create {}` or `create item` or `update item as updatedItem`
 * - `context-path`, targets an object related to an object already in context
 *    eg. `create object.items` or `update item.object`
 * - `none` - no specific target
 *    eg. custom hook actions which only do some low level stuff (eg. setting HTTP headers)
 */
type ActionTargetScope = "model" | "target" | "context-path" | "none";
function getActionTargetScope(
  def: Definition,
  spec: ActionSpec,
  targetAlias: string,
  ctx: VarContext
): ActionTargetScope {
  // action without explicit target
  if (spec.kind === "execute" || spec.kind === "fetch") {
    return "none";
  }
  const path = spec.targetPath;
  if (!path) {
    return "target";
  }
  if (path.length === 1) {
    if (path[0] === targetAlias) {
      return "target";
    }
    const model = def.models.find((m) => m.name === path[0]);
    if (model) {
      return "model";
    }
  }
  // we don't need the typed path, but let's ensure that path names resolve correctly
  getTypedPath(def, path, ctx);
  return "context-path";
}

/**
 * Returns a model the changeset operates on. Taken from the end of the resolved path
 * which must not end with a `leaf`.
 *
 * FIXME this function is not specific to `changeset`, rename. This may be deprecated
 *       by proposed changes in `getTypedPathFromContext`.
 */
function findChangesetModel(
  def: Definition,
  ctx: VarContext,
  specTargetPath: string[] | undefined,
  target: TargetDef
): ModelDef {
  const path = specTargetPath ?? [target.alias];
  // Special handling single-element path because it may be a direct model operation
  // or an initialization of an endpoint target.
  if (path.length === 1) {
    // Check if model.
    try {
      return getRef.model(def, path[0]);
    } catch (e) {
      // noop
    }
    // Not a model, check if initialization of a default target.
    const inCtx = path[0] in ctx && ctx[path[0]]?.kind === "record";
    if (!inCtx) {
      if (path[0] === target.alias) {
        return getRef.model(def, target.retType);
      }
    }
  }

  // Ensure path is valid
  const typedPath = getTypedPath(def, path, ctx);
  if (typedPath.leaf) {
    throw new Error(`Path ${path.join(".")} doesn't resolve into a model`);
  }

  /**
   * FIXME this block of code can be removed when we add `retType` property
   *       in the root of a typed path.
   */
  if (typedPath.nodes.length === 0) {
    // only source
    switch (typedPath.source.kind) {
      case "context": {
        // Another case of single-element path that is not handled above because it may be
        // an operation on something that's already defined in the context, eg. updating
        // a parent context (updating `org` within the `repos` endpoint).
        return getRef.model(def, typedPath.source.model.refKey);
      }
      case "model": {
        return getRef.model(def, typedPath.source.refKey);
      }
    }
  } else {
    return getTargetModel(def, _.last(typedPath.nodes)!.refKey);
  }
}

function assignParentContextSetter(
  def: Definition,
  spec: ModelActionSpec,
  ctx: VarContext,
  targets: TargetDef[]
): ModelActionSpec {
  if (spec.kind !== "create") {
    return spec;
  }
  const target = _.last(targets)!;
  const actionScope = getActionTargetScope(def, spec, target.alias, ctx);
  switch (actionScope) {
    case "model":
    case "none":
      return spec;
    case "target": {
      if (targets.length < 2) {
        return spec;
      }
      const [context, target] = _.takeRight(targets, 2);
      const targetPath = [context.alias, target.name];
      const setter = toSetter(targetPath);

      return { ...spec, actionAtoms: [setter, ...spec.actionAtoms] };
    }
    case "context-path": {
      const targetPath = spec.targetPath!;
      const setter = toSetter(targetPath);

      return { ...spec, actionAtoms: [setter, ...spec.actionAtoms] };
    }
  }

  function toSetter(targetPath: string[]): ActionAtomSpecSet {
    const tpath = getTypedPath(def, targetPath, ctx);
    ensureEqual(tpath.leaf, null);
    ensureNot(tpath.nodes.length, 0);
    const finalNode = _.last(tpath.nodes)!;
    // We currently only support relations
    const relation = getRef.relation(def, finalNode.refKey);
    const reference = getRef.reference(def, relation.throughRefKey);

    // Everything in between in the path must be a (TODO: non-nullable??) reference
    _.initial(tpath.nodes).forEach((tp) => ensureEqual(tp.kind, "reference"));

    const parentNamePath = [tpath.source.name, ..._.initial(tpath.nodes).map((node) => node.name)];
    return {
      kind: "set",
      target: reference.name,
      set: {
        kind: "expression",
        exp: {
          kind: "identifier",
          identifier: parentNamePath,
        },
      },
    };
  }
}

/**
 * Constructs an `ActionDef` for a model action.
 */
function modelActionFromParts(
  spec: SimpleActionSpec,
  targetKind: ActionTargetScope,
  target: TargetDef,
  model: ModelDef,
  changeset: ChangesetDef
): CreateOneAction | UpdateOneAction {
  // FIXME come up with an alias in case of nested actions
  const alias = targetKind === "target" && spec.kind === "create" ? target.alias : spec.alias;

  switch (spec.kind) {
    case "create": {
      return {
        kind: "create-one",
        alias,
        changeset,
        targetPath: spec.targetPath ?? [target.alias],
        model: model.name,
        select: [],
      };
    }
    case "update": {
      // FIXME update-many when targetKind is model
      return {
        kind: "update-one",
        changeset,
        alias,
        targetPath: spec.targetPath ?? [target.alias],
        model: model.name,
        filter: undefined,
        select: [],
      };
    }
  }
}

export function queryFromSpec(def: Definition, qspec: QuerySpec, ctx: VarContext): QueryDef {
  ensureEmpty(qspec.aggregate, "Aggregates are not yet supported in action queries");

  const pathPrefix = _.first(qspec.fromModel);
  ensureExists(pathPrefix, `Action query "fromModel" path is empty ${qspec.fromModel}`);

  const fromModel = getRef.model(def, pathPrefix);

  return composeQuery(def, fromModel, qspec, ctx);
}
