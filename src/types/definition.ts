import { BinaryOperator } from "./ast";

import { RefKind } from "@src/common/refs";

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

type QueryFrom = { kind: "model"; refKey: string } | { kind: "query"; query: QueryDef };

export type QueryDef = {
  refKey: string;
  name: string;
  // retType: string | "integer";
  retType: string;
  from: QueryFrom;
  // retCardinality: "one" | "many";
  fromPath: string[];
  nullable: boolean;
  // unique: boolean;
  joinPaths: QueryDefPath[];
  filter: FilterDef;
  select: SelectDef;
  // count?: true;
};

export type QueryDefPath = {
  kind: Extract<RefKind, "reference" | "relation" | "query">;
  refKey: string;
  name: string;
  namePath: string[];
  joinType: "inner" | "outer";
  joinPaths: QueryDefPath[];
  retType: string;
  // retCardinality: "one" | "many";
};

// simple filter types, for now

export type FilterDef =
  | { kind: "binary"; lhs: FilterDef; rhs: FilterDef; operator: BinaryOperator }
  | { kind: "alias"; namePath: string[] }
  | LiteralFilterDef
  | { kind: "variable"; type: "integer" | "list-integer" | "text" | "boolean"; name: string }
  | undefined;

export type LiteralFilterDef =
  | { kind: "literal"; type: "integer"; value: number }
  | { kind: "literal"; type: "null"; value: null }
  | { kind: "literal"; type: "text"; value: string }
  | { kind: "literal"; type: "boolean"; value: boolean };

/**
 * ENTRYPOINTS
 */
export type EntrypointDef = {
  name: string;
  target: TargetDef;
  endpoints: EndpointDef[];
  entrypoints: EntrypointDef[];
};

export type TargetDef = {
  kind: "model" | "reference" | "relation" | "query";
  name: string;
  namePath: string[];
  refKey: string;
  retType: string;
  alias: string | null;
  identifyWith: { name: string; refKey: string; type: "text" | "integer"; paramName: string };
};

export type EndpointDef =
  | CreateEndpointDef
  | ListEndpointDef
  | GetEndpointDef
  | UpdateEndpointDef
  | DeleteEndpointDef;
// | CustomEndpointDef;

export type ListEndpointDef = {
  kind: "list";
  targets: TargetDef[];
  response: SelectDef;
  actions: ActionDef[];
};

export type GetEndpointDef = {
  kind: "get";
  targets: TargetDef[];
  response: SelectDef;
  actions: ActionDef[];
};

export type CreateEndpointDef = {
  kind: "create";
  targets: TargetDef[];
  response: SelectDef;
  fieldset: FieldsetDef;
  contextActionChangeset: Changeset;
  actions: ActionDef[];
};

type UpdateEndpointDef = {
  kind: "update";
  targets: TargetDef[];
  response: SelectDef;
  fieldset: FieldsetDef;
  contextActionChangeset: Changeset;
  actions: ActionDef[];
};

type DeleteEndpointDef = {
  kind: "delete";
  targets: TargetDef[];
  actions: ActionDef[];
  response: undefined;
};

type CustomEndpointDef = {
  kind: "custom";
  targets: TargetDef[];
  method: "post" | "get" | "put" | "delete";
  actions: ActionDef[];
  respondWith: {
    // TODO
  };
};

export type SelectableItem = SelectFieldItem | SelectConstantItem;

export type SelectFieldItem = {
  kind: "field";
  name: string;
  refKey: string;
  namePath: string[];
  // nullable: boolean;
  alias: string;
};

export type SelectConstantItem = {
  kind: "constant";
  type: "integer";
  value: number;
  alias: string;
};

export type DeepSelectItem = {
  kind: "reference" | "relation" | "query";
  name: string;
  namePath: string[];
  alias: string;
  // nullable: boolean;
  // retType: string;
  select: SelectItem[];
};

export type SelectItem = SelectableItem | DeepSelectItem;

export type SelectDef = SelectItem[];

export type FieldsetDef = FieldsetRecordDef | FieldsetFieldDef;

export type FieldsetRecordDef = {
  kind: "record";
  record: Record<string, FieldsetDef>;
  nullable: boolean;
};

export type FieldsetFieldDef = {
  kind: "field";
  type: FieldDef["type"];
  nullable: boolean;
};

export type ActionDef = CreateOneAction | UpdateOneAction | DeleteManyAction;

type CreateOneAction = {
  kind: "create-one";
  model: string;
  changeset: Changeset;
};

type UpdateOneAction = {
  kind: "update-one";
  model: string;
  target: {
    alias: string;
    access: string[];
  };
  filter: FilterDef;
  changeset: Changeset;
};

type DeleteManyAction = {
  kind: "delete-many";
  model: string;
  filter: FilterDef;
};

export type Changeset = Record<string, FieldSetter>;

export type FieldSetter =
  // TODO add algebra
  | { kind: "value"; type: "text"; value: string }
  | { kind: "value"; type: "boolean"; value: boolean }
  | { kind: "value"; type: "integer"; value: number }
  | { kind: "fieldset-input"; type: FieldDef["type"]; fieldsetAccess: string[] }
  | { kind: "reference-value"; type: FieldDef["type"]; target: { alias: string; access: string[] } }
  | {
      kind: "fieldset-reference-input";
      fieldsetAccess: string[];
      throughField: { name: string; refKey: string };
    };

export type QueryTree = {
  query: QueryDef;
  related: Record<string, QueryTree>;
};
