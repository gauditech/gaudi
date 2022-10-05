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

/**
 * ENTRYPOINTS
 */

export type EntrypointDef = {
  name: string;
  targetModelRef: string;
  endpoints: EndpointDef[];
};
type EndpointDef = ListEndpointDef | GetEndpointDef;

type ListEndpointDef = {
  kind: "list";
  name: string;
  path: PathFragment[];
  actions: ActionDef[];
};

type GetEndpointDef = {
  kind: "get";
  name: string;
  path: PathFragment[];
  identifyRefPath: string[];
  actions: ActionDef[];
};

type PathFragment =
  | { type: "literal"; value: string }
  | { type: "numeric"; varname: string }
  | { type: "text"; varname: string };

type SelectDef = {
  fieldRefs: string[];
  references: { refKey: string; select: SelectDef }[];
  relations: { refKey: string; select: SelectDef }[];
  queries: { refKey: string; select: SelectDef }[];
};

type FetchOne = {
  kind: "fetch one";
  modelRef: string;
  filter: FetchFilter;
  select: SelectDef;
  varname: string;
  onError: HttpResponse;
};

type FetchMany = {
  kind: "fetch many";
  modelRef: string;
  filter: FetchFilter | undefined;
  varname: string;
  select: SelectDef;
};

type HttpResponse = {
  statusCode: number;
  body: object;
};

type Respond = {
  kind: "respond";
  varname: string;
};

type ActionDef = FetchOne | FetchMany | Respond;

type FetchFilter = { kind: "binary"; operation: "is"; lhs: string; rhs: VarRef };
type VarRef = { kind: "var ref"; varname: string };
