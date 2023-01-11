import _ from "lodash";

import { VarContext, getTypedLiteralValue, getTypedPath, getTypedPathWithLeaf } from "./utils";

import { getRef, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual, ensureThrow, safeInvoke } from "@src/common/utils";
import { EndpointType } from "@src/types/ast";
import {
  ActionDef,
  Changeset,
  Definition,
  FieldDef,
  FieldSetter,
  FieldSetterInput,
  ModelDef,
  TargetDef,
} from "@src/types/definition";
import {
  ActionAtomSpec,
  ActionAtomSpecDeny,
  ActionAtomSpecInput,
  ActionAtomSpecRefThrough,
  ActionAtomSpecSet,
  ActionSpec,
  InputFieldSpec,
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
    // ensure alias doesn't reuse an existing name
    const message = `Cannot name an action with ${spec.alias}, name already exists in the context`;

    // FIXME not sure if this logic works
    ensureThrow(() => getRef(def, spec.alias!), message);
    ensureEqual(spec.alias! in ctx, false, message);
  }

  const simpleSpec = simplifyActionSpec(def, spec, target.alias, model);

  function toFieldSetter(atom: ActionAtomSpecSet, changeset: Changeset): [string, FieldSetter] {
    switch (atom.set.kind) {
      case "hook": {
        const args = _.chain(atom.set.hook.args)
          .mapValues(
            (arg) => toFieldSetter({ kind: "set", target: atom.target, set: arg }, changeset)[1]
          )
          .value();
        return [atom.target, { kind: "fieldset-hook", code: atom.set.hook.code, args }];
      }
      case "literal": {
        const typedVal = getTypedLiteralValue(atom.set.value);
        return [atom.target, typedVal];
      }
      case "reference": {
        /**
         * Reference can be an alias or a computed/function.
         * Currently, we don't support complex computeds so it will resolve to one of the known kinds of setters.
         */
        const path = atom.set.reference;

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
              ensureEqual(path.length, 1);
            }
            const sibling = _.last(path)!;
            // peek into the changeset to see if it's defined
            if (sibling in changeset) {
              return [atom.target, changeset[sibling]];
            } else {
              throw ["unresolved", path];
            }
          }
          case "success": {
            const typedPath = maybeTypedPath.result;
            // simpleSpec already resolved reference setters into a field setters,
            // so here we should only check for fields
            const targetField = getRef.field(def, model.name, atom.target);
            const namePath = typedPath.nodes.map((p) => p.name);
            const access = [...namePath, typedPath.leaf.name];
            const field = getRef.field(def, typedPath.leaf.refKey);
            return [
              targetField.name,
              { kind: "reference-value", type: field.type, target: { alias: path[0], access } },
            ];
          }
        }
      }
    }
  }

  function atomToFieldSetters(
    atom: SimpleActionSpec["actionAtoms"][number],
    fieldsetNamespace: string[]
  ): [string, FieldSetter][] {
    switch (atom.kind) {
      case "input": {
        return atom.fields.map((fspec): [string, FieldSetterInput] => {
          const field = getRef.field(def, model.name, fspec.name);
          return [
            fspec.name,
            {
              kind: "fieldset-input",
              type: field.type,
              required: !fspec.optional,
              fieldsetAccess: [...fieldsetNamespace, fspec.name],
            },
          ];
        });
      }
      case "reference": {
        const reference = getRef.reference(def, model.name, atom.target);
        const throughField = getRef.field(def, reference.toModelRefKey, atom.through);
        return [
          [
            atom.target,
            {
              kind: "fieldset-reference-input",
              throughField: { name: atom.through, refKey: throughField.refKey },
              fieldsetAccess: [...fieldsetNamespace, atom.target, atom.through],
            },
          ],
        ];
      }
      case "set": {
        return [toFieldSetter(atom, changeset)];
      }
    }
  }

  const changeset: Changeset = {};
  let keyCount = _.keys(changeset).length;
  let shouldRetry = true;
  // eslint-disable-next-line no-constant-condition
  while (shouldRetry) {
    shouldRetry = false;
    simpleSpec.actionAtoms.forEach((atom) => {
      const result = safeInvoke(() => {
        const fieldsetNamespace =
          actionTargetScope === "target" ? _.compact([spec.alias]) : [simpleSpec.alias];
        const fs = atomToFieldSetters(atom, fieldsetNamespace);
        fs.forEach(([name, setter]) => (changeset[name] = setter));
      });
      if (result.kind === "error") {
        shouldRetry = true;
      }
    });
    if (shouldRetry && _.keys(changeset).length === keyCount) {
      // we had an iteration in which nothing was resolved, and there are still unresolved setters
      throw new Error(`Couldn't resolve all field setters`);
    }
    keyCount = _.keys(changeset).length;
  }

  // Set parent context, if any.
  switch (actionTargetScope) {
    case "model":
      break;
    case "target": {
      if (target.kind !== "model") {
        if (spec.kind === "create") {
          const [context, _target] = _.takeRight(targets, 2);
          const parentPath = [context.alias, target.name];
          const parent = getParentContextCreateSetter(def, ctx, parentPath);
          _.assign(changeset, parent);
        } // else: delete filter
      }
      break;
    }
    case "context-path": {
      if (spec.kind === "create") {
        const parent = getParentContextCreateSetter(def, ctx, spec.targetPath!);
        _.assign(changeset, parent);
      } // else: delete filter
    }
  }

  // TODO ensure changeset has covered every non-optional field in the model!

  // Build the desired `ActionDef`.
  return actionFromParts(spec, actionTargetScope, target, model, changeset);
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

