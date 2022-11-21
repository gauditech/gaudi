import _ from "lodash";

import { composeActionBlock, createInputsChangesetForModel } from "./actions";

import { getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureNot } from "@src/common/utils";
import { SelectAST } from "@src/types/ast";
import {
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldsetDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetDef,
} from "@src/types/definition";
import { EntrypointSpec } from "@src/types/specification";

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
  const { value: targetModel } = getRef<"model">(models, target.retType);

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
        const { value: model } = getRef<"model">(models, reference.toModelRefKey);
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
        const { value: model } = getRef<"model">(models, relation.fromModelRefKey);
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
        const { value: model } = getRef<"model">(models, query.retType);
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
    const { value: model } = getRef<"model">(models, name);
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
