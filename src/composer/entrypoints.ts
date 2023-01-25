import _ from "lodash";

import { composeActionBlock } from "./actions";

import { getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import { uniqueNamePaths } from "@src/runtime/query/build";
import { SelectAST } from "@src/types/ast";
import {
  ActionDef,
  Definition,
  DeleteOneAction,
  EndpointDef,
  EntrypointDef,
  FieldSetterReferenceValue,
  FieldsetDef,
  FieldsetFieldDef,
  ModelDef,
  SelectDef,
  SelectItem,
  TargetDef,
  TargetWithSelectDef,
} from "@src/types/definition";
import { EntrypointSpec } from "@src/types/specification";

export function composeEntrypoints(def: Definition, input: EntrypointSpec[]): void {
  def.entrypoints = input.map((spec) => processEntrypoint(def, spec, []));
}

export type TargetContext = {
  model: ModelDef;
  target: TargetDef;
};

function processEntrypoint(
  def: Definition,
  spec: EntrypointSpec,
  parents: TargetContext[]
): EntrypointDef {
  const target = calculateTarget(
    def,
    parents,
    spec.target.identifier,
    spec.target.alias ?? null,
    spec.identify || "id"
  );
  const name = spec.name;
  const targetModel = getRef.model(def, target.retType);

  const thisContext: TargetContext = { model: targetModel, target };
  const targetParents = [...parents, thisContext];

  return {
    name,
    target,
    endpoints: processEndpoints(def, targetParents, spec),
    entrypoints: spec.entrypoints.map((ispec) => processEntrypoint(def, ispec, targetParents)),
  };
}

export function calculateTarget(
  def: Definition,
  parents: TargetContext[],
  name: string,
  alias: string | null,
  identify: string
): TargetDef {
  const ctxModel = _.last(parents)?.model ?? null;
  const namePath = [...parents.map((p) => p.target.name), name];
  if (ctxModel) {
    const prop = getRef(def, ctxModel.name, name);
    switch (prop.kind) {
      case "reference": {
        const reference = prop;
        const model = getRef.model(def, reference.toModelRefKey);
        return {
          kind: "reference",
          name,
          namePath,
          retType: reference.toModelRefKey,
          refKey: reference.refKey,
          identifyWith: calculateIdentifyWith(def, model, identify),
          alias: alias || `$target_${parents.length}`,
        };
      }
      case "relation": {
        const relation = prop;
        const model = getRef.model(def, relation.fromModelRefKey);
        return {
          kind: "relation",
          name,
          namePath,
          retType: relation.fromModel,
          refKey: relation.refKey,
          identifyWith: calculateIdentifyWith(def, model, identify),
          alias: alias || `$target_${parents.length}`,
        };
      }
      case "query": {
        const query = prop;
        const model = getRef.model(def, query.retType);
        return {
          kind: "query",
          name,
          namePath,
          retType: query.retType,
          refKey: query.refKey,
          identifyWith: calculateIdentifyWith(def, model, identify),
          alias: alias || `$target_${parents.length}`,
        };
      }
      default: {
        throw `${prop.kind} is not a valid entrypoint target`;
      }
    }
  } else {
    const model = getRef.model(def, name);
    return {
      kind: "model",
      name,
      namePath,
      refKey: model.refKey,
      retType: model.name,
      identifyWith: calculateIdentifyWith(def, model, identify),
      alias: alias || `$target_${parents.length}`,
    };
  }
}

function calculateIdentifyWith(
  def: Definition,
  model: ModelDef,
  identify: string | undefined
): EntrypointDef["target"]["identifyWith"] {
  const name = identify ?? "id";
  const prop = getRef(def, model.name, name);
  switch (prop.kind) {
    case "field": {
      const field = prop;
      if (field.type === "boolean") {
        throw new Error("Invalid type of identifiyWith - boolean");
      }
      return {
        name,
        type: field.type,
        refKey: field.refKey,
        paramName: `${model.name.toLowerCase()}_${name}`,
      };
    }
    default:
      throw new Error(`Identify with target must be a field`);
  }
}

function processEndpoints(
  def: Definition,
  parents: TargetContext[],
  entrySpec: EntrypointSpec
): EndpointDef[] {
  const context = _.last(parents)!;
  const targets = parents.map((p) => p.target);

  return entrySpec.endpoints.map((endSpec): EndpointDef => {
    const rawActions = composeActionBlock(def, endSpec.action ?? [], targets, endSpec.type);
    const selectDeps = collectActionDeps(def, rawActions);
    const actions = wrapActionsWithSelect(def, rawActions, selectDeps);
    const targetsWithSelect = wrapTargetsWithSelect(def, targets, selectDeps);
    const parentContext = _.initial(targetsWithSelect);
    const target = _.last(targetsWithSelect)!;

    switch (endSpec.type) {
      case "get": {
        return {
          kind: "get",
          response: processSelect(def, context.model, entrySpec.response, context.target.namePath),
          // actions,
          parentContext,
          target,
        };
      }
      case "list": {
        return {
          kind: "list",
          response: processSelect(def, context.model, entrySpec.response, context.target.namePath),
          // actions,
          parentContext,
          target: _.omit(target, "identifyWith"),
        };
      }
      case "create": {
        const fieldset = fieldsetFromActions(def, actions);
        return {
          kind: "create",
          fieldset,
          actions,
          parentContext,
          target: _.omit(target, "identifyWith"),
          response: processSelect(def, context.model, entrySpec.response, context.target.namePath),
        };
      }
      case "update": {
        const fieldset = fieldsetFromActions(def, actions);
        return {
          kind: "update",
          fieldset,
          actions,
          parentContext,
          target: _.first(wrapTargetsWithSelect(def, [target], selectDeps))!,
          response: processSelect(def, context.model, entrySpec.response, context.target.namePath),
        };
      }
      case "delete": {
        return {
          kind: "delete",
          actions,
          parentContext,
          target,
          response: undefined,
        };
      }
    }
  });
}

export function processSelect(
  def: Definition,
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
      const ref = getRef.except(def, model.name, name, ["model"]);
      if (ref.kind === "field") {
        ensureEqual(s[name].select, undefined);
        return {
          kind: ref.kind,
          name,
          alias: name,
          namePath: [...namePath, name],
          refKey: ref.refKey,
        };
      } else if (ref.kind === "model-hook") {
        return {
          kind: ref.kind,
          // refKey: ref.refKey,
          name,
          alias: name,
          namePath: [...namePath, name],
          args: ref.args,
          code: ref.code,
        };
      } else if (ref.kind === "computed") {
        return {
          kind: ref.kind,
          refKey: ref.refKey,
          name,
          alias: name,
          namePath: [...namePath, name],
        };
      } else if (ref.kind === "aggregate") {
        return {
          kind: ref.kind,
          refKey: ref.refKey,
          name,
          alias: name,
          namePath: [...namePath, name],
        };
      } else {
        const targetModel = getTargetModel(def, ref.refKey);
        return {
          kind: ref.kind,
          name,
          namePath: [...namePath, name],
          alias: name,
          select: processSelect(def, targetModel, s[name], [...namePath, name]),
        };
      }
    });
  }
}

