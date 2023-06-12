import { HookCode } from "@src/types/common";

export type Definition = {
  models: ModelDef[];
  apis: ApiDef[];
  populators: PopulatorDef[];
  runtimes: ExecutionRuntimeDef[];
  authenticator: AuthenticatorDef | undefined;
  generators: GeneratorDef[];
};

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
  type: VariablePrimitiveType;
};

export type ModelHookDef = {
  kind: "model-hook";
  refKey: string;
  name: string;
  args: { name: string; query: QueryDef }[];
  hook: HookCode;
};

export type VariablePrimitiveType = {
  kind: "integer" | "text" | "boolean" | "unknown" | "null";
  nullable: boolean;
};

type VariableCollectionType<T extends VariablePrimitiveType = VariablePrimitiveType> = {
  kind: "collection";
  type: T;
};

type TypedVariableType = VariablePrimitiveType | VariableCollectionType;

export type LiteralValueDef =
  | LiteralIntegerDef
  | LiteralNullDef
  | LiteralTextDef
  | LiteralBooleanDef;

type TypedAlias = { kind: "alias"; namePath: string[]; type?: TypedVariableType };
type TypedVariable = { kind: "variable"; type?: TypedVariableType; name: string };

export type BinaryOperator =
  | "or"
  | "and"
  | "is not"
  | "is"
  | "not in"
  | "in"
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "/"
  | "*";

export type FunctionName =
  | BinaryOperator
  | "length"
  | "concat"
  | "lower"
  | "upper"
  | "now"
  | "cryptoHash"
  | "cryptoCompare"
  | "cryptoToken"
  | "stringify";

export type AggregateFunctionName = "count" | "sum";

export type InSubqueryFunctionName = "in" | "not in";

export type TypedFunction = {
  kind: "function";
  name: FunctionName;
  args: TypedExprDef[];
  type?: TypedVariableType;
};

export type TypedExprDef =
  | LiteralValueDef
  | TypedAlias
  | TypedVariable
  | TypedFunction
  | TypedAggregateFunction
  | TypedExistsSubquery
  | undefined;

type TypedAggregateFunction = {
  kind: "aggregate-function";
  fnName: FunctionName | AggregateFunctionName;
  type: VariablePrimitiveType;
  sourcePath: string[];
  targetPath: string[];
};

type TypedExistsSubquery = {
  kind: "in-subquery";
  fnName: InSubqueryFunctionName;
  lookupAlias: string[];
  sourcePath: string[];
  targetPath: string[];
};

type LiteralIntegerDef = { kind: "literal"; type: "integer"; value: number };
type LiteralTextDef = { kind: "literal"; type: "text"; value: string };
type LiteralNullDef = { kind: "literal"; type: "null"; value: null };
type LiteralBooleanDef = { kind: "literal"; type: "boolean"; value: boolean };

export type ApiDef = {
  name?: string;
  path: string;
  entrypoints: EntrypointDef[];
};

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
  kind: "model" | "reference" | "relation";
  name: string;
  namePath: string[];
  retType: string;
  alias: string;
  identifyWith:
    | { name: string; refKey: string; type: "text" | "integer"; paramName: string }
    | undefined;
};

export type TargetWithSelectDef = TargetDef & { select: SelectDef };

export type EndpointHttpMethod = "GET" | "POST" | /*"PUT" |*/ "PATCH" | "DELETE";

export type EndpointDef =
  | CreateEndpointDef
  | ListEndpointDef
  | GetEndpointDef
  | UpdateEndpointDef
  | DeleteEndpointDef
  | CustomOneEndpointDef
  | CustomManyEndpointDef;

export type ListEndpointDef = {
  kind: "list";
  parentContext: TargetWithSelectDef[];
  target: Omit<TargetWithSelectDef, "identifyWith">;
  authSelect: SelectDef;
  authorize: TypedExprDef;
  pageable: boolean;
  response: SelectDef;
  orderBy: QueryOrderByAtomDef[] | undefined;
  filter: TypedExprDef | undefined;
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

export type CustomOneEndpointDef = {
  kind: "custom-one";
  parentContext: TargetWithSelectDef[];
  target: TargetWithSelectDef;
  method: EndpointHttpMethod;
  path: string;
  actions: ActionDef[];
  authSelect: SelectDef;
  authorize: TypedExprDef;
  fieldset?: FieldsetDef;
  response: undefined;
  responds: boolean;
};

export type CustomManyEndpointDef = {
  kind: "custom-many";
  parentContext: TargetWithSelectDef[];
  target: Omit<TargetWithSelectDef, "identifyWith">;
  method: EndpointHttpMethod;
  path: string;
  actions: ActionDef[];
  authSelect: SelectDef;
  authorize: TypedExprDef;
  fieldset?: FieldsetDef;
  response: undefined;
  responds: boolean;
};

export type SelectableExpression = {
  kind: "expression";
  alias: string;
  expr: TypedExprDef;
  type: VariablePrimitiveType;
};

/**
 * NOTE: hooks currently cannot be part of expressions.
 */

export type SelectHook = {
  kind: "model-hook";
  refKey: string;
  name: string;
  alias: string;
  namePath: string[];
};

export type NestedSelect = {
  kind: "nested-select";
  refKey: string;
  namePath: string[];
  alias: string;
  select: SelectItem[];
};

export type SelectItem = SelectableExpression | NestedSelect | SelectHook;

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
  hook: HookCode;
}
export interface NoReferenceValidator {
  name: "noReference";
}

