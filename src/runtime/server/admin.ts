import {
  calculateCreateChangesetForModel,
  calculateCreateFieldsetForModel,
} from "@src/composer/entrypoints";
import {
  CreateEndpointDef,
  Definition,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  ModelDef,
  SelectDef,
  TargetDef,
} from "@src/types/definition";

export function buildAdminEntrypoints(def: Definition): EntrypointDef[] {
  return def.models.map(entrypointForModel);
}

function entrypointForModel(model: ModelDef): EntrypointDef {
  const name = `admin:${model.name}Entrypoint`;
  const target: TargetDef = {
    refKey: "N/A",
    kind: "model",
    name: model.name,
    alias: "model",
    retType: model.name,
    namePath: [model.name],
    identifyWith: {
      refKey: `${model.name}.id`,
      name: "id",
      paramName: "id",
      type: "integer",
    },
  };
  return {
    name,
    entrypoints: [],
    endpoints: endpointsForModel(model, target),
    target,
  };
}

function endpointsForModel(model: ModelDef, target: TargetDef): EndpointDef[] {
  return [
    getEndpointForModel(model, target),
    listEnpointForModel(model, target),
    createEndpointForModel(model, target),
  ];
}

function getEndpointForModel(model: ModelDef, target: TargetDef): GetEndpointDef {
  return {
    kind: "get",
    targets: [target],
    actions: [],
    response: modelToSelect(model),
  };
}

function listEnpointForModel(model: ModelDef, target: TargetDef): ListEndpointDef {
  return {
    kind: "list",
    targets: [target],
    actions: [],
    response: modelToSelect(model),
  };
}

function createEndpointForModel(model: ModelDef, target: TargetDef): CreateEndpointDef {
  return {
    kind: "create",
    targets: [target],
    actions: [],
    response: modelToSelect(model),
    fieldset: calculateCreateFieldsetForModel(model),
    contextActionChangeset: calculateCreateChangesetForModel(model),
  };
}

function modelToSelect(model: ModelDef): SelectDef {
  return model.fields.map((f) => ({
    refKey: f.refKey,
    kind: "field",
    alias: f.name,
    name: f.name,
    namePath: [model.name, f.name],
  }));
}