export function fieldsetFromActions(def: Definition, actions: ActionDef[]): FieldsetDef {
  const fieldsetWithPaths = actions
    .filter((a): a is Exclude<ActionDef, DeleteOneAction> => a.kind !== "delete-one")
    .flatMap((action) => {
      return _.chain(action.changeset)
        .map(({ name, setter }): null | [string[], FieldsetFieldDef] => {
          switch (setter.kind) {
            case "fieldset-input": {
              const field = getRef.field(def, `${action.model}.${name}`);
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
              const field = getRef.field(def, setter.throughRefKey);
              return [
                setter.fieldsetAccess,
                {
                  kind: "field",
                  required: true, // FIXME
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

/**
 * Converts a list of single `FieldsetFieldDef`s with their desired paths
 * into a `FieldsetDef` that nests `FieldsetRecordDef`s in order to respect
 * desired access path for each `FieldsetFieldDef`.ß
 */
function collectFieldsetPaths(paths: [string[], FieldsetFieldDef][]): FieldsetDef {
  const uniqueFieldsetPaths = _.uniqWith(paths, _.isEqual);

  const record = _.chain(uniqueFieldsetPaths)
    .map((p) => p[0][0])
    .uniq()
    .map((name) => {
      const relatedPaths = uniqueFieldsetPaths
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

type SelectDep = FieldSetterReferenceValue["target"];
/**
 * Iterates over actions in order to collect, for each of the actions and a default target
 * context variables, which fields are required in the following actions, so that they can
 * be fetched from the database beforehand.
 * Eg. if a `Repo` aliased as `myrepo` requires `myorg.id`, we need to instruct `myorg`
 * context variable to fetch the `id` so it can be referenced later by `myrepo`.
 */
export function collectActionDeps(def: Definition, actions: ActionDef[]): SelectDep[] {
  // collect all update paths
  const nonDeleteActions = actions.filter(
    (a): a is Exclude<ActionDef, DeleteOneAction> => a.kind !== "delete-one"
  );
  const targetPaths = _.chain(nonDeleteActions)
    .flatMap((a) => {
      switch (a.kind) {
        case "create-one": {
          // there's already a parent setter resolving this path, so we can skip it
          return null;
        }
        case "update-one": {
          try {
            // make sure we're not updating a model directly
            getRef.model(def, _.first(a.targetPath)!);
            return null;
          } catch (e) {
            // last item is what's being updated, we need to collect the id
            const [alias, ...access] = [...a.targetPath, "id"];
            return { alias, access };
          }
        }
      }
    })
    .compact()
    .value();
  // collect all targets
  const setterTargets = nonDeleteActions.flatMap((a) => {
    return a.changeset.flatMap(({ setter: operation }) => {
      switch (operation.kind) {
        case "reference-value": {
          return [operation.target];
        }
        case "fieldset-hook": {
          return operation.args.flatMap(({ setter: operation }) =>
            operation.kind === "reference-value" ? [operation.target] : []
          );
        }
        default: {
          return [];
        }
      }
    });
  });
  return [...setterTargets, ...targetPaths];
}

/**
 * Converts `TargetDef`s into `TargetWithSelectDef`s using select deps to resolve each target's `SelectDef`.
 */
function wrapTargetsWithSelect(
  def: Definition,
  targets: TargetDef[],
  deps: SelectDep[]
): TargetWithSelectDef[] {
  return targets.map((target) => {
    const paths = uniqueNamePaths(
      deps.filter((dep) => dep.alias === target.alias).map((dep) => dep.access)
    );
    const model = getRef.model(def, target.retType);
    const select = pathsToSelectDef(def, model, paths, target.namePath);
    return { ...target, select };
  });
}

/**
 * Inserts `ActionDef`s `select` property using select deps to resolve each target's `SelectDef`.
 * FIXME this is confusing because we don't have a special type for ActionDef with(out) select.
 * Prior to calling this function, every `ActionDef` has an empty (`[]`) select property.
 */
export function wrapActionsWithSelect(
  def: Definition,
  actions: ActionDef[],
  deps: SelectDep[]
): ActionDef[] {
  return actions
    .filter((a): a is Exclude<ActionDef, DeleteOneAction> => a.kind !== "delete-one")
    .map((a): ActionDef => {
      const paths = uniqueNamePaths(deps.filter((d) => d.alias === a.alias).map((a) => a.access));
      const model = getRef.model(def, a.model);

      const select = pathsToSelectDef(def, model, paths, [a.alias]);
      return { ...a, select };
    });
}

function pathsToSelectDef(
  def: Definition,
  model: ModelDef,
  paths: string[][],
  namespace: string[]
): SelectDef {
  const direct = _.chain(paths)
    .map((p) => p[0])
    .uniq()
    .value();
  return direct.map((name): SelectItem => {
    // what is name?
    const ref = getRef(def, model.name, name, ["query", "reference", "relation", "field"]);
    const relatedPaths = paths
      .filter((p) => p[0] === name)
      .map(_.tail)
      .filter((p) => p.length > 0);
    switch (ref.kind) {
      case "field": {
        // ensure leaf
        if (relatedPaths.length) {
          throw new Error(`Field path is not root!`);
        }
        return {
          kind: "field",
          alias: name,
          name,
          refKey: ref.refKey,
          namePath: [...namespace, name],
        };
      }
      default: {
        const newModel = getTargetModel(def, ref.refKey);
        return {
          kind: ref.kind,
          alias: name,
          name,
          namePath: [...namespace, name],
          select: pathsToSelectDef(def, newModel, relatedPaths, [...namespace, name]),
        };
      }
    }
  });
}
