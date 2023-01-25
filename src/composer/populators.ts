import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureNot } from "@src/common/utils";
import { composeActionBlock } from "@src/composer/actions";
import {
  TargetContext,
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
  parents: TargetContext[],
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

  const currentContext = {
    target,
    model: targetModel,
    authorize: { expr: undefined, deps: [] },
  };
  const targetParents: TargetContext[] = [...parents, currentContext];

  const rawActions = composeAction(def, populateSpec, targetParents);
  checkActionChangeset(rawActions);
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
  parents: TargetContext[]
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

/**
 * Check that action changeset contains setters for all fields.
 *
 * Populator cannot handle fieldset input setters and all fields must be set using manually (literal, reference, hook, ...)
 * NOTE: this can create problems on models that have diamond shaped relations eg.
 *      Org
 *     /  |
 * Repo   |
 *    |   /
 *   Issue
 *
 * "issue" create action's changeset will contain reference setter for "repo_id" and input setter for "org_id"
 * which will fail in this check.
 */
function checkActionChangeset(action: ActionDef | ActionDef[]) {
  const inputSetters: string[] = [];
  _.castArray(action).forEach((action) => {
    if (action.kind === "create-one" || action.kind === "update-one") {
      action.changeset.forEach((operation) => {
        // search for input setters
        if (
          operation.setter.kind === "fieldset-input" ||
          operation.setter.kind === "fieldset-reference-input"
        ) {
          inputSetters.push(operation.name);
        }
      });
    }

    // throw error if changeset contains input setters
    if (inputSetters.length > 0) {
      throw new Error(
        `Action ${action.kind} "${action.targetPath.join(
          "."
        )}" is missing setters for fields: ${inputSetters.join()}`
      );
    }
  });
}

function composeRepeater(repeat?: RepeaterSpec): RepeaterDef {
  // if empty, default to 1s
  if (repeat == null) {
    return { start: 1, end: 1 };
  }

  let repeater: RepeaterDef;

  const repeatKind = repeat.kind;
  if (repeatKind === "fixed") {
    const count = repeat.value;

    repeater = { alias: repeat.alias, start: 1, end: count };
  } else if (repeatKind === "range") {
    const range = repeat.range;
    const start = range.start ?? 1;
    const end = range.end ?? 1;

    repeater = { alias: repeat.alias, start, end };
  } else {
    assertUnreachable(repeatKind);
  }

  // make sure min is greater than zero
  ensureNot(repeater.start <= 0, true, `Repeater start (${repeater.start}) must be greater than 0`);
  // make sure min not greater than end
  ensureNot(
    repeater.start > repeater.end,
    true,
    `Repeater 'start' (${repeater.start}) must be greater or equal to 'end' (${repeater.end})`
  );

  return repeater;
}
