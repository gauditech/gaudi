import _ from "lodash";

import { FilteredKind } from "@src/common/patternFilter";
import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { Definition, ModelDef } from "@src/types/definition";
import {
  ActionAtomSpecDeny,
  ActionAtomSpecInput,
  ActionAtomSpecInputList,
  ActionAtomSpecRefThrough,
  ActionAtomSpecSet,
  ActionAtomSpecVirtualInput,
  ModelActionSpec,
} from "@src/types/specification";

export type SimpleActionSpec = {
  kind: "create" | "update";
  alias: string;
  blueprintAlias: string | undefined;
  targetPath: string[];
  blueprintTargetPath: string[] | undefined;
  actionAtoms: SimpleActionAtoms[];
};

export type SimpleActionAtoms =
  | ActionAtomSpecVirtualInput
  | ActionAtomSpecInput
  | ActionAtomSpecRefThrough
  | ActionAtomSpecSet;

export function simplifyActionSpec(
  def: Definition,
  spec: ModelActionSpec,
  defaultActionAlias: string,
  model: ModelDef
): FilteredKind<SimpleActionSpec, "create" | "update"> {
  const atoms = spec.actionAtoms;

  /**
   * Convert input-list to input for easier handling later in the code.
   * Convert inputs on `reference`s to input on `field`s.
   */
  function maybeConvertReferenceToField(a: ActionAtomSpecInput): ActionAtomSpecInput {
    const ref = getRef(def, model.name, a.fieldSpec.name, ["field", "reference"]);
    switch (ref.kind) {
      case "field": {
        return a;
      }
      case "reference": {
        // TODO convert to fieldset-reference-input instead, to get a better runtime error
        return { ...a, fieldSpec: { ...a.fieldSpec, name: `${a.fieldSpec.name}_id` } };
      }
    }
  }

  const virtualInputs = atoms.filter(
    (atom): atom is ActionAtomSpecVirtualInput => atom.kind === "virtual-input"
  );

  const inputs = atoms
    .filter((a): a is ActionAtomSpecInputList => a.kind === "input-list")
    .flatMap((i): ActionAtomSpecInput[] => {
      switch (i.kind) {
        case "input-list": {
          return i.fields.map(
            (fspec): ActionAtomSpecInput =>
              maybeConvertReferenceToField({
                kind: "input",
                fieldSpec: fspec,
              })
          );
        }
      }
    });

  // TODO ensure every refInput points to a reference field
  const refInputs = atoms.filter((a): a is ActionAtomSpecRefThrough => a.kind === "reference");
  const setters = atoms
    .filter((a): a is ActionAtomSpecSet => a.kind === "set")
    .map((a): ActionAtomSpecSet => {
      if (a.set.kind === "query") {
        return a;
      }

      const ref = getRef(def, model.name, a.target, ["field", "reference"]);
      if (ref.kind === "field") {
        return a;
      }

      switch (a.set.kind) {
        case "hook": {
          throw new Error(`Hooks can't target models' reference properties, must target fields`);
        }
        case "expression": {
          // we don't support arithmetics on reference properties
          const identifierExp = a.set.exp;
          ensureEqual(identifierExp.kind, "identifier" as const);
          /*
           * Convert a reference setter to a field setter
           */
          return {
            ...a,
            target: `${a.target}_id`,
            set: {
              ...a.set,
              exp: {
                ...identifierExp,
                identifier: [...identifierExp.identifier, "id"],
              },
            },
          };
        }
      }
    });

  const denies = atoms
    .filter((a): a is ActionAtomSpecDeny => a.kind === "deny")
    .map((d, _index, array) => {
      if (d.fields === "*") {
        // ensure this is the only deny rule
        ensureEqual(array.length, 1);
        return d;
      }
      // convert deny references to fields
      const fields = d.fields.map((fname): string => {
        const ref = getRef(def, model.name, fname, ["field", "reference"]);
        switch (ref.kind) {
          case "reference":
            return `${fname}_id`;
          case "field":
            return fname;
          default:
            assertUnreachable(ref);
        }
      });
      return { ...d, fields };
    });

  /*
   * ensure no duplicate fields
   */
  const allFieldNames = [
    ...virtualInputs.map((i) => i.name),
    ...inputs.flatMap((f) => f.fieldSpec.name),
    ...refInputs.map((r) => `${r.target}_id`),
    ...setters.map((s) => s.target),
    ...denies.flatMap((d) => d.fields),
  ];
  const duplicates = _.chain(allFieldNames)
    .countBy()
    .toPairs()
    .filter(([_name, count]) => count > 1)
    .map(([name, _count]) => name)
    .value();

  const message = `Found duplicates: [${duplicates.join(", ")}]`;

  ensureEqual(allFieldNames.length, _.uniq(allFieldNames).length, message);

  // convert denies to implicit inputs
  const implicitInputs: ActionAtomSpecInput[] = [];
  const hasDenyAll = denies[0] && denies[0].fields === "*";
  if (!hasDenyAll) {
    /**
     * If user hasn't explicitely denied all the implicit inputs, let's find all fields
     * not used as targets in other rules
     */
    const modelFieldNames = model.fields.filter((f) => f.name !== "id").map((f) => f.name);
    const denyFieldNames = denies.flatMap((d) => d.fields as string[]);
    const implicitFieldNames = _.difference(modelFieldNames, allFieldNames, denyFieldNames);
    implicitFieldNames.forEach((name) => {
      implicitInputs.push({
        kind: "input",
        fieldSpec: {
          name,
          optional: spec.kind === "update", // Partial updates, implicit inputs are optional
        },
      });
    });
  }

  const simplifiedAtoms: SimpleActionAtoms[] = [
    ...virtualInputs,
    ...inputs,
    ...refInputs,
    ...implicitInputs,
    ...setters,
  ];

  const targetPath = spec.targetPath ?? [defaultActionAlias];

  // return simplified spec
  return {
    ...spec,
    alias: spec.alias || `$` + targetPath.join("|"), // FIXME
    blueprintAlias: spec.alias,
    targetPath,
    blueprintTargetPath: spec.targetPath,
    actionAtoms: simplifiedAtoms,
  };
}

