export type Definition = {
  models: ModelDef[];
};

type ModelDef = {
  refKey: string;
  name: string;
  dbname: string;
  fields: FieldDef[];
  references: ReferenceDef[];
  relations: RelationDef[];
};

type FieldDef = {
  refKey: string;
  modelRefKey: string;
  name: string;
  dbname: string;
  type: "integer" | "text" | "boolean";
  dbtype: "serial" | "integer" | "text" | "boolean";
  primary: boolean;
  unique: boolean;
  nullable: boolean;
};

type ReferenceDef = {
  refKey: string;
  modelRefKey: string;
  name: string;
  fieldRefKey: string;
  toModelRefKey: string;
  toModelFieldRefKey: string;
};

type RelationDef = {
  refKey: string;
  modelRefKey: string;
  name: string;
  fromModel: string;
  fromModelRefKey: string;
  through: string;
  throughRefKey: string;
};
