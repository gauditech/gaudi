import { Cache } from "./models";

import {
  Changeset,
  EndpointDef,
  EntrypointDef,
  FieldSetter,
  FieldsetDef,
  ModelDef,
  SelectDef,
} from "@src/types/definition";
import { EntrypointSpec } from "@src/types/specification";

export function composeEntrypoints(models: ModelDef[], input: EntrypointSpec[]): EntrypointDef[] {
  return input.map((spec) => processEntrypoint(models, spec, null));
}

function calculateTarget(
  models: ModelDef[],
  ctxModel: ModelDef | null,
  name: string,
  alias: string | null,
  identify: string
): EntrypointDef["target"] {
  if (ctxModel) {
    const prop = findModelProp(ctxModel, name);
    switch (prop.kind) {
      case "reference": {
        const model = findModel(models, prop.reference.toModelRefKey);
        return {
          kind: "reference",
          name,
          type: prop.reference.toModelRefKey,
          refKey: prop.reference.refKey,
          identifyWith: calculateIdentifyWith(model, identify),
          alias,
        };
      }
      case "relation": {
        const model = findModel(models, prop.relation.fromModelRefKey);
        return {
          kind: "relation",
          name,
          type: prop.relation.fromModel,
          refKey: prop.relation.refKey,
          identifyWith: calculateIdentifyWith(model, identify),
          alias,
        };
      }
      case "query": {
        const model = findModel(models, prop.query.retType);
        return {
          kind: "query",
          name,
          type: prop.query.retType,
          refKey: prop.query.refKey,
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
      refKey: model.refKey,
      type: model.name,
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
  const prop = findModelProp(model, name);
  switch (prop.kind) {
    case "field": {
      const field = prop.field;
      if (field.type === "boolean") {
        throw "invalid-type";
      }
      return { name, type: field.type, refKey: field.refKey };
    }
    default:
      throw "invalid-kind";
  }
}

function processEntrypoint(
  models: ModelDef[],
  spec: EntrypointSpec,
  ctxModel: ModelDef | null
): EntrypointDef {
  const target = calculateTarget(
    models,
    ctxModel,
    spec.target.identifier,
    spec.alias ?? null,
    spec.identify || "id"
  );
  const name = spec.name;
  const model = findModel(models, target.type);

  return {
    name,
    target,
    endpoints: processEndpoints(model, spec),
    entrypoints: spec.entrypoints.map((ispec) => processEntrypoint(models, ispec, model)),
  };
}

function processEndpoints(model: ModelDef, entrySpec: EntrypointSpec): EndpointDef[] {
  return entrySpec.endpoints.map((endSpec): EndpointDef => {
    switch (endSpec.type) {
      case "get": {
        return { kind: "get", response: responseToSelect(model, entrySpec.response), actions: [] };
      }
      case "list": {
        return { kind: "list", response: responseToSelect(model, entrySpec.response), actions: [] };
      }
      case "create": {
        const fieldset = calculateCreateFieldsetForModel(model);
        const changeset = calculateCreateChangesetForModel(model);
        return {
          kind: "create",
          fieldset,
          contextActionChangeset: changeset,
          actions: [],
          response: responseToSelect(model, entrySpec.response),
        };
      }
      default: {
        throw "TODO";
      }
    }
  });
}

function responseToSelect(model: ModelDef, select: string[] | undefined): SelectDef {
  if (select === undefined) {
    return {
      fieldRefs: model.fields.map((f) => f.refKey),
      queries: [],
      references: [],
      relations: [],
    };
  } else {
    return select.reduce(
      (def, name) => {
        const prop = findModelProp(model, name);
        switch (prop.kind) {
          case "field": {
            def.fieldRefs.push(prop.field.refKey);
            return def;
          }
          case "reference":
          case "relation":
          case "query":
            throw new Error("Not implemented");
        }
      },
      {
        fieldRefs: [],
        queries: [],
        references: [],
        relations: [],
      } as SelectDef
    );
  }
}

function calculateCreateFieldsetForModel(model: ModelDef): FieldsetDef {
  const fields = model.fields
    .filter((f) => !f.primary)
    .map((f): [string, FieldsetDef] => [
      f.name,
      { kind: "field", nullable: f.nullable, type: f.type },
    ]);
  return { kind: "record", nullable: false, record: Object.fromEntries(fields) };
}

function calculateCreateChangesetForModel(model: ModelDef): Changeset {
  const fields = model.fields
    .filter((f) => !f.primary)
    .map((f): [string, FieldSetter] => [
      f.name,
      { kind: "fieldset-input", type: f.type, fieldsetAccess: [f.name] },
    ]);
  return Object.fromEntries(fields);
}

export function findModel(models: ModelDef[], name: string): ModelDef {
  const model = models.find((m) => m.name === name);
  if (!model) {
    throw ["model-not-defined", name];
  }
  return model;
}

export function findModelProp(model: ModelDef, name: string): Exclude<Cache, { kind: "model" }> {
  const field = model.fields.find((f) => f.name === name);
  if (field) return { kind: "field", field };
  const reference = model.references.find((r) => r.name === name);
  if (reference) return { kind: "reference", reference };
  const relation = model.relations.find((r) => r.name === name);
  if (relation) return { kind: "relation", relation };
  const query = model.queries.find((q) => q.name === name);
  if (query) return { kind: "query", query };
  throw ["prop-not-defined", model.name, name];
}