/**

/**
 * Create a `Changeset` containing `reference-value` FieldSetter definition
 * setting a relation to a parent context.
 * Eg. in entrypoint chain Org->Repo->Issue, it constructs a setter
 * that sets `repo_id` on an `Issue` instance we're operating on.
 */
function getParentContextCreateSetter(def: Definition, ctx: VarContext, path: string[]): Changeset {
  const typedPath = getTypedPath(def, path, ctx);

  // no parent context if path is absolute (starting with model)
  if (typedPath.source.kind === "model") {
    return {};
  }

  // ensure path doesn't have a `leaf`
  ensureEqual(
    typedPath.leaf,
    null,
    `Path ${path.join(".")} must end with a relation, ending with ${typedPath.leaf?.kind}`
  );

  // Replace this check with a cardinality=many check instead.
  const last = _.last(typedPath.nodes)!; // this fn shoudln't be called when no nodes
  ensureEqual(
    last.kind,
    "relation",
    `Path ${path.join(".")} must end with a relation, ending with ${last.kind}`
  );

  // everything in between must be a (TODO: non-nullable??) reference
  _.initial(typedPath.nodes).forEach((tp, i) =>
    ensureEqual(
      tp.kind,
      "reference",
      `Transient elements in path ${path.join(".")} must be references; element[${i}] (${
        tp.name
      }) is a ${tp.kind}`
    )
  );

  // create a parent reference setter
  const relation = getRef.relation(def, last.refKey);
  const reference = getRef.reference(def, relation.throughRefKey);
  const referenceField = getRef.field(def, reference.fieldRefKey);

  // using _.initial to strip current context and only keep the parent context path
  const parentNamePath = _.initial(typedPath.nodes.map((p) => p.name));
  const setter: Changeset = {
    [referenceField.name]: {
      kind: "reference-value",
      type: "integer",
      target: {
        alias: typedPath.source.name,
        // set current field to a value from `parent.id`
        access: [...parentNamePath, "id"],
      },
    },
  };
  return setter;
}

interface SimpleActionSpec extends ActionSpec {
  alias: string;
  targetPath: string[];
  actionAtoms: Exclude<ActionAtomSpec, { kind: "action" } | { kind: "deny" }>[];
}

