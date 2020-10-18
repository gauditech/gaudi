export interface ModelDef {
  name: string;
  fields: FieldDef[];
  references?: ReferenceDef[];
}

export interface FieldDef {
  name: string;
  type: "string" | "integer" | "datetime";
  nullable?: boolean;
}

export interface ReferenceDef {
  name: string;
  model: string;
}

export interface BaseModel {
  name: string;
  dbname: string;
  selfRef: string;
  fields: Field[];
  referenceDefs: ReferenceDef[];
}
export interface RefModel extends Omit<BaseModel, "referenceDefs"> {
  references: Reference[];
}

export type Model = RefModel;

export interface Field {
  name: string;
  nullable: boolean;
  type: FieldDef["type"] | "serial";
  dbname: string;
  selfRef: string;
  modelRef: string;
}

export interface Reference {
  name: string;
  fieldRef: string;
  targetFieldRef: string;
}
