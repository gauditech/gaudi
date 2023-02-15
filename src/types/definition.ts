import { BinaryOperator } from "./ast";

export type Definition = {
  auth?: AuthDef;
  models: ModelDef[];
  entrypoints: EntrypointDef[];
  resolveOrder: string[];
  populators: PopulatorDef[];
  runtimes: ExecutionRuntimeDef[];
};

export type AuthDef = { baseRefKey: string; localRefKey: string; accessTokenRefKey: string };

export type ModelDef = {
  kind: "model";
  refKey: string;
  name: string;
  dbname: string;
  fields: FieldDef[];
  references: ReferenceDef[];
  relations: RelationDef[];
  queries: QueryDef[];
  aggregates: AggregateDef[];
  computeds: ComputedDef[];
  hooks: ModelHookDef[];
};

export type FieldType = "integer" | "text" | "boolean";

export type FieldDef = {
  kind: "field";
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
  kind: "reference";
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
  kind: "relation";
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

export type QueryDef = {
  kind: "query";
  refKey: string;
  modelRefKey: string;
  name: string;
  // retType: string | "integer";
  retType: string;
  // retCardinality: "one" | "many";
  fromPath: string[];
  // unique: boolean;
  filter: TypedExprDef;
  select: SelectDef;
  orderBy: QueryOrderByAtomDef[] | undefined;
  limit: number | undefined;
  offset: number | undefined;
};

export type QueryOrderByAtomDef = { exp: TypedExprDef; direction: "asc" | "desc" };

export type AggregateDef = {
  kind: "aggregate";
  refKey: string;
  name: string;
  aggrFnName: "count" | "sum";
  targetPath: string[];
  query: Omit<QueryDef, "refKey" | "select" | "name">;
};

export type ComputedDef = {
  kind: "computed";
  refKey: string;
  modelRefKey: string;
  name: string;
  exp: TypedExprDef;
  type?: NaiveType;
};

export type ModelHookDef = {
  kind: "model-hook";
  refKey: string;
  name: string;
  args: { name: string; query: QueryDef }[];
  hook: HookDef;
};

type NaiveType = {
  type: "integer" | "list-integer" | "text" | "boolean";
  nullable: boolean;
};

export type LiteralValueDef =
  | LiteralIntegerDef
  | LiteralNullDef
  | LiteralTextDef
  | LiteralBooleanDef;

type TypedAlias = { kind: "alias"; namePath: string[]; type?: NaiveType };
type TypedVariable = { kind: "variable"; type?: NaiveType; name: string };

export type FunctionName = BinaryOperator | "length" | "concat";

export type TypedFunction = {
  kind: "function";
  name: FunctionName;
  args: TypedExprDef[];
  type?: NaiveType;
};

export type TypedExprDef = LiteralValueDef | TypedAlias | TypedVariable | TypedFunction | undefined;

type LiteralIntegerDef = { kind: "literal"; type: "integer"; value: number };
type LiteralTextDef = { kind: "literal"; type: "text"; value: string };
type LiteralNullDef = { kind: "literal"; type: "null"; value: null };
type LiteralBooleanDef = { kind: "literal"; type: "boolean"; value: boolean };

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
  authSelect: SelectDef;
  authorize: TypedExprDef;
  response: SelectDef;
  // actions: ActionDef[];
};

export type GetEndpointDef = {
  kind: "get";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  authSelect: SelectDef;
  authorize: TypedExprDef;
  response: SelectDef;
  // actions: ActionDef[];
};

export type CreateEndpointDef = {
  kind: "create";
  parentContext: TargetWithSelectDef[];
  target: Omit<TargetWithSelectDef, "identifyWith">;
  authSelect: SelectDef;
  authorize: TypedExprDef;
  response: SelectDef;
  fieldset: FieldsetDef;
  actions: ActionDef[];
};

export type UpdateEndpointDef = {
  kind: "update";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  authSelect: SelectDef;
  authorize: TypedExprDef;
  response: SelectDef;
  fieldset: FieldsetDef;
  actions: ActionDef[];
};

