export type Definition = {
  models: ModelDef[];
};

export type ModelDef = {
  refKey: string;
  name: string;
  dbname: string;
  fields: FieldDef[];
  references: ReferenceDef[];
  relations: RelationDef[];
};

export type FieldDef = {
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

export type ReferenceDef = {
  refKey: string;
  modelRefKey: string;
  name: string;
  fieldRefKey: string;
  toModelRefKey: string;
  toModelFieldRefKey: string;
  nullable: boolean;
  unique: boolean;
};

export type RelationDef = {
  refKey: string;
  modelRefKey: string;
  name: string;
  fromModel: string;
  fromModelRefKey: string;
  through: string;
  throughRefKey: string;
  nullable: boolean;
  unique: boolean;
};

type QueryDefPathSelect = {
  name: string;
  retType: string; // fixme
  refKey: string;
};

export type QueryDefPath = {
  name: string;
  refKey: string;
  retType: string;
  refCardinality: "one" | "many";
  nullable: boolean;
  alias: string;
  bpAlias: string | null;
  path: QueryDefPath[];
  select: QueryDefPathSelect[];
};

type QueryDefFilter = {
  type: string;
  lhs: string | number | boolean;
  rhs: string | number | boolean;
};

export type QueryDef = {
  name: string;
  retType: string;
  retCardinality: "one" | "many";
  nullable: boolean;
  // unique: boolean;
  path: QueryDefPath[];
  filters: QueryDefFilter[];
};
