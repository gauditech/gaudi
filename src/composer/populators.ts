import _ from "lodash";

import { getModelProp, getRef } from "@src/common/refs";
import { assertUnreachable, ensureExists, ensureNot } from "@src/common/utils";
import { getTypedLiteralValue } from "@src/composer/utils";
import {
  Definition,
  FieldSetterReferenceValue,
  ModelDef,
  PopulateChangeset,
  PopulateDef,
  PopulateRepeatDef,
  PopulateTargetDef,
  PopulatorDef,
} from "@src/types/definition";
import { PopulateRepeatSpec, PopulateSpec, PopulatorSpec } from "@src/types/specification";

export function composePopulators(def: Definition, populators: PopulatorSpec[]): void {
  def.populators = populators.map((p) => processPopulator(def.models, p));
}

function processPopulator(models: ModelDef[], populator: PopulatorSpec): PopulatorDef {
  return {
    name: populator.name,
    populates: populator.populates.map((p) => processPopulate(models, [], p)),
  };
}

function processPopulate(
  models: ModelDef[],
  parents: PopulateTargetDef[],
  populateSpec: PopulateSpec
): PopulateDef {
  const name = populateSpec.name;
  const target = calculateTarget(
    models,
    parents,
    populateSpec.target.identifier,
    populateSpec.target.alias ?? null
  );

  const targets: PopulateTargetDef[] = [...parents, target];

  const repeat = calculateRepeat(populateSpec.repeat);
  const changeset = composePopulateChangeset(models, populateSpec, targets);

  const populates = populateSpec.populates.map((p) => processPopulate(models, targets, p));

  return {
    name,
    target,
    repeat,
    changeset,
    populates,
  };
}

function calculateTarget(
  models: ModelDef[],
  parents: PopulateTargetDef[],
  name: string,
  alias: string | null
): PopulateTargetDef {
  const parentTarget = _.last(parents);
  const namePath = [...parents.map((p) => p.name), name];

  if (parentTarget) {
    const { value: ctxModel } = getRef<"model">(models, parentTarget.retType);

    const prop = getModelProp(ctxModel, name);
    switch (prop.kind) {
      case "reference": {
        const reference = prop.value;

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
        const relation = prop.value;

        return {
          kind: "relation",
          name,
          namePath,
          refKey: relation.refKey,
          retType: relation.fromModelRefKey,
          alias: alias || `$target_${parents.length}`,
        };
      }
      case "field":
      case "model":
      case "hook":
      case "query": {
        throw `Unsupported populate target "${prop.kind}"`;
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
  models: ModelDef[],
  populateSpec: PopulateSpec,
  parentTargets: PopulateTargetDef[]
): PopulateChangeset {
  const target = _.last(parentTargets)!;

  // ensure we're starting with model
  // ensure we have non-nullable references after starting model

  // setter for parent relation
  let parentContextChangeset: PopulateChangeset | undefined = undefined;
  if (target.kind === "relation") {
    parentContextChangeset = getParentContextSetter(models, parentTargets);
  }

  // Parsing an action specification
  const modelChangeset = composeSetters(models, populateSpec, target);

  // assign inputs
  return _.assign({}, parentContextChangeset, modelChangeset);
}

function getParentContextSetter(
  models: ModelDef[],
  parentTargets: PopulateTargetDef[]
): PopulateChangeset {
  const [parentTarget, currentTarget] = _.takeRight(parentTargets, 2);
  ensureExists(parentTarget);
  ensureExists(currentTarget);

  if (currentTarget.kind === "model") {
    // model can only be root and cannot have parent - return empty changeset
    return {};
  }

  const { value: relation } = getRef<"relation">(models, currentTarget.refKey);

  return composeReferenceValue(models, parentTarget.alias, relation.throughRefKey);
}

function composeSetters(
  models: ModelDef[],
  populateSpec: PopulateSpec,
  target: PopulateTargetDef
): PopulateChangeset {
  return (
    _.chain(populateSpec.setters)
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
          const referenceTargetAlias = setter.set.reference;
          const referenceRefKey = `${target.retType}.${setter.target}`;

          return composeReferenceValue(models, referenceTargetAlias, referenceRefKey);
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
  models: ModelDef[],
  referenceAlias: string,
  referenceRefKey: string
): { [name: string]: FieldSetterReferenceValue } {
  const { value: reference } = getRef<"reference">(models, referenceRefKey);
  const { value: referenceField } = getRef<"field">(models, reference.fieldRefKey);
  const { value: relationField } = getRef<"field">(models, reference.toModelFieldRefKey);

  return {
    [referenceField.name]: {
      kind: "reference-value",
      type: referenceField.type,
      target: { alias: referenceAlias, access: [relationField.name] },
    },
  };
}
