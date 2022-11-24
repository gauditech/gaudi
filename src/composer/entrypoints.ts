import _ from "lodash";

import { getModelProp, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureNot } from "@src/common/utils";
import { SelectAST } from "@src/types/ast";
import {
  Changeset,
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldSetter,
  FieldsetDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetDef,
} from "@src/types/definition";
import { EntrypointSpec } from "@src/types/specification";

export function composeEntrypoints(def: Definition, input: EntrypointSpec[]): void {
  def.entrypoints = input.map((spec) => processEntrypoint(def.models, spec, []));
}

type EndpointContext = {
  model: ModelDef;
  target: TargetDef;
};

function processEntrypoint(
  models: ModelDef[],
  spec: EntrypointSpec,
  parents: EndpointContext[]
): EntrypointDef {
  const target = calculateTarget(
    models,
    parents,
    spec.target.identifier,
    spec.alias ?? null,
    spec.identify || "id"
  );
  const name = spec.name;
  const targetModel = findModel(models, target.retType);

  const thisContext: EndpointContext = { model: targetModel, target };
  const targetParents = [...parents, thisContext];

  return {
    name,
    target,
    endpoints: processEndpoints(models, targetParents, spec),
    entrypoints: spec.entrypoints.map((ispec) => processEntrypoint(models, ispec, targetParents)),
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
          alias,
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
          alias,
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
          alias,
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
      alias,
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
  models: ModelDef[],
  parents: EndpointContext[],
  entrySpec: EntrypointSpec
): EndpointDef[] {
  const context = _.last(parents)!;
  const targets = parents.map((p) => p.target);

  return entrySpec.endpoints.map((endSpec): EndpointDef => {
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
          actions: [],
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
          actions: [],
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
          actions: [],
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
          actions: [],
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
          actions: [],
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
      } else if (ref.kind === "hook") {
        return { kind: ref.kind, name, namePath: [...namePath, name], code: ref.value.code };
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
