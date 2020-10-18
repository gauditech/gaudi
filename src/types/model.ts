export interface ModelDef {
  name: string;
  idname?: string;
  fields: FieldDef[];
  dbname?: string;
  references?: ReferenceDef[];
}

export interface FieldDef {
  name: string;
  type: "string" | "integer" | "datetime";
  dbname?: string;
  nullable?: boolean;
}

export interface ReferenceDef {
  name: string;
  model: string;
  fieldName?: string;
  fieldDbName?: string;
  modelFieldName?: string;
}

export interface BaseModel extends Required<ModelDef> {
  fields: Field[];
}
export interface RefModel extends BaseModel {
  references: Reference[];
}

export type Model = RefModel;

export type Field = Required<FieldDef>;

export interface Reference extends Required<ReferenceDef> {
  modelFieldDbName: string;
}
