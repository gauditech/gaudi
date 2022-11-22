import _ from "lodash";

import { composeActionBlock } from "./actions";

import { getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual, ensureNot } from "@src/common/utils";
import { SelectAST } from "@src/types/ast";
import {
  ActionDef,
  Definition,
  EndpointDef,
  EntrypointDef,
  FieldsetDef,
  FieldsetFieldDef,
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
    const actions = composeActionBlock(def, endSpec.action ?? [], targets, endSpec.type);

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
        const fieldset = fieldsetFromActions(def, actions);
        return {
          kind: "create",
          fieldset,
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
        const fieldset = fieldsetFromActions(def, actions);
        return {
          kind: "update",
          fieldset,
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

export function fieldsetFromActions(def: Definition, actions: ActionDef[]): FieldsetDef {
  const fieldsetWithPaths = actions.flatMap((action) => {
    return _.chain(action.changeset)
      .toPairs()
      .map(([name, setter]): null | [string[], FieldsetFieldDef] => {
        switch (setter.kind) {
          case "fieldset-input": {
            const { value: field } = getRef<"field">(def, `${action.model}.${name}`);
            return [
              setter.fieldsetAccess,
              {
                kind: "field",
                required: setter.required,
                type: setter.type,
                nullable: field.nullable,
                validators: field.validators,
              },
            ];
          }
          case "fieldset-reference-input": {
            const { value: field } = getRef<"field">(def, setter.throughField.refKey);
            return [
              setter.fieldsetAccess,
              {
                kind: "field",
                required: true, // fixme
                nullable: field.nullable,
                type: field.type,
                validators: field.validators,
              },
            ];
          }
          default:
            return null;
        }
      })
      .compact()
      .value();
  });

  return collectFieldsetPaths(fieldsetWithPaths);
}

function collectFieldsetPaths(paths: [string[], FieldsetFieldDef][]): FieldsetDef {
  const record = _.chain(paths)
    .map((p) => p[0][0])
    .uniq()
    .map((name) => {
      const relatedPaths = paths
        .filter((p) => p[0][0] === name)
        .map((p) => [_.tail(p[0]), p[1]] as [string[], FieldsetFieldDef]);
      if (relatedPaths.length === 1 && relatedPaths[0][0].length === 0) {
        // only a leaf node, return fieldset field
        return [name, relatedPaths[0][1]];
      } else if (relatedPaths.every((p) => p[0].length > 0)) {
        // OK, record without faulty leaf nodes
        return [name, collectFieldsetPaths(relatedPaths)];
      } else {
        // leaf node + non-empty node, this is not correct
        throw new Error(`Error in paths: ${paths.map((p) => p[0].join(".")).sort()}`);
      }
    })
    .fromPairs()
    .value();
  return { kind: "record", nullable: false, record };
}
