import { Cache } from "./models";

import { EndpointDef, EntrypointDef, ModelDef, SelectDef } from "@src/types/definition";
import { EntrypointSpec } from "@src/types/specification";

export function composeEntrypoints(models: ModelDef[], input: EntrypointSpec[]): EntrypointDef[] {
  return input.map((spec) => processEntrypoint(models, spec, null));
}

type Parent = { namespace: string; context: ModelDef };

function calculateTarget(
  models: ModelDef[],
  parent: Parent | null,
  name: string
): EntrypointDef["target"] {
  if (parent) {
    const prop = findModelProp(parent.context, name);
    switch (prop.kind) {
      case "reference": {
        return {
          kind: "reference",
          name,
          type: prop.reference.toModelRefKey,
          refKey: prop.reference.refKey,
        };
      }
      case "relation": {
        return {
          kind: "relation",
          name,
          type: prop.relation.fromModel,
          refKey: prop.relation.refKey,
        };
      }
      case "query": {
        return {
          kind: "query",
          name,
          type: prop.query.retType,
          refKey: prop.query.refKey,
        };
      }
      default: {
        throw `${prop.kind} is not a valid entrypoint target`;
      }
    }
  } else {
    const model = findModel(models, name);
    return { kind: "model", name, refKey: model.refKey, type: model.name };
  }
}

function calculateIdentifyWith(
  model: ModelDef,
  identify: string | undefined
): EntrypointDef["identifyWith"] {
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
  parent: Parent | null
): EntrypointDef {
  const target = calculateTarget(models, parent, spec.target.identifier);
  const name = parent ? [parent.namespace, spec.name].join(".") : spec.name;
  const model = findModel(models, target.type);

  return {
    name,
    target,
    identifyWith: calculateIdentifyWith(model, spec.identify),
    endpoints: processEndpoints(model, spec),
    entrypoints: spec.entrypoints.map((ispec) =>
      processEntrypoint(models, ispec, { namespace: name, context: model })
    ),
  };
}

function processEndpoints(model: ModelDef, entrySpec: EntrypointSpec): EndpointDef[] {
  return entrySpec.endpoints.map((endSpec): EndpointDef => {
    switch (endSpec.type) {
      case "get": {
        return { kind: "get", response: responseToSelect(model, entrySpec.response) };
      }
      case "list": {
        return { kind: "list", response: responseToSelect(model, entrySpec.response) };
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
