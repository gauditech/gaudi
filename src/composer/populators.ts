import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureExists, ensureNot } from "@src/common/utils";
import { VarContext, getTypedLiteralValue, getTypedPathWithLeaf } from "@src/composer/utils";
import {
  Definition,
  FieldDef,
  FieldSetterReferenceValue,
  ModelDef,
  PopulateChangeset,
  PopulateDef,
  PopulateRepeatDef,
  PopulateTargetDef,
  PopulatorDef,
} from "@src/types/definition";
import {
  PopulateRepeatSpec,
  PopulateSetterSpec,
  PopulateSpec,
  PopulatorSpec,
} from "@src/types/specification";

export function composePopulators(def: Definition, populators: PopulatorSpec[]): void {
  def.populators = populators.map((p) => processPopulator(def, p));
}

function processPopulator(def: Definition, populator: PopulatorSpec): PopulatorDef {
  return {
    name: populator.name,
    populates: populator.populates.map((p) => processPopulate(def, [], p)),
  };
}

function processPopulate(
  def: Definition,
  parents: PopulateTargetDef[],
  populateSpec: PopulateSpec
): PopulateDef {
  const name = populateSpec.name;
  const target = calculateTarget(
    def,
    parents,
    populateSpec.target.identifier,
    populateSpec.target.alias ?? null
  );
  const targetModel = getRef.model(def, target.retType);

  const targets: PopulateTargetDef[] = [...parents, target];
  const ctx = getInitialContext(targets);

  const repeat = calculateRepeat(populateSpec.repeat);
  const changeset = composePopulateChangeset(def, populateSpec, targets, targetModel, ctx);

  const populates = populateSpec.populates.map((p) => processPopulate(def, targets, p));

  return {
    name,
    target,
    repeat,
    changeset,
    populates,
  };
}

function calculateTarget(
  def: Definition,
  parents: PopulateTargetDef[],
  name: string,
  alias: string | null
): PopulateTargetDef {
  const parentTarget = _.last(parents);
  const namePath = [...parents.map((p) => p.name), name];

  if (parentTarget) {
    const prop = getRef.except(def, parentTarget.retType, name, "model");
    switch (prop.kind) {
      case "reference": {
        const reference = prop;

        return {
          kind: "reference",
          name,
          namePath,
          refKey: reference.refKey,
          retType: reference.toModelRefKey,
          alias: alias || `$target_${parents.length}`,
        };
      }
      case "relation": {
        const relation = prop;

        return {
          kind: "relation",
          name,
          namePath,
          refKey: relation.refKey,
          retType: relation.fromModelRefKey,
          alias: alias || `$target_${parents.length}`,
        };
      }
      default: {
        throw `Unsupported populate target "${prop.kind}"`;
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
      alias: alias || `$target_${parents.length}`,
    };
  }
}

function calculateRepeat(repeat?: PopulateRepeatSpec): PopulateRepeatDef {
  // if empty, default to 1s
  if (repeat == null) {
    return { min: 1, max: 1 };
  }

  const repeatKind = repeat.kind;
  if (repeatKind === "fixed") {
    const count = repeat.value;

    // make sure counter is greater than zero
    ensureNot(count <= 0, true);

    return { min: count, max: count };
  } else if (repeatKind === "range") {
    const range = repeat.range;
    const max = range.max || 1;
    const min = range.min || max;

    // make sure min is greater than zero
    ensureNot(min <= 0, true);
    // make sure min not greater than max
    ensureNot(min > max, true);

    return { min, max };
  } else {
    assertUnreachable(repeatKind);
  }
}

function composePopulateChangeset(
  def: Definition,
  populateSpec: PopulateSpec,
  targets: PopulateTargetDef[],
  targetModel: ModelDef,
  ctx: VarContext
): PopulateChangeset {
  const target = _.last(targets)!;

  // ensure we're starting with model
  // ensure we have non-nullable references after starting model

  // setter for parent relation
  let parentContextChangeset: PopulateChangeset | undefined = undefined;
  if (target.kind === "relation") {
    parentContextChangeset = getParentContextSetter(def, targets, targetModel, ctx);
  }

  // Parsing an action specification
  const modelChangeset = composeSetters(def, populateSpec.setters, target, targetModel, ctx);

  // assign inputs
  return _.assign({}, parentContextChangeset, modelChangeset);
}

function getParentContextSetter(
  def: Definition,
  targets: PopulateTargetDef[],
  targetModel: ModelDef,
  ctx: VarContext
): PopulateChangeset {
  const [parentTarget, currentTarget] = _.takeRight(targets, 2);
  ensureExists(parentTarget);
  ensureExists(currentTarget);

  if (currentTarget.kind === "model") {
    // model can only be root and cannot have parent - return empty changeset
    return {};
  }

  const relation = getRef.relation(def, currentTarget.refKey);

  return composeReferenceValue(def, parentTarget.alias, targetModel, [relation.through], ctx);
}

function composeSetters(
  def: Definition,
  setters: PopulateSetterSpec[],
  target: PopulateTargetDef,
  targetModel: ModelDef,
  ctx: VarContext
): PopulateChangeset {
  return (
    _.chain(setters)
      .map((setter): PopulateChangeset => {
        const setterKind = setter.set.kind;
        if (setterKind === "literal") {
          return {
            [setter.target]: {
              ...getTypedLiteralValue(setter.set.value),
              kind: "literal",
            },
          };
        } else if (setterKind === "reference") {
          return composeReferenceValue(def, setter.target, targetModel, setter.set.reference, ctx);
        } else if (setterKind === "hook") {
          const args = _.chain(setter.set.hook.args)
            .mapValues(
              (arg) =>
                composeSetters(
                  def,
                  [{ kind: "set", target: setter.target, set: arg }],
                  target,
                  targetModel,
                  ctx
                )[1]
            )
            .value();
          return { [setter.target]: { kind: "fieldset-hook", code: setter.set.hook.code, args } };
        } else {
          assertUnreachable(setterKind);
        }
      })
      // map from list of objects to list of lists of pairs
      .map((changeset) => _.toPairs(changeset))
      // to flat list of pairs
      .flatMap()
      // from list of pairs to object
      .fromPairs()
      .value()
  );
}

function composeReferenceValue(
  def: Definition,
  target: string,
  targetModel: ModelDef,
  referencePath: string[],
  ctx: VarContext
): { [name: string]: FieldSetterReferenceValue } {
  console.log("typed path", referencePath);

  const typedPath = getTypedPathWithLeaf(def, referencePath, ctx);
  const ref = getRef(def, targetModel.name, target);
  // support both field and reference setters, eg. `set item myitem` and `set item_id myitem.id`
  let targetField: FieldDef;
  switch (ref.kind) {
    case "field": {
      targetField = ref;
      break;
    }
    case "reference": {
      targetField = getRef.field(def, ref.fieldRefKey);
      break;
    }
    default: {
      throw new Error(`Cannot set a value from a ${ref.kind}`);
    }
  }

  const namePath = typedPath.nodes.map((p) => p.name);
  const access = [...namePath, typedPath.leaf.name];
  const field = getRef.field(def, typedPath.leaf.refKey);

  return {
    [targetField.name]: {
      kind: "reference-value",
      type: field.type,
      target: { alias: referencePath[0], access },
    },
  };
}

function getInitialContext(targets: PopulateTargetDef[]): VarContext {
  return _.fromPairs(
    _.initial(targets).map((t): [string, VarContext[string]] => [t.alias, { modelName: t.retType }])
  );
}
