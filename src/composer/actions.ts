import _ from "lodash";

import { SimpleActionSpec, simplifyActionSpec } from "./actions/simpleActions";
import { composeValidators, validateType } from "./models";
import {
  VarContext,
  getTypedIterator,
  getTypedLiteralValue,
  getTypedPath,
  getTypedPathWithLeaf,
} from "./utils";

import { kindFilter } from "@src/common/patternFilter";
import { getRef, getTargetModel } from "@src/common/refs";
import {
  assertUnreachable,
  ensureEqual,
  ensureExists,
  ensureNot,
  ensureThrow,
  safeInvoke,
} from "@src/common/utils";
import { composeHook } from "@src/composer/hooks";
import {
  ActionDef,
  ActionHookDef,
  ChangesetDef,
  ChangesetOperationDef,
  Definition,
  EndpointType,
  FieldSetter,
  FunctionName,
  ModelDef,
  TargetDef,
} from "@src/types/definition";
import { ActionAtomSpecSet, ActionSpec, ExpSpec } from "@src/types/specification";

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
      const action = composeSingleAction(def, atom, currentCtx, targets, endpointKind);
      if (action.kind !== "delete-one" && action.kind !== "execute-hook" && action.alias) {
        currentCtx[action.alias] = { kind: "record", modelName: action.model };
      }
      return [currentCtx, [...actions, action]];
    },
    [initialCtx, []] as [VarContext, ActionDef[]]
  );

  // Create a default context action if not specified in blueprint.
  const target = _.last(targets)!;
  const defaultActions = specs.filter(
    (spec) => getActionTargetScope(def, spec, target.alias, ctx) === "target"
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
      case "custom-many":
        // no default action here since it's a "custom" endpoint
        return actions;
      default: {
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
        const action: ActionDef = composeSingleAction(
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

  if (def.auth) {
    parentContext["@auth"] = {
      kind: "record",
      modelName: getRef.model(def, def.auth.baseRefKey).name,
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

/**
 * Composes a single `ActionDef` based on current variable context, entrypoint, endpoint and action specs.
 */
function composeSingleAction(
  def: Definition,
  spec: ActionSpec,
  ctx: VarContext,
  targets: TargetDef[],
  endpointKind: EndpointType
): ActionDef {
  const target = _.last(targets)!;
  const model = findChangesetModel(def, ctx, spec.targetPath, target);

  // Targeting model, context-path or reimplementing a default action?
  const actionTargetScope = getActionTargetScope(def, spec, target.alias, ctx);
  // Overwriting a default action
  if (actionTargetScope === "target") {
    ensureCorrectDefaultAction(spec, target, endpointKind);
  } else if (actionTargetScope === "none") {
    // there is no alias for "none" scope action
  } else {
    ensureNot(spec.alias, undefined, `Custom action must have an alias`);
    // ensure alias doesn't reuse an existing name
    const message = `Cannot name an action with ${spec.alias}, name already exists in the context`;

    // FIXME not sure if this logic works
    ensureThrow(() => getRef(def, spec.alias!), message);
    ensureEqual(spec.alias! in ctx, false, message);
  }

  const specWithParentSetter = assignParentContextSetter(def, spec, ctx, targets);
  const simpleSpec = simplifyActionSpec(def, specWithParentSetter, target.alias, model);

  function expandSetterExpression(exp: ExpSpec, changeset: ChangesetDef): FieldSetter {
    switch (exp.kind) {
      case "literal": {
        return getTypedLiteralValue(exp.literal);
      }
      case "identifier": {
        const path = exp.identifier;

        const maybeTypedPath = safeInvoke(() => getTypedPathWithLeaf(def, path, ctx));
        switch (maybeTypedPath.kind) {
          case "error": {
            /**
             * Check if path is an iterator.
             */

            const maybeIterator = safeInvoke(() => getTypedIterator(def, path, ctx));
            switch (maybeIterator.kind) {
              case "success": {
                return {
                  kind: "reference-value",
                  target: {
                    alias: maybeIterator.result.name,
                    access: _.compact([maybeIterator.result.leaf]),
                  },
                };
              }
              case "error": {
                /**
                 * Is this a computed "sibling" call?
                 * It must start with an action spec alias, and must be a shallow path (no deep aliases)
                 */
                if (path[0] === simpleSpec.alias) {
                  ensureEqual(path.length, 2);
                } else {
                  ensureEqual(path.length, 1, `Path "${path}" must have length 1`);
                }
                const siblingName = _.last(path)!;
                // check if sibling name is defined in the changeset
                const siblingOp = _.find(changeset, { name: siblingName });
                if (siblingOp) {
                  return { kind: "changeset-reference", referenceName: siblingName };
                } else {
                  throw ["unresolved", path];
                }
              }
              default: {
                return assertUnreachable(maybeIterator);
              }
            }
          }
          case "success": {
            const typedPath = maybeTypedPath.result;
            const namePath = typedPath.nodes.map((p) => p.name);
            const access = [...namePath, typedPath.leaf.name];
            return {
              kind: "reference-value",
              target: { alias: path[0], access },
            };
          }
          default: {
            return assertUnreachable(maybeTypedPath);
          }
        }
      }
      case "unary": {
        return {
          kind: "function",
          name: exp.operator as FunctionName, // FIXME proper validation
          args: [expandSetterExpression(exp.exp, changeset)],
        };
      }
      case "binary": {
        return {
          kind: "function",
          name: exp.operator as FunctionName, // FIXME proper validation
          args: [
            expandSetterExpression(exp.lhs, changeset),
            expandSetterExpression(exp.rhs, changeset),
          ],
        };
      }
      case "function": {
        return {
          kind: "function",
          name: exp.name as FunctionName, // FIXME proper validation
          args: exp.args.map((a) => expandSetterExpression(a, changeset)),
        };
      }
    }
  }

  function toFieldSetter(atom: ActionAtomSpecSet, changeset: ChangesetDef): ChangesetOperationDef {
    switch (atom.set.kind) {
      case "hook": {
        const args = _.chain(atom.set.hook.args)
          .toPairs()
          .map(([name, arg]) => toFieldSetter({ kind: "set", target: name, set: arg }, changeset))
          .value();
        return {
          name: atom.target,
          setter: { kind: "fieldset-hook", hook: composeHook(def, atom.set.hook), args },
        };
      }
      case "expression": {
        const exp = atom.set.exp;
        const setter = expandSetterExpression(exp, changeset);
        return { name: atom.target, setter };
      }
    }
  }

  function atomToChangesetOperation(
    atom: SimpleActionSpec["actionAtoms"][number],
    fieldsetNamespace: string[]
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
        return toFieldSetter(atom, changeset);
      }
    }
  }

  const changeset: ChangesetDef = [];
  let keyCount = changeset.length;
  let shouldRetry = true;
  while (shouldRetry) {
    shouldRetry = false;
    simpleSpec.actionAtoms.forEach((atom) => {
      const result = safeInvoke(() => {
        const fieldsetNamespace =
          actionTargetScope === "target" || actionTargetScope === "none"
            ? _.compact([simpleSpec.blueprintAlias])
            : [simpleSpec.alias];
        const op = atomToChangesetOperation(atom, fieldsetNamespace);
        // Add the changeset operation only if not added before
        if (!_.find(changeset, { name: op.name })) {
          changeset.push(op);
        }
      });
      if (result.kind === "error") {
        shouldRetry = true;
      }
    });
    if (shouldRetry && changeset.length === keyCount) {
      // we had an iteration in which nothing was resolved, and there are still unresolved setters
      throw new Error(`Couldn't resolve all field setters`);
    }
    keyCount = changeset.length;
  }
  // TODO ensure changeset has covered every non-optional field in the model!

  // compose action hook (if available) - only in "execute"s
  const hookSpecs = kindFilter(spec.actionAtoms, "hook");
  let actionHook: ActionHookDef | undefined;
  if (hookSpecs.length > 0) {
    ensureEqual(hookSpecs.length, 1, "Max one hook per action is allowed");
    ensureEqual(spec.kind, "execute", 'Hooks are allowed only in "execute" action types');

    const hookSpec = hookSpecs[0].hook;

    ensureNot(hookSpec.code.kind, "inline", 'Inline hooks cannot be used for "execute" actions');

    actionHook = {
      args: _.chain(hookSpec.args)
        .toPairs()
        .map(([name, arg]) => toFieldSetter({ kind: "set", target: name, set: arg }, changeset))
        .value(),

      hook: composeHook(def, hookSpec),
    };
  }

  // action responds
  const respondsAtoms = kindFilter(spec.actionAtoms, "responds");
  if (respondsAtoms.length > 0) {
    // in custom endpoint
    ensureEqual(
      _.includes<EndpointType>(["custom-one", "custom-many"], endpointKind),
      true,
      `Actions with "responds" keyword are allowed only in "custom-one" and "custom-many" endpoints, not in "${endpointKind}"`
    );
    // in execute action
    ensureEqual(
      simpleSpec.kind,
      "execute",
      'Keyword "responds" is allowed only on "execute" actions'
    );
  }
  const responds = respondsAtoms.length > 0;

  // Build the desired `ActionDef`.
  return actionFromParts(
    simpleSpec,
    actionTargetScope,
    target,
    model,
    changeset,
    actionHook,
    responds
  );
}

/**
 * Ensures that a default action kind matches the endpoint kind.
 * eg. on `create endpoint` there can only be a `create` specification
 * for a default action.
 */
function ensureCorrectDefaultAction(
  spec: ActionSpec,
  target: TargetDef,
  endpointKind: EndpointType
) {
  // --- check endpoint action types
  // custom endpoint action types depend on their cardinality
  if (endpointKind === "custom-one" || endpointKind === "custom-many") {
    if (
      endpointKind === "custom-many" &&
      !_.includes<ActionSpec["kind"]>(["create", "execute"], spec.kind)
    ) {
      throw new Error(`"custom-many" endpoint does not allow "${spec.kind}" action`);
    }
    if (
      endpointKind === "custom-one" &&
      !_.includes<ActionSpec["kind"]>(["update", "delete", "execute"], spec.kind)
    ) {
      throw new Error(`"custom-one" endpoint does not allow "${spec.kind}" action`);
    }
  } else {
    // standard endpoint action types' cardinality is implicit and reflects on allowed default action type
    if (spec.kind !== endpointKind) {
      throw new Error(
        `Mismatching context action: overriding ${endpointKind} endpoint with a ${spec.kind} action`
      );
    }
  }

  if (spec.kind === "create") {
    if (spec.alias && spec.alias !== target.alias) {
      throw new Error(
        `Default create action cannot be re-aliased: expected ${target.alias}, got ${spec.alias}`
      );
    }
  }

  if (spec.kind === "delete" && spec.alias) {
    throw new Error(`Delete action cannot make an alias; remove "as ${spec.alias}"`);
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
  const path = spec.targetPath;
  if (!path) {
    // execute action can only have explicit target
    if (spec.kind === "execute") {
      return "none";
    }

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
  spec: ActionSpec,
  ctx: VarContext,
  targets: TargetDef[]
): ActionSpec {
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
 * Constructs an `ActionDef`.
 */
function actionFromParts(
  spec: ActionSpec,
  targetKind: ActionTargetScope,
  target: TargetDef,
  model: ModelDef,
  changeset: ChangesetDef,
  hook: ActionHookDef | undefined,
  responds: boolean
): ActionDef {
  // FIXME come up with an alias in case of nested actions
  const alias = targetKind === "target" && spec.kind === "create" ? target.alias : spec.alias!;

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
    case "delete": {
      // FIXME delete-many
      return {
        kind: "delete-one",
        model: model.name,
        targetPath: spec.targetPath ?? [target.alias],
      };
    }
    case "execute": {
      ensureExists(hook, 'Missing hook from "execute" action spec');

      return {
        kind: "execute-hook",
        changeset,
        hook,
        responds,
      };
    }
  }
}
