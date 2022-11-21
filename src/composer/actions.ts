import _ from "lodash";

import { getTypedLiteralValue, getTypedPath, getTypedPathEnding } from "./utils";

import { getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureExists, ensureThrow } from "@src/common/utils";
import { EndpointType } from "@src/types/ast";
import {
  ActionDef,
  Changeset,
  Definition,
  FieldSetter,
  FieldSetterInput,
  FieldSetterReferenceInput,
  IdentifierDef,
  IdentifierDefModel,
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

type ActionScope = "model" | "target" | "context-path";

function getTargetKind(
  def: Definition,
  spec: ActionSpec,
  targetAlias: string,
  ctx: Context
): ActionScope {
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
  // just ensure it doesn't crash
  getTypedPathFromContext(def, ctx, path);
  return "context-path";
}

type TypedContextPath =
  | IdentifierDef
  | { kind: "context"; model: IdentifierDefModel; name: string };

function getTypedPathFromContext(
  def: Definition,
  ctx: Context,
  path: string[]
): TypedContextPath[] {
  if (_.isEmpty(path)) {
    throw new Error("Path is empty");
  }
  const [start, ...rest] = path;
  if (!(start in ctx)) {
    throw new Error(`${start} is not in the context`);
  }
  const startModel = ctx[start].type;
  const tpath = getTypedPath(def, [startModel, ...rest]);
  return [
    { kind: "context", model: tpath[0] as IdentifierDefModel, name: start },
    ..._.tail(tpath),
  ];
}

function findChangesetModel(def: Definition, ctx: Context, path: string[]): ModelDef {
  if (path.length === 1) {
    // check if model
    try {
      return getRef<"model">(def.models, path[0]).value;
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
  const typedPath = getTypedPathFromContext(def, ctx, path);
  const leaf = _.last(typedPath)!;
  switch (leaf.kind) {
    case "field": {
      throw new Error(`Path ${path.join(".")} doesn't resolve into a model`);
    }
    case "model": {
      return getRef<"model">(def.models, leaf.name).value;
    }
    case "context": {
      return getRef<"model">(def.models, leaf.model.refKey).value;
    }
    default: {
      return getTargetModel(def.models, leaf.refKey);
    }
  }
}

// from target:
// Org, repos ==> from Org.repos // set org.id to repo on create
// from related context:
// create repo.issue ==> relation
// create repo.author ==> reference
// so we can only support:
// - on create : relation
// - on update : reference
function getParentContextCreateSetter(def: Definition, ctx: Context, path: string[]): Changeset {
  const typedPath = getTypedPathFromContext(def, ctx, path);
  // no parent context if path is absolute (starting with model)
  if (typedPath[0]!.kind === "model") {
    return {};
  }
  /**
   * FIXME replace these checks with cardinality
   */
  const [start, ...rest] = typedPath;
  const transient = _.initial(rest);
  const leaf = _.last(rest)!;
  ensureEqual(start.kind, "context");
  // last leaf must be a relation
  if (leaf.kind !== "relation") {
    throw new Error(
      `Path ${path.join(".")} must end with a relation, ending with ${
        _.last(typedPath)!.kind
      } instead`
    );
  }
  // everything in between must be a (non-nullable) reference!!!
  _.tail(transient).forEach((tp, i) =>
    ensureEqual(
      tp.kind,
      "reference",
      `Transient elements in path ${path.join(".")} must be references; element[${i}] (${
        tp.name
      }) is a ${tp.kind}`
    )
  );
  // set parent target reference

  const { value: relation } = getRef<"relation">(def, leaf.refKey);
  const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
  const { value: field } = getRef<"field">(def, reference.fieldRefKey);
  const setter: Changeset = {
    [field.name]: {
      kind: "reference-value",
      type: "integer",
      target: { alias: start.name, access: [..._.map(transient, "name"), "id"] },
    },
  };
  return setter;
}

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
          const ctxTypedPath = getTypedPathFromContext(def, ctx, path);
          const referenceRefKey = `${model.name}.${atom.target}`;
          const { value: reference } = getRef<"reference">(def, referenceRefKey);
          const { value: referenceField } = getRef<"field">(def, reference.fieldRefKey);
          const typedPathEnding = getTypedPathEnding(def, _.map(ctxTypedPath, "name"));
          const access = _.tail(_.map(typedPathEnding, "name"));
          const { value: field } = getRef<"field">(def, _.last(typedPathEnding)!.refKey);
          return [
            referenceField.name,
            { kind: "reference-value", type: field.type, target: { alias: path[0], access } },
          ];
        }
        default: {
          throw new Error("should be unreachable");
        }
      }
    });
  return Object.fromEntries(pairs);
}

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

