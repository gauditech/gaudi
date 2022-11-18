import _ from "lodash";

import { getTypedLiteralValue, getTypedPath, getTypedPathEnding } from "./utils";

import { getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureNot } from "@src/common/utils";
import { EndpointType, SelectAST } from "@src/types/ast";
import {
  ActionDef,
  Changeset,
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldSetter,
  FieldSetterInput,
  FieldSetterReferenceInput,
  FieldsetDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetDef,
} from "@src/types/definition";
import {
  ActionAtomSpecDeny,
  ActionAtomSpecInput,
  ActionAtomSpecRefThrough,
  ActionAtomSpecSet,
  ActionSpec,
  EntrypointSpec,
} from "@src/types/specification";

export function composeEntrypoints(def: Definition, input: EntrypointSpec[]): void {
  def.entrypoints = input.map((spec) => processEntrypoint(def, spec, []));
}

type EndpointContext = {
  model: ModelDef;
  target: TargetDef;
};

function processEntrypoint(
  def: Definition,
  spec: EntrypointSpec,
  parents: EndpointContext[]
): EntrypointDef {
  const models = def.models;
  const target = calculateTarget(
    models,
    parents,
    spec.target.identifier,
    spec.target.alias ?? null,
    spec.identify || "id"
  );
  const name = spec.name;
  const targetModel = findModel(models, target.retType);

  const thisContext: EndpointContext = { model: targetModel, target };
  const targetParents = [...parents, thisContext];

  return {
    name,
    target,
    endpoints: processEndpoints(def, targetParents, spec),
    entrypoints: spec.entrypoints.map((ispec) => processEntrypoint(def, ispec, targetParents)),
  };
}

function calculateTarget(
  models: ModelDef[],
  parents: EndpointContext[],
  name: string,
  alias: string | null,
  identify: string
): TargetDef {
  const ctxModel = _.last(parents)?.model ?? null;
  const namePath = [...parents.map((p) => p.target.name), name];
  if (ctxModel) {
    const prop = getModelProp(ctxModel, name);
    switch (prop.kind) {
      case "reference": {
        const reference = prop.value;
        const model = findModel(models, reference.toModelRefKey);
        return {
          kind: "reference",
          name,
          namePath,
          retType: reference.toModelRefKey,
          refKey: reference.refKey,
          identifyWith: calculateIdentifyWith(model, identify),
          alias: alias || `$target_${parents.length}`,
        };
      }
      case "relation": {
        const relation = prop.value;
        const model = findModel(models, relation.fromModelRefKey);
        return {
          kind: "relation",
          name,
          namePath,
          retType: relation.fromModel,
          refKey: relation.refKey,
          identifyWith: calculateIdentifyWith(model, identify),
          alias: alias || `$target_${parents.length}`,
        };
      }
      case "query": {
        const query = prop.value;
        const model = findModel(models, query.retType);
        return {
          kind: "query",
          name,
          namePath,
          retType: query.retType,
          refKey: query.refKey,
          identifyWith: calculateIdentifyWith(model, identify),
          alias: alias || `$target_${parents.length}`,
        };
      }
      default: {
        throw `${prop.kind} is not a valid entrypoint target`;
      }
    }
  } else {
    const model = findModel(models, name);
    return {
      kind: "model",
      name,
      namePath,
      refKey: model.refKey,
      retType: model.name,
      identifyWith: calculateIdentifyWith(model, identify),
      alias: alias || `$target_${parents.length}`,
    };
  }
}

function calculateIdentifyWith(
  model: ModelDef,
  identify: string | undefined
): EntrypointDef["target"]["identifyWith"] {
  const name = identify ?? "id";
  const prop = getModelProp(model, name);
  switch (prop.kind) {
    case "field": {
      const field = prop.value;
      if (field.type === "boolean") {
        throw "invalid-type";
      }
      return {
        name,
        type: field.type,
        refKey: field.refKey,
        paramName: `${model.name.toLowerCase()}_${name}`,
      };
    }
    default:
      throw "invalid-kind";
  }
}

function processEndpoints(
  def: Definition,
  parents: EndpointContext[],
  entrySpec: EntrypointSpec
): EndpointDef[] {
  const models = def.models;
  const context = _.last(parents)!;
  const targets = parents.map((p) => p.target);

  return entrySpec.endpoints.map((endSpec): EndpointDef => {
    const target = _.last(targets)!;

    // FIXME add @auth
    // FIXME what to do with @data?
    const ctx = { [target.alias]: { type: target.retType } };

    const actions = composeActionBlock(def, endSpec.action ?? [], ctx, targets, endSpec.type);

    switch (endSpec.type) {
      case "get": {
        return {
          kind: "get",
          response: processSelect(
            models,
            context.model,
            entrySpec.response,
            context.target.namePath
          ),
          actions,
          targets,
        };
      }
      case "list": {
        return {
          kind: "list",
          response: processSelect(
            models,
            context.model,
            entrySpec.response,
            context.target.namePath
          ),
          actions,
          targets,
        };
      }
      case "create": {
        const fieldset = calculateCreateFieldsetForModel(context.model);
        const changeset = createInputsChangesetForModel(context.model, true, []);
        return {
          kind: "create",
          fieldset,
          contextActionChangeset: changeset,
          actions,
          targets,
          response: processSelect(
            models,
            context.model,
            entrySpec.response,
            context.target.namePath
          ),
        };
      }
      case "update": {
        const fieldset = calculateUpdateFieldsetForModel(context.model);
        const changeset = createInputsChangesetForModel(context.model, false, []);
        return {
          kind: "update",
          fieldset,
          contextActionChangeset: changeset,
          actions,
          targets,
          response: processSelect(
            models,
            context.model,
            entrySpec.response,
            context.target.namePath
          ),
        };
      }
      case "delete": {
        return {
          kind: "delete",
          actions,
          targets,
          response: undefined,
        };
      }
    }
  });
}