// /**
//  * Converts `input-list` into a list of separate `input` atoms.
//  * Furthermore, converts `input` to a `reference` when targeting reference fields.
//  */
// const CONVERT_FIELD_TO_REF_THROUGH = false;
// function simplifyInputs(
//   def: Definition,
//   model: ModelDef,
//   atoms: ActionAtomSpec[]
// ): Exclude<ActionAtomSpec, ActionAtomSpecInputList>[] {
//   function maybeConvertReference(
//     atom: ActionAtomSpecInput
//   ): ActionAtomSpecInput | ActionAtomSpecRefThrough {
//     const ref = getRef(def, model.name, atom.fieldSpec.name, ["field", "reference"]);
//     switch (ref.kind) {
//       case "field": {
//         // Temporarily disable the field -> reference-through conversion
//         if (!CONVERT_FIELD_TO_REF_THROUGH) {
//           return atom;
//         }
//         /*
//          * Does this field belong to a reference? If it does, we can turn it into a reference-through.
//          */
//         const reference = model.references.find(
//           (reference) => reference.fieldRefKey === ref.refKey
//         );
//         if (reference) {
//           return { kind: "reference", target: atom.fieldSpec.name, through: "id" };
//         } else {
//           // Any other field - return an input.
//           return atom;
//         }
//       }
//       case "reference": {
//         /**
//          * Turn reference input into a reference-through.
//          */
//         return { kind: "reference", target: atom.fieldSpec.name, through: "id" };
//       }
//     }
//   }

//   return atoms.flatMap((atom): Exclude<ActionAtomSpec, ActionAtomSpecInputList>[] => {
//     switch (atom.kind) {
//       case "input-list": {
//         return atom.fields.map((fspec) =>
//           maybeConvertReference({
//             kind: "input",
//             fieldSpec: fspec,
//           })
//         );
//       }
//       case "input": {
//         return [maybeConvertReference(atom)];
//       }
//       default:
//         return [atom];
//     }
//   });
// }
