import _ from "lodash";

import { selectableId } from "../query/build";

import { getRef2 } from "@src/common/refs";
import { composeActionBlock } from "@src/composer/actions";
import { fieldsetFromActions } from "@src/composer/entrypoints";
import {
  CreateEndpointDef,
  Definition,
  DeleteEndpointDef,
  EndpointDef,
  EntrypointDef,
  FieldDef,
  GetEndpointDef,
  ListEndpointDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetWithSelectDef,
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
  const target: TargetWithSelectDef = {
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
    select: [fieldToSelect(model, getRef2.field(def, model.name, "id"))],
  };
  return {
    name,
    entrypoints: [],
    endpoints: endpointsForModel(def, model, target),
    target,
  };
}

function endpointsForModel(
  def: Definition,
  model: ModelDef,
  target: TargetWithSelectDef
): EndpointDef[] {
  return [
    getEndpointForModel(model, target),
    listEnpointForModel(model, target),
    createEndpointForModel(def, model, target),
    updateEndpointForModel(def, model, target),
    deleteEndpointForModel(model, target),
  ];
}

function getEndpointForModel(model: ModelDef, target: TargetWithSelectDef): GetEndpointDef {
  return {
    kind: "get",
    parentContext: [],
    target,
    response: modelToSelect(model),
  };
}

function listEnpointForModel(model: ModelDef, target: TargetWithSelectDef): ListEndpointDef {
  return {
    kind: "list",
    parentContext: [],
    target: _.omit(target, "identifyWith"),
    response: modelToSelect(model),
  };
}

function createEndpointForModel(
  def: Definition,
  model: ModelDef,
  target: TargetWithSelectDef
): CreateEndpointDef {
  const actions = composeActionBlock(def, [], [target], "create");

  return {
    kind: "create",
    parentContext: [],
    target: _.omit(target, "identifyWith"),
    actions,
    fieldset: fieldsetFromActions(def, actions),
    response: modelToSelect(model),
  };
}

function updateEndpointForModel(
  def: Definition,
  model: ModelDef,
  target: TargetWithSelectDef
): UpdateEndpointDef {
  const actions = composeActionBlock(def, [], [target], "update");

  return {
    kind: "update",
    parentContext: [],
    target: { ...target, select: [selectableId(def, [model.name])] },
    actions,
    fieldset: fieldsetFromActions(def, actions),
    response: modelToSelect(model),
  };
}

function deleteEndpointForModel(model: ModelDef, target: TargetWithSelectDef): DeleteEndpointDef {
  return {
    kind: "delete",
    parentContext: [],
    target,
    actions: [],
    response: undefined,
  };
}

function modelToSelect(model: ModelDef): SelectDef {
  return model.fields.map((field) => fieldToSelect(model, field));
}

function fieldToSelect(model: ModelDef, field: FieldDef): SelectItem {
  return {
    refKey: field.refKey,
    kind: "field",
    alias: field.name,
    name: field.name,
    namePath: [model.name, field.name],
  };
}