export type ConstantDef = TextConst | IntConst | BoolConst | NullConst;
type BoolConst = { type: "boolean"; value: boolean };
type IntConst = { type: "integer"; value: number };
type TextConst = { type: "text"; value: string };
type NullConst = { type: "null"; value: null };

export type ActionDef =
  | CreateOneAction
  | UpdateOneAction
  | DeleteOneAction
  | ExecuteHookAction
  | FetchOneAction;

export type CreateOneAction = {
  kind: "create-one";
  alias: string;
  model: string;
  targetPath: string[];
  changeset: ChangesetDef;
  select: SelectDef;
  isPrimary: boolean;
};

export type UpdateOneAction = {
  kind: "update-one";
  alias: string;
  model: string;
  targetPath: string[];
  filter: TypedExprDef;
  changeset: ChangesetDef;
  select: SelectDef;
  isPrimary: boolean;
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

export type ExecuteHookAction = {
  kind: "execute-hook";
  changeset: ChangesetDef;
  hook: ActionHookDef;
  responds: boolean;
};

export type FetchOneAction = {
  kind: "fetch-one";
  alias: string;
  model: string;
  changeset: ChangesetDef;
  query: QueryDef;
};

export type ActionHookDef = {
  hook: HookCode;
  args: ChangesetDef;
};

export type ChangesetDef = ChangesetOperationDef[];
export type ChangesetOperationDef = { name: string; setter: FieldSetter };

export type FieldSetterReferenceValue = {
  kind: "reference-value";
  target: { alias: string; access: string[] };
};

export type FieldSetterInput = {
  kind: "fieldset-input";
  type: FieldType;
  fieldsetAccess: string[];
  required: boolean;
  // FIXME implement default
  // default?: LiteralValueDef | FieldSetterReferenceValue;
};

export type FieldSetterVirtualInput = {
  kind: "fieldset-virtual-input";
  type: FieldType;
  fieldsetAccess: string[];
  required: boolean;
  nullable: boolean;
  validators: ValidatorDef[];
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
  target: TargetDef;
  actions: ActionDef[];
  populates: PopulateDef[];
  repeater: RepeaterDef;
};

export type RepeaterDef = { alias?: string; start: number; end: number };

export type FieldSetterChangesetReference = {
  kind: "changeset-reference";
  referenceName: string;
};

export type FieldSetterHttpHandler = {
  kind: "request-auth-token";
  access: string[];
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
  hook: HookCode;
  args: ChangesetDef;
};

export type FieldSetterQuery = {
  kind: "query";
  query: QueryDef;
};

export type FieldSetter =
  // TODO add composite expression setter
  | LiteralValueDef
  | FieldSetterReferenceValue
  | FieldSetterInput
  | FieldSetterVirtualInput
  | FieldSetterReferenceInput
  | FieldSetterChangesetReference
  | FieldSetterHook
  | FieldSetterHttpHandler
  | FieldSetterFunction
  | FieldSetterContextReference
  | FieldSetterQuery;

export type ExecutionRuntimeDef = {
  name: string;
  type: RuntimeEngineType;
  sourcePath: string;
};

export type RuntimeEngineType = "node";

// ---------- authenticator

export type AuthenticatorDef = {
  name: string;
  authUserModel: AuthenticatorNamedModelDef;
  accessTokenModel: AuthenticatorNamedModelDef;
  method: AuthenticatorMethodDef;
};

export type AuthenticatorNamedModelDef = {
  name: string;
  refKey: string;
};

export type AuthenticatorMethodDef = AuthenticatorBasicMethodDef;

export type AuthenticatorBasicMethodDef = {
  kind: "basic";
};

// ----- Generators

export type GeneratorDef = GeneratorClientDef;

export type GeneratorClientTarget = "js";

export type GeneratorClientDef = {
  kind: "generator-client";
  target: GeneratorClientTarget;
  output?: string;
};
