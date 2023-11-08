import _ from "lodash";
import { match } from "ts-pattern";

import { FilteredByKind } from "@compiler/common/kindFilter";
import { getRef } from "@compiler/common/refs";
import { assertUnreachable, ensureNot } from "@compiler/common/utils";
import { composeActionBlock } from "@compiler/composer/actions";
import {
  calculateTarget,
  collectActionDeps,
  wrapActionsWithSelect,
} from "@compiler/composer/entrypoints";
import {
  Definition,
  FieldDef,
  ModelDef,
  PopulateDef,
  PopulatorDef,
  RepeaterDef,
  TargetDef,
} from "@compiler/types/definition";
import * as Spec from "@compiler/types/specification";

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
  const model = getRef.model(def, target.retType);

  const targetParents = [...parents, target];

  const actionSpec = buildActionSpec(populateSpec);
  const defaultSetters = calculateDefaultSetters(model, actionSpec.actionAtoms);
  const rawActions = composeActionBlock([
    { ...actionSpec, actionAtoms: [...actionSpec.actionAtoms, ...defaultSetters] },
  ]);

  const populates = populateSpec.populates.map((p) =>
    processPopulate(def, targetParents, namePath, p)
  );

  // collect deps from this AND subpopupulates' actions
  const selectDeps = collectActionDeps(extractActionSpecs(populateSpec));
  const actions = wrapActionsWithSelect(def, rawActions, selectDeps);

  const repeater = composeRepeater(populateSpec.repeater);

  return {
    target,
    actions,
    populates,
    repeater,
  };
}

function extractActionSpecs(populate: Spec.Populate): Spec.Action[] {
  const action = buildActionSpec(populate);
  const subactions = populate.populates.flatMap(_.unary(extractActionSpecs));
  return [action, ...subactions];
}

type PopulateAction = Omit<FilteredByKind<Spec.Action, "create">, "actionAtoms"> & {
  actionAtoms: Spec.ActionAtomSet[];
};

function buildActionSpec(populate: Spec.Populate): PopulateAction {
  return {
    kind: "create",
    // TODO: add default targetPath, alias
    targetPath: [populate.target],
    alias: populate.alias.text,
    actionAtoms: populate.setters,
    isPrimary: false,
  };
}

function calculateDefaultSetters(
  model: ModelDef,
  setters: Spec.ActionAtomSet[]
): Spec.ActionAtomSet[] {
  const usedFields = setters.map((setter) => setter.target.name);
  const missingFields = model.fields.filter((f) => !usedFields.includes(f.name) && f.name !== "id");
  return missingFields.map((field): Spec.ActionAtomSet => {
    return {
      kind: "set",
      target: {
        kind: "modelAtom",
        atomKind: "field",
        name: field.name,
        nullable: field.nullable,
        parentModel: model.name,
        type: field.type,
        unique: field.unique,
      },
      expr: defaultLiteralExpr(field),
    };
  });
}

function defaultLiteralExpr(field: FieldDef): Spec.Expr<"code"> {
  if (field.nullable) {
    return {
      kind: "literal",
      type: { kind: "null" },
      literal: { kind: "null", value: null },
    };
  }
  const literal = match<typeof field, Spec.Literal>(field)
    .with({ type: "boolean" }, (f) => ({ kind: f.type, value: false }))
    .with({ type: "float" }, (f) => ({ kind: f.type, value: 0.0 }))
    .with({ type: "integer" }, (f) => ({ kind: f.type, value: 0 }))
    .with({ type: "string" }, (f) => ({ kind: f.type, value: "" }))
    .exhaustive();
  return {
    kind: "literal",
    type: { kind: "primitive", primitiveKind: field.type },
    literal,
  };
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