export type DeleteEndpointDef = {
  kind: "delete";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  actions: ActionDef[];
  authSelect: SelectDef;
  authorize: TypedExprDef;
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

export type SelectableItem = SelectFieldItem | SelectComputedItem | SelectAggregateItem;

export type SelectFieldItem = {
  kind: "field";
  refKey: string;
  name: string;
  alias: string;
  namePath: string[];
  // nullable: boolean;
};

export type SelectComputedItem = {
  kind: "computed";
  refKey: string;
  name: string;
  alias: string;
  namePath: string[];
  // nullable: boolean
};

export type SelectAggregateItem = {
  kind: "aggregate";
  refKey: string;
  name: string;
  alias: string;
  namePath: string[];
};

// FIXME add refKey instead of args and code
export type SelectHookItem = {
  kind: "model-hook";
  // refKey: string;
  name: string;
  alias: string;
  namePath: string[];
  args: { name: string; query: QueryDef }[];
  hook: HookDef;
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
  | HookValidator
  | NoReferenceValidator;

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
  hook: HookDef;
}
export interface NoReferenceValidator {
  name: "noReference";
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
  changeset: ChangesetDef;
  select: SelectDef;
};

export type UpdateOneAction = {
  kind: "update-one";
  alias: string;
  model: string;
  targetPath: string[];
  filter: TypedExprDef;
  changeset: ChangesetDef;
  select: SelectDef;
};

export type DeleteOneAction = {
  kind: "delete-one";
  model: string;
  targetPath: string[];
};

type DeleteManyAction = {
  kind: "delete-many";
  filter: TypedExprDef;
};

export type ChangesetDef = ChangesetOperationDef[];
export type ChangesetOperationDef = { name: string; setter: FieldSetter };

export type FieldSetterReferenceValue = {
  kind: "reference-value";
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
  throughRefKey: string;
  // required: boolean;
};

export type PopulatorDef = {
  name: string;
  populates: PopulateDef[];
};

export type PopulateDef = {
  name: string;
  target: TargetDef;
  actions: ActionDef[];
  populates: PopulateDef[];
  repeater: RepeaterDef;
};

export type PopulateTargetDef = {
  kind: "model" | "reference" | "relation"; // TODO: can we add "query" here?
  name: string;
  namePath: string[];
  refKey: string;
  retType: string;
  alias: string;
};

export type RepeaterDef = { alias?: string; start: number; end: number };

// TODO: this is very much alike to `FieldSetter` def
export type PopulateSetter = LiteralValueDef | FieldSetterReferenceValue | FieldSetterHook;
// TODO: add populator hints

export type FieldSetterChangesetReference = {
  kind: "changeset-reference";
  referenceName: string;
};

export type FieldSetterFunction = {
  kind: "function";
  name: FunctionName; // TODO rename to `fnName` to make it more clear, see line 124 as well
  args: FieldSetter[];
};

export type FieldSetterContextReference = {
  kind: "context-reference";
  referenceName: string;
};

export type FieldSetterHook = {
  kind: "fieldset-hook";
  hook: HookDef;
  args: ChangesetDef;
};

export type FieldSetter =
  // TODO add composite expression setter
  | LiteralValueDef
  | FieldSetterReferenceValue
  | FieldSetterInput
  | FieldSetterReferenceInput
  | FieldSetterChangesetReference
  | FieldSetterHook
  | FieldSetterFunction
  | FieldSetterContextReference;

export type HookDef = {
  runtime: ExecutionRuntimeDef;
  code: HookCodeDef;
};

export type HookCodeDef =
  | { kind: "inline"; inline: string }
  | { kind: "source"; target: string; file: string };

export type ExecutionRuntimeDef = {
  name: string;
  type: RuntimeEngineType;
  default: boolean;
  sourcePath: string;
};

export type RuntimeEngineType = "node";
