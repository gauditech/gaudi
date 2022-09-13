import { Blueprint } from "./types/blueprint";
import { Field, Model, Reference, Relation } from "./types/model";

export function splitRef(ref: string): [string, string] {
  const path = ref.split(".");
  if (path.length !== 2) {
    throw new Error("Invalid ref");
  }
  return [path[0], path[1]];
}

export function findModel(bp: Blueprint, ref: string): Model {
  return bp.models[ref]!; // TODO: Throw;
}

export function findField(bp: Blueprint, ref: string): Field {
  const [modelName, _fieldName] = splitRef(ref);
  return bp.models[modelName].fields.find((f) => f.selfRef === ref)!; // TODO: Throw;
}

export function findReference(bp: Blueprint, ref: string): Reference {
  const [modelName, _fieldName] = splitRef(ref);
  return bp.models[modelName].references.find((f) => f.selfRef === ref)!; // TODO: Throw;
}

export function findRelation(bp: Blueprint, ref: string): Relation {
  const [modelName, _fieldName] = splitRef(ref);
  return bp.models[modelName].relations.find((f) => f.selfRef === ref)!; // TODO: Throw;
}
