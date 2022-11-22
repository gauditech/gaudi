import { composeActionBlock } from "@src/composer/actions";
import { fieldsetFromActions } from "@src/composer/entrypoints";
import {
  CreateEndpointDef,
  Definition,
  DeleteEndpointDef,
  EndpointDef,
  EntrypointDef,
  GetEndpointDef,
  ListEndpointDef,
  ModelDef,
  SelectDef,
  TargetDef,
  UpdateEndpointDef,
} from "@src/types/definition";

/**
 * Build and return list of admin entrpoints.
 *
 * Admin entrypoints do no exist in blueprints but are
 * built from model on the fly.
 */
export function buildEntrypoints(def: Definition): EntrypointDef[] {
  return def.models.map((m) => entrypointForModel(def, m));
}

function entrypointForModel(def: Definition, model: ModelDef): EntrypointDef {
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
    endpoints: endpointsForModel(def, model, target),
    target,
  };
}

function endpointsForModel(def: Definition, model: ModelDef, target: TargetDef): EndpointDef[] {
  return [
    getEndpointForModel(model, target),
    listEnpointForModel(model, target),
    createEndpointForModel(def, model, target),
    updateEndpointForModel(def, model, target),
    deleteEndpointForModel(model, target),
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

function createEndpointForModel(
  def: Definition,
  model: ModelDef,
  target: TargetDef
): CreateEndpointDef {
  const actions = composeActionBlock(def, [], [target], "create");

  return {
    kind: "create",
    targets: [target],
    actions,
    fieldset: fieldsetFromActions(def, actions),
    response: modelToSelect(model),
  };
}

function updateEndpointForModel(
  def: Definition,
  model: ModelDef,
  target: TargetDef
): UpdateEndpointDef {
  const actions = composeActionBlock(def, [], [target], "update");

  return {
    kind: "update",
    targets: [target],
    actions,
    fieldset: fieldsetFromActions(def, actions),
    response: modelToSelect(model),
  };
}

function deleteEndpointForModel(model: ModelDef, target: TargetDef): DeleteEndpointDef {
  return {
    kind: "delete",
    targets: [target],
    actions: [],
    response: undefined,
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