function simplifyActionSpec(
  def: Definition,
  spec: ActionSpec,
  targetAlias: string,
  // ctx: VarContext,
  model: ModelDef
): SimpleActionSpec {
  const atoms = spec.actionAtoms;

  // We don't support nested actions yet
  const actions = atoms.filter((a) => a.kind === "action");
  ensureEqual(actions.length, 0);

  const inputs = atoms
    .filter((a): a is ActionAtomSpecInput => a.kind === "input")
    .map((i): ActionAtomSpecInput => {
      /**
       * Convert reference inputs to field inputs.
       * TODO convert to reference inputs instead, to avoid runtime crashes, since
       *      we expect runtime to handle missing foreign keys and return proper errors.
       */
      return {
        ...i,
        fields: i.fields.map((fspec): InputFieldSpec => {
          const ref = getRef(def, model.name, fspec.name, ["field", "reference"]);
          switch (ref.kind) {
            case "field":
              return fspec;
            case "reference": {
              return { ...fspec, name: `${fspec.name}_id` };
            }
            default:
              assertUnreachable(ref);
          }
        }),
      };
    });

  // TODO ensure every refInput points to a reference field
  const refInputs = atoms.filter((a): a is ActionAtomSpecRefThrough => a.kind === "reference");
  const setters = atoms
    .filter((a): a is ActionAtomSpecSet => a.kind === "set")
    .map((a): ActionAtomSpecSet => {
      /*
       * Convert every reference setter to a field setter
       */
      const ref = getRef(def, model.name, a.target, ["field", "reference"]);
      switch (ref.kind) {
        case "reference": {
          ensureEqual(a.set.kind, "reference" as const); // reference setters can only target aliases
          return {
            ...a,
            kind: "set",
            target: `${a.target}_id`,
            set: { kind: "reference", reference: [...a.set.reference, "id"] },
          };
        }
        case "field": {
          return a;
        }
        default:
          assertUnreachable(ref);
      }
    });

  const denies = atoms
    .filter((a): a is ActionAtomSpecDeny => a.kind === "deny")
    .map((d, _index, array) => {
      if (d.fields === "*") {
        // ensure this is the only deny rule
        ensureEqual(array.length, 1);
        return d;
      }
      // convert deny references to fields
      const fields = d.fields.map((fname): string => {
        const ref = getRef(def, model.name, fname, ["field", "reference"]);
        switch (ref.kind) {
          case "reference":
            return `${fname}_id`;
          case "field":
            return fname;
          default:
            assertUnreachable(ref);
        }
      });
      return { ...d, fields };
    });

  /*
   * ensure no duplicate fields
   */
  const allFieldNames = [
    ...inputs.flatMap((i) => i.fields.map((f) => f.name)),
    ...refInputs.map((r) => `${r.target}_id`),
    ...setters.map((s) => s.target),
    ...denies.flatMap((d) => d.fields),
  ];
  const duplicates = _.chain(allFieldNames)
    .countBy()
    .toPairs()
    .filter(([_name, count]) => count > 1)
    .map(([name, _count]) => name)
    .value();

  const message = `Found duplicates: [${duplicates.join(", ")}]`;

  ensureEqual(allFieldNames.length, _.uniq(allFieldNames).length, message);

  // convert denies to implicit inputs
  const implicitInputs: ActionAtomSpecInput[] = [];
  const hasDenyAll = denies[0] && denies[0].fields === "*";
  if (!hasDenyAll) {
    /**
     * If user hasn't explicitely denied all the implicit inputs, let's find all fields
     * not used as targets in other rules
     */
    const modelFieldNames = model.fields.filter((f) => f.name !== "id").map((f) => f.name);
    const denyFieldNames = denies.flatMap((d) => d.fields as string[]);
    const implicitFieldNames = _.difference(modelFieldNames, allFieldNames, denyFieldNames);
    implicitInputs.push({
      kind: "input",
      fields: implicitFieldNames.map((name) => ({
        name,
        optional: spec.kind === "update", // Partial updates, implicit inputs are optional
      })),
    });
  }

  const simplifiedAtoms: SimpleActionSpec["actionAtoms"] = [
    ...inputs,
    ...refInputs,
    ...implicitInputs,
    ...setters,
  ];

  const targetPath = spec.targetPath ?? [targetAlias];

  // return simplified spec
  return {
    ...spec,
    alias: spec.alias || targetPath.join("|"),
    targetPath,
    actionAtoms: simplifiedAtoms,
  };
}

/**
 * Constructs an `ActionDef`.
 */
function actionFromParts(
  spec: ActionSpec,
  targetKind: ActionTargetScope,
  target: TargetDef,
  model: ModelDef,
  changeset: Changeset
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
