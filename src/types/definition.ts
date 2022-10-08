import { BinaryOperator } from "./ast";

export type Definition = {
  models: ModelDef[];
  entrypoints: EntrypointDef[];
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
  | { kind: "literal"; type: "integer"; value: number }
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

/**
 * ENTRYPOINTS
 */
export type EntrypointDef = {
  name: string;
  target: {
    kind: "model" | "reference" | "relation" | "query";
    name: string;
    refKey: string;
    type: string;
  };
  identifyWith: { name: string; refKey: string; type: "text" | "integer" };
  endpoints: EndpointDef[];
  entrypoints: EntrypointDef[];
};

export type EndpointDef =
  | CreateEndpointDef
  | ListEndpointDef
  | GetEndpointDef
  | UpdateEndpointDef
  | DeleteEndpointDef;

type ListEndpointDef = {
  kind: "list";
  response: SelectDef;
};

type GetEndpointDef = {
  kind: "get";
  response: SelectDef;
};

type CreateEndpointDef = {
  kind: "create";
  response: SelectDef;
  fieldset: FieldsetDef;
  contextActionSetters: Record<string, FieldSetter>;
  // actions: ActionDef[];
};

type UpdateEndpointDef = {
  kind: "update";
  response: SelectDef;
  fieldset: FieldsetDef;
  contextActionSetters: Record<string, FieldSetter>;
  // actions: ActionDef[];
};

type DeleteEndpointDef = {
  kind: "delete";
  // actions: ActionDef[];
};

export type SelectDef = {
  fieldRefs: string[];
  references: { refKey: string; select: SelectDef }[];
  relations: { refKey: string; select: SelectDef }[];
  queries: { refKey: string; select: SelectDef }[];
};

type FieldsetDef = { fields: Record<string, FieldsetRecordDef | FieldsetFieldDef> };

type FieldsetRecordDef = {
  kind: "record";
  record: FieldsetDef;
  nullable: boolean;
};

type FieldsetFieldDef = {
  kind: "field";
  type: FieldDef["type"];
  nullable: boolean;
};

// type ActionDef = never;

type FieldSetter =
  // TODO add algebra
  | { kind: "value"; type: "text"; value: string }
  | { kind: "value"; type: "boolean"; value: boolean }
  | { kind: "value"; type: "integer"; value: number }
  | { kind: "fieldset-input"; type: FieldDef["type"]; fieldsetAccess: string[] }
  | { kind: "reference-value"; type: FieldDef["type"]; fromAlias: string; aliasAccess: string[] }
  | {
      kind: "fieldset-reference-input";
      fieldsetAccess: string[];
      throughField: { name: string; refKey: string };
    };
