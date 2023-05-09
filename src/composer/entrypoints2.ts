import { kindFilter } from "@src/common/kindFilter";
import * as AST from "@src/compiler/ast/ast";
import { getTypeModel } from "@src/compiler/ast/type";
import { SelectDef, SelectItem } from "@src/types/definition";

export function processSelect(
  models: AST.Model[],
  model: string,
  select: AST.Select | undefined,
  parentNamePath: string[]
): SelectDef {
  if (select === undefined) {
    const modelAtoms = models.find((m) => m.name.text === model)?.atoms ?? [];
    const idField: SelectItem = {
      kind: "field",
      name: "id",
      alias: "id",
      namePath: [...parentNamePath, "id"],
      refKey: `${model}.id`,
    };
    const fields = kindFilter(modelAtoms, "field").map(
      (f): SelectItem => ({
        kind: "field",
        name: f.name.text,
        alias: f.name.text,
        namePath: [...parentNamePath, f.name.text],
        refKey: `${model}.${f.name.text}`,
      })
    );
    const references = kindFilter(modelAtoms, "reference").map(
      (r): SelectItem => ({
        kind: "field",
        name: `${r.name.text}_id`,
        alias: `${r.name.text}_id`,
        namePath: [...parentNamePath, `${r.name.text}_id`],
        refKey: `${model}.${r.name.text}_id`,
      })
    );
    return [idField, ...fields, ...references];
  }

  return select.map(({ target, select }): SelectItem => {
    if (target.kind === "long") {
      throw Error("Long select form unsupported composer");
    }
    if (target.name.ref.kind !== "modelAtom") {
      throw new Error("Unexpected select ref");
    }

    const namePath = [...parentNamePath, target.name.ref.name];

    switch (target.name.ref.atomKind) {
      case "field":
      case "computed":
        return {
          kind: target.name.ref.atomKind,
          refKey: `${target.name.ref.model}.${target.name.ref.name}`,
          name: target.name.ref.name,
          alias: target.name.identifier.text,
          namePath,
        };
      case "hook":
        return {
          kind: "model-hook",
          refKey: `${target.name.ref.model}.${target.name.ref.name}`,
          name: target.name.ref.name,
          alias: target.name.identifier.text,
          namePath,
        };
      case "reference":
      case "relation":
      case "query": {
        const targetModel = getTypeModel(target.name.type);
        // if type has no model, it's an aggregate
        if (!targetModel) {
          return {
            kind: "aggregate",
            refKey: `${target.name.ref.model}.${target.name.ref.name}`,
            name: target.name.ref.name,
            alias: target.name.identifier.text,
            namePath,
          };
        }
        return {
          kind: target.name.ref.atomKind,
          name: target.name.ref.name,
          alias: target.name.identifier.text,
          namePath,
          select: processSelect(models, targetModel, select, namePath),
        };
      }
    }
  });
}
