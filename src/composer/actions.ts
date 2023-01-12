import _ from "lodash";

import { VarContext, getTypedLiteralValue, getTypedPath, getTypedPathWithLeaf } from "./utils";

import { getRef, getRef2, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureThrow } from "@src/common/utils";
import { EndpointType } from "@src/types/ast";
import {
  ActionDef,
  Changeset,
  Definition,
  FieldDef,
  FieldSetter,
  FieldSetterInput,
  FieldSetterReferenceInput,
  ModelDef,
  TargetDef,
} from "@src/types/definition";
import {
  ActionAtomSpecDeny,
  ActionAtomSpecInput,
  ActionAtomSpecRefThrough,
  ActionAtomSpecSet,
  ActionSpec,
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
    if (spec.alias) {
      const message = `Cannot name an action with ${spec.alias}, name already exists in the context`;
      ensureThrow(() => getRef(def, spec.alias!), message);
      ensureEqual(spec.alias! in ctx, false, message);
    }
    /*
    FIXME with updates, we currently require re-aliasing in order to refresh the data to match updated values.
    In other words, referencing a target path that was previously updated would reference stale values.

    FIXME this check is not needed, but we currently require aliases in order to construct the fieldsets.
    This should be improved in the future.

    We don't need an alias when:
    - related action (eg. `update org.owner.profile`)
    - model action without fieldsets (eg. `create AuditLog`)

    We should also check for conflicts between non-aliased context action ("root path") fields and any action aliases.

    The rules for constructing the fieldset:
    - non-named context action fields are in the root record (eg. `create {}`)
    - aliased actions are nested within alias path (named context counts as alias if explicit alias not given)
    - ensure no conflicts between aliases AND ensure no conflicts between aliases and context action fields if non-named
  */
    if (!spec.alias) {
      throw new Error(`We currently require every custom action to have an explicit alias`);
    }
  }

  /**
   * Build a changeset
   */
  const changeset: Changeset = {};
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
  // Parsing an action spec for `set` atoms
  _.assign(changeset, getActionSetters(def, spec, model, ctx));
  // ... reference inputs
  const referenceInputs = getReferenceInputs(def, model, spec);
  // ... field inputs
  const inputs = getInputSetters(def, model, spec);

  // Ensure no overlap between inputs and reference inputs.
  ensureEqual(
    _.intersection(Object.keys(inputs), Object.keys(referenceInputs)).length,
    0,
    "Overlap between reference inputs and field inputs"
  );

  // Ensure no field inputs for reference inputs
  // FIXME ref to field translation is hackish but it works :)
  const fieldsFromReferences = Object.keys(referenceInputs).map((name) => `${name}_id`);
  ensureEqual(
    _.intersection(fieldsFromReferences, Object.keys(inputs)).length,
    0,
    "Cannot reference and input the same field"
  );

  // Update changeset with inputs.
  _.assign(changeset, referenceInputs, inputs);

  /**
   *  Filling implicit inputs based on a `deny` strategy.
   */
  const denyRules = spec.actionAtoms.filter((a): a is ActionAtomSpecDeny => a.kind === "deny");
  if (denyRules.length > 1) {
    // FIXME should be aggregated instead?
    throw new Error(`Multiple deny rules not allowed`);
  }
  // ensure no overlap between input and explicit denies
  const explicitDenyFields = denyRules[0]?.fields === "*" ? [] : denyRules[0]?.fields ?? [];
  ensureEqual(
    _.intersection(Object.keys(inputs), explicitDenyFields).length,
    0,
    "Overlapping inputs and deny rule"
  );

  // Calculate implicit inputs.
  const implicitInputs =
    denyRules[0]?.fields === "*"
      ? {}
      : createRemainingInputsChangesetForModel(
          model,
          spec.kind === "create",
          _.compact([spec.alias!]),
          // ensure existing field definitions are skipped
          _.union(denyRules[0]?.fields, fieldsFromReferences, Object.keys(changeset))
        );

  // Finally, assign the remaining partial changesets into a main changeset.
  _.assign(changeset, implicitInputs);

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
      return getRef2.model(def, path[0]);
      // eslint-disable-next-line no-empty
    } catch (e) {}
    // Not a model, check if initialization of a default target.ß
    const inCtx = path[0] in ctx;
    if (!inCtx) {
      if (path[0] === target.alias) {
        return getRef2.model(def, target.retType);
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
        return getRef2.model(def, typedPath.source.model.refKey);
      }
      case "model": {
        return getRef2.model(def, typedPath.source.refKey);
      }
    }
  } else {
    return getTargetModel(def.models, _.last(typedPath.nodes)!.refKey);
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
  const { value: relation } = getRef<"relation">(def, last.refKey);
  const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
  const { value: referenceField } = getRef<"field">(def, reference.fieldRefKey);

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

/**
 * Creates a `Changeset` containing `reference-value` and `value` FieldSetter definitions
 * based on the action spec.
 */
function getActionSetters(
  def: Definition,
  spec: ActionSpec,
  model: ModelDef,
  ctx: VarContext
): Changeset {
  function toFieldSetter(atom: ActionAtomSpecSet): [string, FieldSetter] {
    switch (atom.set.kind) {
      case "hook": {
        const args = _.chain(atom.set.hook.args)
          .mapValues((arg) => toFieldSetter({ kind: "set", target: atom.target, set: arg })[1])
          .value();
        return [atom.target, { kind: "fieldset-hook", code: atom.set.hook.code, args }];
      }
      case "literal": {
        const typedVal = getTypedLiteralValue(atom.set.value);
        return [atom.target, typedVal];
      }
      case "reference": {
        const path = atom.set.reference;

        const typedPath = getTypedPathWithLeaf(def, path, ctx);
        const ref = getRef2(def, model.name, atom.target);
        // support both field and reference setters, eg. `set item myitem` and `set item_id myitem.id`
        let targetField: FieldDef;
        switch (ref.kind) {
          case "field": {
            targetField = ref.value;
            break;
          }
          case "reference": {
            targetField = getRef2.field(def, ref.value.fieldRefKey);
            break;
          }
          default: {
            throw new Error(`Cannot set a value from a ${ref.kind}`);
          }
        }

        const namePath = typedPath.nodes.map((p) => p.name);
        const access = [...namePath, typedPath.leaf.name];
        const { value: field } = getRef<"field">(def, typedPath.leaf.refKey);
        return [
          targetField.name,
          { kind: "reference-value", type: field.type, target: { alias: path[0], access } },
        ];
      }
    }
  }

  const pairs = spec.actionAtoms
    .filter((atom): atom is ActionAtomSpecSet => atom.kind === "set")
    .map(toFieldSetter);
  const duplicates = _.chain(pairs)
    .countBy(_.first)
    .toPairs()
    .filter((pair) => pair[1] > 1)
    .map((pair) => pair[0])
    .value();
  if (duplicates.length) {
    throw new Error(`Duplicate setters for fields: [${duplicates.join(", ")}]`);
  }
  return Object.fromEntries(pairs);
}

/**
 * Creates a `Changeset` containing `fieldset-input` FieldSetter definitions
 * based on the action spec.
 */
function getInputSetters(def: Definition, model: ModelDef, spec: ActionSpec): Changeset {
  const setters: Changeset = Object.fromEntries(
    spec.actionAtoms
      .filter((a): a is ActionAtomSpecInput => a.kind === "input")
      .flatMap((a) => a.fields)
      .map((input): [string, FieldSetterInput] => {
        const { kind, value: field } = getRef<"field">(def, `${model.refKey}.${input.name}`);
        ensureEqual(kind, "field");
        const setter: FieldSetter = {
          kind: "fieldset-input",
          type: field.type,
          required: !input.optional,
          fieldsetAccess: [input.name],
          // TODO add default
        };
        return [input.name, setter];
      })
  );
  return setters;
}

/**
 * Creates a `Changeset` containing `fieldset-reference-input` FieldSetter definitions
 * based on the action spec.
 */
function getReferenceInputs(def: Definition, model: ModelDef, spec: ActionSpec): Changeset {
  return Object.fromEntries(
    spec.actionAtoms
      .filter((a): a is ActionAtomSpecRefThrough => a.kind === "reference")
      .map((r): [string, FieldSetterReferenceInput] => {
        const ref = getRef<"reference">(def, `${model.name}.${r.target}`);
        ensureEqual(ref.kind, "reference");
        const reference = ref.value;
        const { value: refModel } = getRef<"model">(def, reference.toModelRefKey);
        const { value: throughField } = getRef<"field">(def, `${refModel.refKey}.${r.through}`);
        return [
          reference.name,
          {
            kind: "fieldset-reference-input",
            throughRefKey: throughField.refKey,
            fieldsetAccess: [r.target + "_" + r.through],
          },
        ];
      })
  );
}

/**
 * Takes all the fields from `model`, omitting the ones in `skipFields`, and returns
 * a `Changeset`.
 */
function createRemainingInputsChangesetForModel(
  model: ModelDef,
  required: boolean,
  namePath: string[],
  skipFields: string[]
): Changeset {
  const fields = model.fields
    .filter((f) => !f.primary)
    .filter((f) => {
      return skipFields.indexOf(f.name) === -1;
    })
    .map((f): [string, FieldSetter] => [
      f.name,
      { kind: "fieldset-input", type: f.type, fieldsetAccess: [...namePath, f.name], required },
    ]);

  return Object.fromEntries(fields);
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