type ActionScope = "model" | "context";

function getTargetKind(def: Definition, spec: ActionSpec, targetAlias: string): ActionScope {
  const path = spec.targetPath;
  if (!path) {
    return "context";
  }
  if (path.length === 1) {
    if (path[0] === targetAlias) {
      return "context";
    }
    const model = def.models.find((m) => m.name === path[0]);
    if (model) {
      return "model";
    }
  }
  throw new Error("TODO");
}

function getTypedPathFromContext(def: Definition, ctx: Context, path: string[]) {
  if (_.isEmpty(path)) {
    throw new Error("Path is empty");
  }
  const [start, ...rest] = path;
  if (!(start in ctx)) {
    throw new Error(`${start} is not in the context`);
  }
  const startModel = ctx[start].type;
  return getTypedPath(def, [startModel, ...rest]);
}

function findChangesetModel(def: Definition, ctx: Context, path: string[]): ModelDef {
  if (path.length === 1) {
    // check if model
    try {
      return findModel(def.models, path[0]);
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
      return findModel(def.models, leaf.name);
    }
    default: {
      return getTargetModel(def.models, leaf.refKey);
    }
  }
}

function getParentContextCreateSetter(def: Definition, targets: TargetDef[]): Changeset {
  const contextTarget = _.last(_.initial(targets));
  const target = _.last(targets)!;
  // set parent target reference
  if (target.kind === "model" || !contextTarget) {
    return {};
  } else if (target.kind === "relation") {
    const { value: relation } = getRef<"relation">(def, target.refKey);
    const { value: field } = getRef<"field">(def, relation.throughRefKey);
    const setter: Changeset = {
      [field.name]: {
        kind: "reference-value",
        type: "integer",
        target: { alias: contextTarget.alias, access: ["id"] },
      },
    };
    return setter;
  } else {
    throw new Error(`Can't create an action when targeting ${target.kind}`);
  }
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
  const alias = targetKind === "context" && spec.kind === "create" ? target.alias : spec.alias!; // FIXME come up with an alias in case of nested actions

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
  const target = _.last(targets)!;
  const model = findChangesetModel(def, ctx, spec.targetPath ?? [target.alias]);

  let changeset: Changeset = {};

  const targetKind = getTargetKind(def, spec, target.alias);
  // Overwriting a context action
  if (targetKind === "context") {
    ensureCorrectContextAction(spec, target, endpointKind);
    if (spec.kind === "create") {
      _.assign(changeset, getParentContextCreateSetter(def, targets));
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

function composeActionBlock(
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
      if (action.kind === "create-one") {
        ctx[action.alias] = { type: action.model };
      }
      return [ctx, [...actions, action]];
    },
    [ctx, []] as [Context, ActionDef[]]
  );
  // FIXME Create a default context action if not specified in blueprint
  // find default action
  const target = _.last(targets)!;
  const defaultActions = specs.filter((spc) => getTargetKind(def, spc, target.alias) === "context");
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
            alias: target.alias,
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

function processSelect(
  models: ModelDef[],
  model: ModelDef,
  selectAST: SelectAST | undefined,
  namePath: string[]
): SelectDef {
  if (selectAST === undefined) {
    return model.fields.map((f) => ({
      kind: "field",
      name: f.name,
      alias: f.name,
      namePath: [...namePath, f.name],
      refKey: f.refKey,
    }));
  } else {
    if (selectAST.select === undefined) {
      // throw new Error(`Select block is missing`);
      // for simplicity, we will allow missing nested select blocks
      return model.fields.map((f) => ({
        kind: "field",
        name: f.name,
        alias: f.name,
        namePath: [...namePath, f.name],
        refKey: f.refKey,
      }));
    }
    const s = selectAST.select;

    return Object.keys(selectAST.select).map((name: string): SelectItem => {
      // what is this?
      const ref = getModelProp(model, name);
      if (ref.kind === "field") {
        ensureEqual(s[name].select, undefined);
        return {
          kind: ref.kind,
          name,
          alias: name,
          namePath: [...namePath, name],
          refKey: ref.value.refKey,
        };
      } else {
        ensureNot(ref.kind, "model" as const);
        const targetModel = getTargetModel(models, ref.value.refKey);
        return {
          kind: ref.kind,
          name,
          namePath: [...namePath, name],
          alias: name,
          select: processSelect(models, targetModel, s[name], [...namePath, name]),
        };
      }
    });
  }
}

export function calculateCreateFieldsetForModel(model: ModelDef): FieldsetDef {
  const fields = model.fields
    .filter((f) => !f.primary)
    .map((f): [string, FieldsetDef] => [
      f.name,
      {
        kind: "field",
        nullable: f.nullable,
        type: f.type,
        required: true,
        validators: f.validators,
      },
    ]);
  return { kind: "record", nullable: false, record: Object.fromEntries(fields) };
}

export function calculateUpdateFieldsetForModel(model: ModelDef): FieldsetDef {
  const fields = model.fields
    .filter((f) => !f.primary)
    .map((f): [string, FieldsetDef] => [
      f.name,
      {
        kind: "field",
        nullable: f.nullable,
        type: f.type,
        required: false,
        validators: f.validators,
      },
    ]);
  return { kind: "record", nullable: false, record: Object.fromEntries(fields) };
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

function findModel(models: ModelDef[], name: string): ModelDef {
  const model = models.find((m) => m.name === name);
  if (!model) {
    throw ["model-not-defined", name];
  }
  return model;
}
