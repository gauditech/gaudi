import { BinaryOperator } from "./ast";
import { HookCode } from "./specification";

import { RefKind } from "@src/common/refs";

export type Definition = {
  models: ModelDef[];
  entrypoints: EntrypointDef[];
  populators: PopulatorDef[];
};

export type ModelDef = {
  refKey: string;
  name: string;
  dbname: string;
  fields: FieldDef[];
  references: ReferenceDef[];
  relations: RelationDef[];
  queries: QueryDef[];
  hooks: ModelHookDef[];
};

export type FieldType = "integer" | "text" | "boolean";

export type FieldDef = {
  refKey: string;
  modelRefKey: string;
  name: string;
  dbname: string;
  type: FieldType;
  dbtype: "serial" | "integer" | "text" | "boolean";
  primary: boolean;
  unique: boolean;
  nullable: boolean;
  validators: ValidatorDef[];
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

export type ModelHookDef = {
  refKey: string;
  name: string;
  args: { name: string; query: QueryDef }[];
  code: HookCode;
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
  | LiteralValueDef
  | { kind: "variable"; type: "integer" | "list-integer" | "text" | "boolean"; name: string }
  | undefined;

export type LiteralValueDef =
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
  alias: string;
  identifyWith: { name: string; refKey: string; type: "text" | "integer"; paramName: string };
};

export type TargetWithSelectDef = TargetDef & { select: SelectDef };

export type EndpointDef =
  | CreateEndpointDef
  | ListEndpointDef
  | GetEndpointDef
  | UpdateEndpointDef
  | DeleteEndpointDef;
// | CustomEndpointDef;

export type ListEndpointDef = {
  kind: "list";
  parentContext: TargetWithSelectDef[];
  target: Omit<TargetWithSelectDef, "identifyWith">;
  response: SelectDef;
  // actions: ActionDef[];
};

export type GetEndpointDef = {
  kind: "get";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  response: SelectDef;
  // actions: ActionDef[];
};

export type CreateEndpointDef = {
  kind: "create";
  parentContext: TargetWithSelectDef[];
  target: Omit<TargetWithSelectDef, "identifyWith">;
  response: SelectDef;
  fieldset: FieldsetDef;
  actions: ActionDef[];
};

export type UpdateEndpointDef = {
  kind: "update";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  response: SelectDef;
  fieldset: FieldsetDef;
  actions: ActionDef[];
};

export type DeleteEndpointDef = {
  kind: "delete";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  actions: ActionDef[];
  response: undefined;
};

type CustomEndpointDef = {
  kind: "custom";
  parentContext: TargetWithSelectDef[];
  target: null;
  method: "post" | "get" | "put" | "delete";
  actions: ActionDef[];
  respondWith: {
    // TODO
  };
};

export type SelectableItem = SelectFieldItem;

export type SelectFieldItem = {
  kind: "field";
  name: string;
  refKey: string;
  namePath: string[];
  // nullable: boolean;
  alias: string;
};

export type SelectHookItem = {
  kind: "hook";
  name: string;
  alias: string;
  namePath: string[];
  args: { name: string; query: QueryDef }[];
  code: HookCode;
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

export type SelectItem = SelectableItem | DeepSelectItem | SelectHookItem;

export type SelectDef = SelectItem[];

export type FieldsetDef = FieldsetRecordDef | FieldsetFieldDef;

export type FieldsetRecordDef = {
  kind: "record";
  record: Record<string, FieldsetDef>;
  nullable: boolean;
};

export type IValidatorDef = {
  name: string;
  inputType: "integer" | "text" | "boolean";
  args: ConstantDef[];
};

export type FieldsetFieldDef = {
  kind: "field";
  type: FieldDef["type"];
  nullable: boolean;
  required: boolean;
  validators: ValidatorDef[];
};

export type ValidatorDef =
  | MinLengthTextValidator
  | MaxLengthTextValidator
  | EmailTextValidator
  | MinIntValidator
  | MaxIntValidator
  | IsBooleanEqual
  | IsIntEqual
  | IsTextEqual
  | HookValidator;

export const ValidatorDefinition = [
  ["text", "max", "maxLength", ["integer"]],
  ["text", "min", "minLength", ["integer"]],
  ["text", "isEmail", "isEmail", []],
  ["integer", "min", "min", ["integer"]],
  ["integer", "max", "max", ["integer"]],
  ["boolean", "isEqual", "isBoolEqual", ["boolean"]],
  ["integer", "isEqual", "isIntEqual", ["integer"]],
  ["text", "isEqual", "isTextEqual", ["text"]],
] as const;

export interface MinLengthTextValidator extends IValidatorDef {
  name: "minLength";
  inputType: "text";
  args: [IntConst];
}

export interface MaxLengthTextValidator extends IValidatorDef {
  name: "maxLength";
  inputType: "text";
  args: [IntConst];
}

export interface EmailTextValidator extends IValidatorDef {
  name: "isEmail";
  inputType: "text";
  args: [];
}

export interface MinIntValidator extends IValidatorDef {
  name: "min";
  inputType: "integer";
  args: [IntConst];
}

export interface MaxIntValidator extends IValidatorDef {
  name: "max";
  inputType: "integer";
  args: [IntConst];
}

export interface IsBooleanEqual extends IValidatorDef {
  name: "isBoolEqual";
  inputType: "boolean";
  args: [BoolConst];
}
export interface IsIntEqual extends IValidatorDef {
  name: "isIntEqual";
  inputType: "integer";
  args: [IntConst];
}
export interface IsTextEqual extends IValidatorDef {
  name: "isTextEqual";
  inputType: "text";
  args: [TextConst];
}
export interface HookValidator {
  name: "hook";
  arg?: string;
  code: HookCode;
}

export type ConstantDef = TextConst | IntConst | BoolConst | NullConst;
type BoolConst = { type: "boolean"; value: boolean };
type IntConst = { type: "integer"; value: number };
type TextConst = { type: "text"; value: string };
type NullConst = { type: "null"; value: null };

export type ActionDef = CreateOneAction | UpdateOneAction | DeleteOneAction;

export type CreateOneAction = {
  kind: "create-one";
  alias: string;
  model: string;
  targetPath: string[];
  changeset: Changeset;
  select: SelectDef;
};

export type UpdateOneAction = {
  kind: "update-one";
  alias: string;
  model: string;
  targetPath: string[];
  filter: FilterDef;
  changeset: Changeset;
  select: SelectDef;
};

export type DeleteOneAction = {
  kind: "delete-one";
  model: string;
  targetPath: string[];
};

export type DeleteManyAction = {
  kind: "delete-many";
  filter: FilterDef;
};

export type Changeset = Record<string, FieldSetter>;

// need this exported for TypedContextPath;
type IdentifierDefGen<K> = { kind: K; name: string; refKey: string };
export type IdentifierDefModel = IdentifierDefGen<"model">;
export type IdentifierDefField = IdentifierDefGen<"field">;
export type IdentifierDef =
  | IdentifierDefGen<"query" | "relation" | "reference">
  | IdentifierDefField
  | IdentifierDefModel;

export type FieldSetterReferenceValue = {
  kind: "reference-value";
  type: FieldDef["type"];
  target: { alias: string; access: string[] };
};

export type FieldSetterInput = {
  kind: "fieldset-input";
  type: FieldDef["type"];
  fieldsetAccess: string[];
  required: boolean;
  default?: LiteralValueDef | FieldSetterReferenceValue;
};

export type FieldSetterReferenceInput = {
  kind: "fieldset-reference-input";
  fieldsetAccess: string[];
  throughField: { name: string; refKey: string };
  // required: boolean;
};

export type PopulatorDef = {
  name: string;
  populates: PopulateDef[];
};

export type PopulateDef = {
  name: string;
  target: PopulateTargetDef;
  repeat: PopulateRepeatDef;
  changeset: PopulateChangeset;
  populates: PopulateDef[];
};

export type PopulateTargetDef = {
  kind: "model" | "reference" | "relation"; // TODO: can we add "query" here?
  name: string;
  namePath: string[];
  refKey: string;
  retType: string;
  alias: string;
};

export type PopulateRepeatDef = { alias?: string; min: number; max: number };

export type PopulateChangeset = Record<string, PopulateSetter>;

// TODO: this is very much alike to `FieldSetter` def
export type PopulateSetter = LiteralValueDef | FieldSetterReferenceValue | FieldSetterHook;
// TODO: add populator hints

export type FieldSetterHook = {
  kind: "fieldset-hook";
  code: HookCode;
  args: Changeset;
};

export type FieldSetter =
  // TODO add composite expression setter
  | LiteralValueDef
  | FieldSetterReferenceValue
  | FieldSetterInput
  | FieldSetterReferenceInput
  | FieldSetterHook;
