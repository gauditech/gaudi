import _ from "lodash";

import { SimpleActionSpec, simplifyActionSpec } from "./actions/simpleActions";
import { VarContext, getTypedLiteralValue, getTypedPath, getTypedPathWithLeaf } from "./utils";

import { getRef, getTargetModel } from "@src/common/refs";
import {
  assertUnreachable,
  ensureEqual,
  ensureNot,
  ensureThrow,
  safeInvoke,
} from "@src/common/utils";
import { EndpointType } from "@src/types/ast";
import {
  ActionDef,
  ChangesetDef,
  ChangesetOperationDef,
  Definition,
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
  endpointKind: EndpointType
): ActionDef[] {
  // we currently only allow create and update
  if (["create", "update"].indexOf(endpointKind) < 0) {
    ensureEqual(specs.length, 0, `${endpointKind} endpoint doesn't support action block`);
  }

  const initialContext = getInitialContext(targets, endpointKind);
  // Collect actions from the spec, updating the context during the pass through.
  const [ctx, actions] = specs.reduce(
    (acc, atom) => {
      const [currentCtx, actions] = acc;
      const action = composeSingleAction(def, atom, currentCtx, targets, endpointKind);
      if (action.kind !== "delete-one" && action.alias) {
        currentCtx[action.alias] = { modelName: action.model };
      }
      return [currentCtx, [...actions, action]];
    },
    [initialContext, []] as [VarContext, ActionDef[]]
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
function getInitialContext(targets: TargetDef[], endpointKind: EndpointType): VarContext {
  const parentContext: VarContext = _.fromPairs(
    _.initial(targets).map((t): [string, VarContext[string]] => [t.alias, { modelName: t.retType }])
  );
  switch (endpointKind) {
    case "create":
    case "list": {
      return parentContext;
    }
    case "update":
    case "delete":
    case "get": {
      const thisTarget = _.last(targets)!;
      return { ...parentContext, [thisTarget.alias]: { modelName: thisTarget.retType } };
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
              // fallback to resolving reference from context
              /*
               * NOTE: fallbacking to context-reference is dangerous because it will swallow any invalid reference and we will not know it until runtime
               * we should check  expected references and still fallback to throwing exception
               */
              return { kind: "context-reference", referenceName: siblingName };
              // throw ["unresolved", path];
            }
          }
          case "success": {
            const typedPath = maybeTypedPath.result;
            const namePath = typedPath.nodes.map((p) => p.name);
            const access = [...namePath, typedPath.leaf.name];
            const field = getRef.field(def, typedPath.leaf.refKey);
            return {
              kind: "reference-value",
              type: field.type,
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
          setter: { kind: "fieldset-hook", code: atom.set.hook.code, args },
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
  // eslint-disable-next-line no-constant-condition
  while (shouldRetry) {
    shouldRetry = false;
    simpleSpec.actionAtoms.forEach((atom) => {
      const result = safeInvoke(() => {
        const fieldsetNamespace =
          actionTargetScope === "target"
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

  // Build the desired `ActionDef`.
  return actionFromParts(simpleSpec, actionTargetScope, target, model, changeset);
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
  if (spec.kind !== endpointKind) {
    throw new Error(
      `Mismatching context action: overriding ${endpointKind} endpoint with a ${spec.kind} action`
    );
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
 */
type ActionTargetScope = "model" | "target" | "context-path";
function getActionTargetScope(
  def: Definition,
  spec: ActionSpec,
  targetAlias: string,
  ctx: VarContext
): ActionTargetScope {
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
      // eslint-disable-next-line no-empty
    } catch (e) {}
    // Not a model, check if initialization of a default target.ß
    const inCtx = path[0] in ctx;
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
  changeset: ChangesetDef
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
  }
}
