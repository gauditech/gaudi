export interface ModelDef {
  name: string;
  fields: FieldDef[];
  references?: ReferenceDef[];
  relations?: RelationDef[];
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

export interface RelationDef {
  name: string;
  model: string;
}
