import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureNot } from "@src/common/utils";
import { composeActionBlock } from "@src/composer/actions";
import {
  ParentContext,
  calculateTarget,
  collectActionDeps,
  wrapActionsWithSelect,
} from "@src/composer/entrypoints";
import {
  ActionDef,
  Definition,
  PopulateDef,
  PopulatorDef,
  RepeaterDef,
} from "@src/types/definition";
import { ActionSpec, PopulateSpec, PopulatorSpec, RepeaterSpec } from "@src/types/specification";

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
  parents: ParentContext[],
  populateSpec: PopulateSpec
): PopulateDef {
  const name = populateSpec.name;
  const target = calculateTarget(
    def,
    parents,
    populateSpec.target.identifier,
    populateSpec.target.alias ?? null,
    populateSpec.identify || "id"
  );
  const targetModel = getRef.model(def, target.retType);

  const currentContext = { target, model: targetModel };
  const targetParents: ParentContext[] = [...parents, currentContext];

  const rawActions = composeAction(def, populateSpec, targetParents);
  const populates = populateSpec.populates.map((p) => processPopulate(def, targetParents, p));
  const subactions = populates.flatMap((p) => p.actions);

  // collect deps from this AND subpopupulates' actions
  const selectDeps = collectActionDeps(def, [...rawActions, ...subactions]);
  const actions = wrapActionsWithSelect(def, rawActions, selectDeps);

  const repeater = composeRepeater(populateSpec.repeater);

  return {
    name,
    target,
    actions,
    populates,
    repeater,
  };
}

function composeAction(
  def: Definition,
  populate: PopulateSpec,
  parents: ParentContext[]
): ActionDef[] {
  const targets = parents.map((p) => p.target);

  const targetPath = undefined;
  const alias = undefined;
  const actionAtoms = populate.setters.map((s) => s);

  const actionSpec: ActionSpec = {
    kind: "create",
    // TODO: add default targetPath, alias
    targetPath,
    alias,
    actionAtoms,
  };

  return composeActionBlock(def, [actionSpec], targets, "create");
}

function composeRepeater(repeat?: RepeaterSpec): RepeaterDef {
  // if empty, default to 1s
  if (repeat == null) {
    return { min: 1, max: 1 };
  }

  const repeatKind = repeat.kind;
  if (repeatKind === "fixed") {
    const count = repeat.value;

    // make sure counter is greater than zero
    ensureNot(count <= 0, true);

    return { alias: repeat.alias, min: count, max: count };
  } else if (repeatKind === "range") {
    const range = repeat.range;
    const max = range.max || 1;
    const min = range.min || max;

    // make sure min is greater than zero
    ensureNot(min <= 0, true);
    // make sure min not greater than max
    ensureNot(min > max, true);

    return { alias: repeat.alias, min, max };
  } else {
    assertUnreachable(repeatKind);
  }
}
