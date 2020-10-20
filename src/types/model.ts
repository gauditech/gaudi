import * as Parsed from "./parsed";

export interface BaseModel {
  name: string;
  dbname: string;
  selfRef: string;
  fields: Field[];
  referenceDefs: Parsed.ReferenceDef[];
  relationDefs: Parsed.RelationDef[];
}
export interface RefModel extends Omit<BaseModel, "referenceDefs"> {
  references: Reference[];
}

export interface RelModel extends Omit<RefModel, "relationDefs"> {
  relations: Relation[];
}

export type Model = RelModel;

export interface Field {
  name: string;
  nullable: boolean;
  type: Parsed.FieldDef["type"] | "serial";
  dbname: string;
  selfRef: string;
  modelRef: string;
}

export interface Reference {
  name: string;
  selfRef: string;
  fieldRef: string; // a model field referencing another table (eg foo_id) - holds modelRef
  targetFieldRef: string; // a field referenced in another table (eg Foo.id)
}