function ensureCorrectContextAction(
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

// type Without<T, K extends keyof T> = T extends T ? Omit<T, K> : never;

function mkActionFromParts(
  spec: ActionSpec,
  targetKind: ActionScope,
  target: TargetDef,
  model: ModelDef,
  changeset: Changeset
): ActionDef {
  const alias = targetKind === "target" && spec.kind === "create" ? target.alias : spec.alias!; // FIXME come up with an alias in case of nested actions

  switch (spec.kind) {
    case "create": {
      return { kind: "create-one", alias, changeset, model: model.name, response: [] };
    }
    case "update": {
      // FIXME update-many when targetKind is model
      return { kind: "update-one", changeset, alias, model: model.name, response: [] };
    }
    case "delete": {
      throw new Error("Delete is not supported");
    }
  }
}

function composeSingleAction(
  def: Definition,
  spec: ActionSpec,
  ctx: Context,
  targets: TargetDef[],
  endpointKind: EndpointType
): ActionDef {
  // ensure alias doesn't reuse an existing name
  if (spec.alias) {
    const message = `Cannot name an action with ${spec.alias}, name already exists in the context`;
    ensureThrow(() => getRef(def, spec.alias!), message);
    ensureEqual(spec.alias! in ctx, false, message);
  }
  const target = _.last(targets)!;
  const model = findChangesetModel(def, ctx, spec.targetPath ?? [target.alias]);

  let changeset: Changeset = {};

  const targetKind = getTargetKind(def, spec, target.alias, ctx);
  // Overwriting a default action
  if (targetKind === "target") {
    ensureCorrectContextAction(spec, target, endpointKind);
  } else {
    /*
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

  // set parent context, if any
  switch (targetKind) {
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

  // Parsing an action specification
  _.assign(changeset, getActionSetters(def, spec, model, ctx));

  const denyRules = spec.actionAtoms.filter((a): a is ActionAtomSpecDeny => a.kind === "deny");
  if (denyRules.length > 1) {
    // FIXME should be aggregated instead?
    throw new Error(`Multiple deny rules not allowed`);
  }
  // reference inputs
  const referenceInputs = getReferenceInputs(def, model, spec);
  // field inputs
  const inputs = getInputSetters(def, model, spec);
  // ensure no overlap between input and explicit denies
  const explicitDenyFields = denyRules[0]?.fields === "*" ? [] : denyRules[0]?.fields ?? [];
  ensureEqual(
    _.intersection(Object.keys(inputs), explicitDenyFields).length,
    0,
    "Overlapping inputs and deny rule"
  );

  // ensure no overlap between inputs and reference inputs
  ensureEqual(
    _.intersection(Object.keys(inputs), Object.keys(referenceInputs)).length,
    0,
    "Overlap between reference inputs and field inputs"
  );
  // ensure no field inputs for reference inputs FIXME ref to field translation is lazy :)
  const fieldsFromReferences = Object.keys(referenceInputs).map((name) => `${name}_id`);
  ensureEqual(
    _.intersection(fieldsFromReferences, Object.keys(inputs)).length,
    0,
    "Cannot reference and input the same field"
  );
  // calculate implicit inputs
  const implicitInputs =
    denyRules[0]?.fields === "*"
      ? {}
      : createInputsChangesetForModel(
          model,
          spec.kind === "create",
          _.union(denyRules[0]?.fields, fieldsFromReferences) // ensure reference fields are skipped
        );
  // assign inputs
  changeset = _.assign({}, implicitInputs, inputs, referenceInputs, changeset);

  // Define action
  return mkActionFromParts(spec, targetKind, target, model, changeset);
}

type Context = Record<string, ContextRecord>;
type ContextRecord = { type: string };

export function composeActionBlock(
  def: Definition,
  specs: ActionSpec[],
  ctx: Context,
  targets: TargetDef[],
  endpointKind: EndpointType
): ActionDef[] {
  const [_ctx, actions] = specs.reduce(
    (acc, atom) => {
      const [ctx, actions] = acc;
      const action = composeSingleAction(def, atom, ctx, targets, endpointKind);
      if (action.alias) {
        ctx[action.alias] = { type: action.model };
      }
      return [ctx, [...actions, action]];
    },
    [ctx, []] as [Context, ActionDef[]]
  );
  // FIXME Create a default context action if not specified in blueprint
  // find default action
  const target = _.last(targets)!;
  const defaultActions = specs.filter(
    (spec) => getTargetKind(def, spec, target.alias, ctx) === "target"
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
            alias: endpointKind === "update" ? "$target:updated" : undefined,
            targetPath: [target.alias],
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

export function createInputsChangesetForModel(
  model: ModelDef,
  required: boolean,
  skipFields: string[]
): Changeset {
  const fields = model.fields
    .filter((f) => !f.primary)
    .filter((f) => {
      return skipFields.indexOf(f.name) === -1;
    })
    .map((f): [string, FieldSetter] => [
      f.name,
      { kind: "fieldset-input", type: f.type, fieldsetAccess: [f.name], required },
    ]);

  return Object.fromEntries(fields);
}
