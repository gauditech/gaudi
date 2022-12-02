import _ from "lodash";

import { getTypedLiteralValue, getTypedPath } from "./utils";

import { getRef, getRef2, getTargetModel } from "@src/common/refs";
import { assertUnreachable, ensureEqual, ensureThrow } from "@src/common/utils";
import { EndpointType } from "@src/types/ast";
import {
  ActionDef,
  Changeset,
  Definition,
  FieldDef,
  FieldSetter,
  FieldSetterInput,
  FieldSetterReferenceInput,
  IdentifierDefField,
  IdentifierDefModel,
  IdentifierDefQuery,
  IdentifierDefReference,
  IdentifierDefRelation,
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
  ctx: Context
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
  getTypedPathFromContext(def, ctx, path);
  return "context-path";
}

/**
 * Extending the `IdentifierDef` and `getTypedPath` to work with contexts, also modifying the
 * type to be explicit about the source and a leaf of the path.
 * Source may be a `model`, eg. in `Item.object` or a `context`, eg. in `myitem.object`.
 * Leaf is a nullable property implying that path is, or isn't, ending with a field.
 * The `path` can neither be a field, model or context, and is everything in between:
 * reference, relation or a query.
 * Moving forward, this is likely to replace `getTypedPath` completely because context
 * will appear in other places as well.
 *
 * FIXME Consider `nullable`, `cardinality` and `retType` properties to every element,
 *       and to the structure root as well.
 * FIXME Consider adding `namePath` for ease of access when passing the data around.
 *       That property would also be useful for `getTypedPathFromContextEnding` which
 *       modifies the input path.
 */
type TypedPathItem = { kind: "context"; model: IdentifierDefModel; name: string };
type TypedContextPath = {
  source: IdentifierDefModel | TypedPathItem;
  path: (IdentifierDefReference | IdentifierDefRelation | IdentifierDefQuery)[];
  leaf: IdentifierDefField | null;
};
function getTypedPathFromContext(def: Definition, ctx: Context, path: string[]): TypedContextPath {
  if (_.isEmpty(path)) {
    throw new Error("Path is empty");
  }
  const [start, ...rest] = path;
  const isCtx = start in ctx;

  let startModel: string;

  if (isCtx) {
    startModel = ctx[start].type;
  } else {
    startModel = getRef<"model">(def, start).value.name;
  }
  const tpath = getTypedPath(def, [startModel, ...rest]);

  let source: TypedPathItem | IdentifierDefModel;
  if (isCtx) {
    source = {
      kind: "context",
      model: tpath[0] as IdentifierDefModel,
      name: start,
    };
  } else {
    source = tpath[0] as IdentifierDefModel;
  }
  if (_.last(tpath)!.kind === "field") {
    return {
      source,
      path: _.initial(_.tail(tpath)) as TypedContextPath["path"],
      leaf: _.last(tpath) as IdentifierDefField,
    };
  } else {
    return { source, path: _.tail(tpath) as TypedContextPath["path"], leaf: null };
  }
}
/**
 * `TypedContextPath` where `leaf` is not nullable.
 */
interface TypedContextPathWithLeaf extends TypedContextPath {
  leaf: IdentifierDefField;
}
/**
 * Constructs typed path from context (`getTypedPathFromContext`), but
 * ensures that path ends with a `leaf`. If original path doesn't end
 * with a `leaf`, this function appends `id` field at the end.
 */
function getTypedPathFromContextWithLeaf(
  def: Definition,
  ctx: Context,
  path: string[]
): TypedContextPathWithLeaf {
  const tpath = getTypedPathFromContext(def, ctx, path);
  if (tpath.leaf) {
    return tpath as TypedContextPathWithLeaf;
  } else {
    return getTypedPathFromContext(def, ctx, [...path, "id"]) as TypedContextPathWithLeaf;
  }
}

/**
 * Returns a model the changeset operates on. Taken from the end of the resolved path
 * which must not end with a `leaf`.
 *
 * FIXME this function is not specific to `changeset`, rename. This may be deprecated
 *       by proposed changes in `getTypedPathFromContext`.
 */
