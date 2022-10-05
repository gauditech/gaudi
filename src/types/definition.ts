import { BinaryOperator } from "./ast";

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
  queries: QueryDef[];
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

export type QueryDefPathSelect = {
  refKey: string;
  name: string;
  namePath: string[];
  retType: string;
  nullable: boolean;
};

export type QueryDefPath = {
  refKey: string;
  name: string;
  retType: string;
  retCardinality: "one" | "many"; // should be retCard,...
  nullable: boolean;
  joinType: "inner" | "left";
  namePath: string[];
  bpAlias: string | null;
  joinPaths: QueryDefPath[];
  select: QueryDefPathSelect[];
};

// simple filter types, for now

export type FilterDef =
  | { kind: "binary"; lhs: FilterDef; rhs: FilterDef; operator: BinaryOperator }
  | { kind: "alias"; namePath: string[] }
  | LiteralFilterDef;

export type LiteralFilterDef =
  | { kind: "literal"; type: "numeric"; value: number }
  | { kind: "literal"; type: "null"; value: null }
  | { kind: "literal"; type: "text"; value: string }
  | { kind: "literal"; type: "boolean"; value: boolean };

export type QueryDef = {
  refKey: string;
  name: string;
  retType: string;
  retCardinality: "one" | "many";
  nullable: boolean;
  // unique: boolean;
  joinPaths: QueryDefPath[];
  filter: FilterDef | undefined;
};
