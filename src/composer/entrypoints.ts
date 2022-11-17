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
  FieldDef,
  FieldSetter,
  FieldsetDef,
  IdentifierDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetDef,
} from "@src/types/definition";
import {
  ActionAtomSpec,
  ActionAtomSpecAction,
  ActionAtomSpecDeny,
  ActionAtomSpecSet,
  ActionSpec,
  EndpointSpec,
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
        const changeset = calculateCreateChangesetForModel(context.model);
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
        const changeset = calculateUpdateChangesetForModel(context.model);
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

// function getReferenceValueSetter(
//   def: Definition,
//   name: string,
//   path: string[]
//   // ctxModel: ModelDef,
//   // ctx: ActionContextMap
// ): [string, FieldSetter, ActionDef[]] {
//   const typedPath = getTypedPath(def, path);
//   const leaf = _.last(typedPath)!;
//   switch (leaf.kind) {
//     case "model":
//     case "query":
//     case "relation":
//       throw new Error(`Can't reference a ${leaf.kind}`);
//     case "reference": {
//       const { value: reference } = getRef<"reference">(def, leaf.refKey);
//       const { value: field } = getRef<"field">(def, reference.fieldRefKey);
//       return [
//         field.name,
//         {
//           kind: "reference-value",
//           type: field.type,
//           target: { alias: "TODO", access: [...path, "id"] },
//         },
//         [],
//       ];
//     }
//     case "field": {
//       const { value: field } = getRef<"field">(def, leaf.refKey);
//       return [
//         name,
//         { kind: "reference-value", type: field.type, target: { alias: "TODO", access: path } },
//         [],
//       ];
//     }
//   }
// }

// function composeAction(
//   def: Definition,
//   action: ActionSpec,
//   context: ActionContextMap
// ): ActionDef[] {
//   const setters = action.actionAtoms.map((act): [string, FieldSetter, ActionDef[]] => {
//     switch (act.kind) {
//       case "set": {
//         // this may set a literal or a reference value
//         if (act.set.kind === "value") {
//           return [act.target, { ...getTypedLiteralValue(act.set.value), kind: "value" }, []];
//         } else {
//           return getReferenceValueSetter(def, act.target, act.set.reference);
//         }
//       }
//       case "reference": {
//         return [
//           act.target,
//           {
//             kind: "fieldset-reference-input",
//             throughField: { name: act.through, refKey: "TODO" },
//             fieldsetAccess: [act.target],
//           },
//           [],
//         ];
//       }
//       case "action": {
//         throw new Error("TODO nested actions");
//         // compose inner action
//         // const inner = composeAction(def, act.body, context);
//         // return [
//         //   {
//         //     kind: "reference-value",
//         //     target: { alias: "", access: act.body.targetPath },
//         //     type: "text", // FIXME
//         //   },
//         //   inner,
//         // ];
//       }
//     }
//   });
//   const changeset: Changeset = Object.fromEntries(setters);

//   if (action.kind === "create") {
//     return [
//       {
//         kind: "create-one",
//         targetPath: action.targetPath!, // FIXME !
//         changeset,
//         alias: "FIXME",
//         response: [],
//       },
//     ];
//   } else if (action.kind === "update") {
//     return [
//       {
//         kind: "update-one",
//         targetPath: action.targetPath!, // FIXME !
//         changeset,
//       },
//     ];
//   } else if (action.kind === "delete") {
//     throw new Error(`Delete actions not supported yet`);
//   } else {
//     assertUnreachable(action.kind);
//   }
// }

// function actionAtomToFieldSetter(
//   def: Definition,
//   ctx: ModelDef, // context record that's CRD-ed
//   contextVars: Record<string, ModelDef>, // all defined variables
//   atom: ActionAtomSpec
// ): FieldSetter {
//   switch (atom.kind) {
//     case "set": {
//       const set = atom.set;
//       switch (set.kind) {
//         case "value": {
//           return {
//             kind: "value",
//             value: set.value,
//             type: getTypedLiteralValue(set.value),
//           } as FieldSetter;
//         }
//         case "reference": {
//           const path = set.reference;
//           const identityPath = getTypedPath(def, [ctx.name, ...path]);
//           const leaf = _.last(identityPath)!;
//           if (leaf.kind === "field") {
//             const { value: field } = getRef<"field">(def, leaf.refKey);
//             return {
//               kind: "reference-value",
//               type: field.type,
//               target: {
//                 alias: "",
//                 access: path,
//               },
//             };
//           } else {
//             const targetModel = getTargetModel(def.models, leaf.refKey);
//             const { value: field } = getRef<"field">(def, `${targetModel.refKey}.id`);
//             return {
//               kind: "reference-value",
//               type: field.type,
//               target: {
//                 alias: "",
//                 access: path,
//               },
//             };
//           }
//         }
//       }
//     }
//     // Due to bug in eslint/prettier, linter complains that `break` is expected in the case "set"
//     // Since inner switch is exaustive, break is unreachable so prettier deletes it
//     // eslint-disable-next-line no-fallthrough
//     case "reference": {
//       return {
//         kind: "fieldset-reference-input",
//         fieldsetAccess: [atom.target, atom.through],
//         throughField: { name: atom.through, refKey: "" },
//       };
//     }
//   }
// }

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

  // calculate implicit inputs
  const denyRules = spec.actionAtoms.filter((a): a is ActionAtomSpecDeny => a.kind === "deny");
  if (denyRules.length > 1) {
    throw new Error(`Multiple deny rules not allowed`);
  }
  const implicitInputs = createInputsChangesetForModel(model, spec.kind === "create", denyRules[0]);
  // apply deny rules
  // overwrite with custom inputs
  // assign inputs
  const inputs = implicitInputs;
  changeset = _.assign({}, inputs, changeset);

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
  /**
   * Ako nema defaultnog actiona, treba ga postaviti, osim u `custom` endpointima
   *
   */
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
  return actions;
}

/*
Nested actions:
NE PODRZAVAMO NESTED ACTIONE ZA SADA!!
- each action can:
  - show up in context (if root)
  - become a setter (if nested)


Ordering:
- custom input
- setter
- deny rule:
  - explicit deny: "skip" // deny id, slug
  - implicit deny: "placeholder-default-input" // deny *
*/

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

function createInputsChangesetForModel(
  model: ModelDef,
  required: boolean,
  deny?: ActionAtomSpecDeny
): Changeset {
  if (deny?.fields === "*") {
    return {};
  }
  const fields = model.fields
    .filter((f) => !f.primary)
    .filter((f) => {
      return (deny?.fields ?? []).indexOf(f.name) === -1;
    })
    .map((f): [string, FieldSetter] => [
      f.name,
      { kind: "fieldset-input", type: f.type, fieldsetAccess: [f.name], required },
    ]);

  return Object.fromEntries(fields);
}

export function calculateCreateChangesetForModel(model: ModelDef): Changeset {
  const fields = model.fields
    .filter((f) => !f.primary)
    .map((f): [string, FieldSetter] => [
      f.name,
      { kind: "fieldset-input", type: f.type, fieldsetAccess: [f.name], required: true },
    ]);
  return Object.fromEntries(fields);
}

export function calculateUpdateChangesetForModel(model: ModelDef): Changeset {
  const fields = model.fields
    .filter((f) => !f.primary)
    .map((f): [string, FieldSetter] => [
      f.name,
      { kind: "fieldset-input", type: f.type, fieldsetAccess: [f.name], required: false },
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