function findChangesetModel(def: Definition, ctx: Context, path: string[]): ModelDef {
  if (path.length === 1) {
    // check if model
    try {
      return getRef<"model">(def.models, path[0]).value;
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
  const typedPath = getTypedPathFromContext(def, ctx, path);
  if (typedPath.leaf) {
    throw new Error(`Path ${path.join(".")} doesn't resolve into a model`);
  }
  if (typedPath.path.length === 0) {
    // only source
    switch (typedPath.source.kind) {
      case "context": {
        return getRef<"model">(def, typedPath.source.model.refKey).value;
      }
      case "model": {
        return getRef<"model">(def, typedPath.source.refKey).value;
      }
    }
  } else {
    return getTargetModel(def.models, _.last(typedPath.path)!.refKey);
  }
}

/**
 * Create a `Changeset` containing `reference-value` FieldSetter definition
 * setting a relation to a parent context.
 * Eg. in entrypoint chain Org->Repo->Issue, it constructs a setter
 * that sets `repo_id` on an `Issue` instance we're operating on.
 */
function getParentContextCreateSetter(def: Definition, ctx: Context, path: string[]): Changeset {
  const typedPath = getTypedPathFromContext(def, ctx, path);

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

  // replace this check with a cardinality=many check instead.
  const last = _.last(typedPath.path)!;
  ensureEqual(
    last.kind,
    "relation",
    `Path ${path.join(".")} must end with a relation, ending with ${last.kind}`
  );

  // everything in between must be a (TODO: non-nullable??) reference
  _.initial(typedPath.path).forEach((tp, i) =>
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
  const parentNamePath = _.initial(typedPath.path.map((p) => p.name));
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
  ctx: Context
): Changeset {
  const pairs = spec.actionAtoms
    .filter((atom): atom is ActionAtomSpecSet => atom.kind === "set")
    .map((atom): [string, FieldSetter] => {
      switch (atom.set.kind) {
        case "value": {
          const typedVal = getTypedLiteralValue(atom.set.value);
          return [atom.target, { ...typedVal, kind: "value" }];
        }
        case "reference": {
          const path = atom.set.reference;
          // support both `set item item` and `set item_id item.id`

          const typedPath = getTypedPathFromContextWithLeaf(def, ctx, path);
          const ref = getRef2(def, model.name, atom.target);
          // support both field and reference setters, eg. `set item myitem` and `set item_id myitem.id`
          let targetField: FieldDef;
          switch (ref.kind) {
            // FIXME add a test for this case
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

          const namePath = typedPath.path.map((p) => p.name);
          const access = [...namePath, typedPath.leaf.name];
          const { value: field } = getRef<"field">(def, typedPath.leaf.refKey);
          return [
            targetField.name,
            { kind: "reference-value", type: field.type, target: { alias: path[0], access } },
          ];
        }
        default: {
          assertUnreachable(atom.set);
        }
      }
    });
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
            throughField: {
              name: throughField.name,
              refKey: throughField.refKey,
            },
            fieldsetAccess: [r.through],
          },
        ];
      })
  );
}

/**
 * Ensures that a default action kind matches the endpoint kind.
 * eg. on `create endpoint` there can only be a `create` specification
 * for a default action.
 */
function ensureCorrectDefaultActionKind(
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

/**
 * Composes a single `ActionDef` based on current variable context, entrypoint, endpoint and action specs.
 */
function composeSingleAction(
  def: Definition,
  spec: ActionSpec,
  ctx: Context,
  targets: TargetDef[],
  endpointKind: EndpointType
): ActionDef {
  const target = _.last(targets)!;
  const model = findChangesetModel(def, ctx, spec.targetPath ?? [target.alias]);

  // Targeting model, context-path or reimplementing a default action?
  const actionTargetScope = getActionTargetScope(def, spec, target.alias, ctx);
  // Overwriting a default action
  if (actionTargetScope === "target") {
    ensureCorrectDefaultActionKind(spec, target, endpointKind);
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

type Context = Record<string, ContextRecord>;
type ContextRecord = { type: string };

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

  // FIXME properly calculate default context based on endpointKind
  // FIXME this reduces makes little sense
  const ctx = Object.fromEntries(targets.map((t) => [t.alias, { type: t.retType }]));
  const [_ctx, actions] = specs.reduce(
    (acc, atom) => {
      const [ctx, actions] = acc;
      const action = composeSingleAction(def, atom, ctx, targets, endpointKind);
      if (action.kind !== "delete-one" && action.alias) {
        ctx[action.alias] = { type: action.model };
      }
      return [ctx, [...actions, action]];
    },
    [ctx, []] as [Context, ActionDef[]]
  );

  // Create a default context action if not specified in blueprint
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
        // no custom action here
        return actions;
      }
      default: {
        // make custom default action and insert at the beginning
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
