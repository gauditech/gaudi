import _ from "lodash";

import { getTypedLiteralValue, getTypedPath } from "./utils";

import { getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureThrow } from "@src/common/utils";
import { EndpointType } from "@src/types/ast";
import {
  ActionDef,
  Changeset,
  Definition,
  FieldSetter,
  FieldSetterInput,
  FieldSetterReferenceInput,
  IdentifierDef,
  IdentifierDefField,
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

type IdentifierDefContext = { kind: "context"; model: IdentifierDefModel; name: string };
type TypedContextPath = {
  source: IdentifierDefModel | IdentifierDefContext;
  path: IdentifierDef[];
  leaf: IdentifierDefField | null;
};
interface TypedContextPathEnding extends TypedContextPath {
  leaf: IdentifierDefField;
}

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

  let source: IdentifierDefContext | IdentifierDefModel;
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
    return { source, path: _.initial(_.tail(tpath)), leaf: _.last(tpath) as IdentifierDefField };
  } else {
    return { source, path: _.tail(tpath), leaf: null };
  }
}

function getTypedPathFromContextEnding(
  def: Definition,
  ctx: Context,
  path: string[]
): TypedContextPathEnding {
  if (_.isEmpty(path)) {
    throw new Error("Path is empty");
  }

  const tpath = getTypedPathFromContext(def, ctx, path);
  if (tpath.leaf) {
    return tpath as TypedContextPathEnding;
  } else {
    return getTypedPathFromContext(def, ctx, [...path, "id"]) as TypedContextPathEnding;
  }
}

/**
 * Returns a model the changeset operates on. Taken from the leaf of the resolved path.
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

function getParentContextCreateSetter(def: Definition, ctx: Context, path: string[]): Changeset {
  const typedPath = getTypedPathFromContext(def, ctx, path);
  // no parent context if path is absolute (starting with model)
  if (typedPath.source.kind === "model") {
    return {};
  }
  ensureEqual(typedPath.source.kind, "context");
  ensureEqual(
    typedPath.leaf,
    null,
    `Path ${path.join(".")} must end with a relation, ending with ${typedPath.leaf?.kind}`
  );

  /**
   * FIXME replace these checks with cardinality
   */
  const last = _.last(typedPath.path)!;
  ensureEqual(
    last.kind,
    "relation",
    `Path ${path.join(".")} must end with a relation, ending with ${last.kind}`
  );

  // everything in between must be a (non-nullable) reference!!!
  _.initial(typedPath.path).forEach((tp, i) =>
    ensureEqual(
      tp.kind,
      "reference",
      `Transient elements in path ${path.join(".")} must be references; element[${i}] (${
        tp.name
      }) is a ${tp.kind}`
    )
  );
  // set parent target reference

  const { value: relation } = getRef<"relation">(def, last.refKey);
  const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
  const { value: field } = getRef<"field">(def, reference.fieldRefKey);
  const namePath = _.initial(typedPath.path.map((p) => p.name));
  const setter: Changeset = {
    [field.name]: {
      kind: "reference-value",
      type: "integer",
      target: { alias: typedPath.source.name, access: [...namePath, "id"] },
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
          const typedPath = getTypedPathFromContextEnding(def, ctx, path);
          const referenceRefKey = `${model.name}.${atom.target}`;
          const { value: reference } = getRef<"reference">(def, referenceRefKey);
          const { value: referenceField } = getRef<"field">(def, reference.fieldRefKey);
          const namePath = typedPath.path.map((p) => p.name);
          const access = [...namePath, typedPath.leaf.name];
          const { value: field } = getRef<"field">(def, typedPath.leaf.refKey);
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
  const target = _.last(targets)!;
  const model = findChangesetModel(def, ctx, spec.targetPath ?? [target.alias]);
  let changeset: Changeset = {};

  const targetKind = getTargetKind(def, spec, target.alias, ctx);
  // Overwriting a default action
  if (targetKind === "target") {
    ensureCorrectContextAction(spec, target, endpointKind);
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
          _.compact([spec.alias!]),
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
  targets: TargetDef[],
  endpointKind: EndpointType
): ActionDef[] {
  const ctx = Object.fromEntries(targets.map((t) => [t.alias, { type: t.retType }]));
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

function createInputsChangesetForModel(
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
