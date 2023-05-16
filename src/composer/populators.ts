import _ from "lodash";

import { assertUnreachable, ensureNot } from "@src/common/utils";
import { composeActionBlock } from "@src/composer/actions";
import {
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
  TargetDef,
} from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composePopulators(def: Definition, populators: Spec.Populator[]): void {
  def.populators = populators.map((p) => processPopulator(def, p));
}

function processPopulator(def: Definition, populator: Spec.Populator): PopulatorDef {
  return {
    name: populator.name,
    populates: populator.populates.map((p) => processPopulate(def, [], [], p)),
  };
}

function processPopulate(
  def: Definition,
  parents: TargetDef[],
  parentNamePath: string[],
  populateSpec: Spec.Populate
): PopulateDef {
  const namePath = [...parentNamePath, populateSpec.target.text];
  const target = calculateTarget(populateSpec, namePath);

  const targetParents = [...parents, target];

  const rawActions = composeAction(populateSpec);
  checkActionChangeset(rawActions);

  const populates = populateSpec.populates.map((p) =>
    processPopulate(def, targetParents, namePath, p)
  );
  const subactions = populates.flatMap((p) => p.actions);

  // collect deps from this AND subpopupulates' actions
  const selectDeps = collectActionDeps(def, [...rawActions, ...subactions]);
  const actions = wrapActionsWithSelect(def, rawActions, selectDeps);

  const repeater = composeRepeater(populateSpec.repeater);

  return {
    target,
    actions,
    populates,
    repeater,
  };
}

function composeAction(populate: Spec.Populate): ActionDef[] {
  const actionSpec: Spec.Action = {
    kind: "create",
    // TODO: add default targetPath, alias
    targetPath: [populate.target],
    alias: populate.alias.text,
    actionAtoms: populate.setters,
    isPrimary: false,
  };

  return composeActionBlock([actionSpec]);
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
      // concat action's target path IF it has one
      const actionTargetPath = "targetPath" in action ? action.targetPath.join(".") : "";

      throw new Error(
        `Action ${
          action.kind
        } "${actionTargetPath}" is missing setters for fields: ${inputSetters.join()}`
      );
    }
  });
}

function composeRepeater(repeat?: Spec.Repeater): RepeaterDef {
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
