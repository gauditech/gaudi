import { FieldType, TypeCardinality } from "@src/compiler/ast/type";
import { HookCode } from "@src/types/common";
import {
  BooleanLiteral,
  FloatLiteral,
  IntegerLiteral,
  Literal,
  StringLiteral,
} from "@src/types/specification";

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

export type FieldDef = {
  kind: "field";
  refKey: string;
  modelRefKey: string;
  name: string;
  dbname: string;
  type: FieldType;
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
  onDelete?: ReferenceOnDeleteAction;
};
export type ReferenceOnDeleteAction = "setNull" | "cascade";

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
  retCardinality: TypeCardinality;
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
  kind: FieldType | "null";
  nullable: boolean;
};

type VariableCollectionType = {
  kind: "collection";
  type: VariablePrimitiveType;
};

type TypedVariableType = VariablePrimitiveType | VariableCollectionType;

export type LiteralValueDef = { kind: "literal"; literal: Literal };

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

export type InCollectionFunctionName = "in" | "not in";

export type TypedFunction = {
  kind: "function";
  name: FunctionName;
  args: TypedExprDef[];
  type?: TypedVariableType;
};

export type TypedExprDef =
  | LiteralValueDef
  | TypedArray
  | TypedAlias
  | TypedVariable
  | TypedFunction
  | TypedAggregateFunction
  | TypedExistsSubquery
  | undefined;

type TypedArray = {
  kind: "array";
  elements: TypedExprDef[];
  type: VariableCollectionType;
};

type TypedAggregateFunction = {
  kind: "aggregate-function";
  fnName: FunctionName | AggregateFunctionName;
  type: VariablePrimitiveType;
  sourcePath: string[];
  targetPath: string[];
};

type TypedExistsSubquery = {
  kind: "in-subquery";
  fnName: InCollectionFunctionName;
  lookupExpression: TypedExprDef;
  sourcePath: string[];
  targetPath: string[];
};

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
    | { name: string; refKey: string; type: "string" | "integer"; paramName: string }
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
  inputType: FieldType;
  args: Literal[];
};

export type FieldsetFieldDef = {
  kind: "field";
  type: FieldType;
  nullable: boolean;
  required: boolean;
  validators: ValidatorDef[];
};

export type ValidatorDef =
  | MinLengthStringValidator
  | MaxLengthStringValidator
  | EmailStringValidator
  | MinIntValidator
  | MaxIntValidator
  | MinFloatValidator
  | MaxFloatValidator
  | IsBooleanEqual
  | IsIntEqual
  | IsFloatEqual
  | IsStringEqual
  | HookValidator
  | NoReferenceValidator;

export const ValidatorDefinition = [
  ["string", "max", "maxLength", ["integer"]],
  ["string", "min", "minLength", ["integer"]],
  ["string", "isEmail", "isEmail", []],
  ["integer", "min", "minInt", ["integer"]],
  ["integer", "max", "maxInt", ["integer"]],
  ["float", "min", "minFloat", ["float"]],
  ["float", "max", "maxFloat", ["float"]],
  ["boolean", "isEqual", "isBoolEqual", ["boolean"]],
  ["integer", "isEqual", "isIntEqual", ["integer"]],
  ["float", "isEqual", "isFloatEqual", ["float"]],
  ["string", "isEqual", "isStringEqual", ["string"]],
] as const;

export interface MinLengthStringValidator extends IValidatorDef {
  name: "minLength";
  inputType: "string";
  args: [IntegerLiteral];
}

export interface MaxLengthStringValidator extends IValidatorDef {
  name: "maxLength";
  inputType: "string";
  args: [IntegerLiteral];
}

export interface EmailStringValidator extends IValidatorDef {
  name: "isEmail";
  inputType: "string";
  args: [];
}

export interface MinIntValidator extends IValidatorDef {
  name: "minInt";
  inputType: "integer";
  args: [IntegerLiteral];
}

export interface MaxIntValidator extends IValidatorDef {
  name: "maxInt";
  inputType: "integer";
  args: [IntegerLiteral];
}

export interface MinFloatValidator extends IValidatorDef {
  name: "minFloat";
  inputType: "float";
  args: [FloatLiteral];
}

export interface MaxFloatValidator extends IValidatorDef {
  name: "maxFloat";
  inputType: "float";
  args: [FloatLiteral];
}

export interface IsBooleanEqual extends IValidatorDef {
  name: "isBoolEqual";
  inputType: "boolean";
  args: [BooleanLiteral];
}
export interface IsIntEqual extends IValidatorDef {
  name: "isIntEqual";
  inputType: "integer";
  args: [IntegerLiteral];
}
export interface IsFloatEqual extends IValidatorDef {
  name: "isFloatEqual";
  inputType: "float";
  args: [FloatLiteral];
}
export interface IsStringEqual extends IValidatorDef {
  name: "isStringEqual";
  inputType: "string";
  args: [StringLiteral];
}

export interface HookValidator {
  name: "hook";
  arg?: string;
  hook: HookCode;
}
export interface NoReferenceValidator {
  name: "noReference";
}

export type ActionDef =
  | CreateOneAction
  | UpdateOneAction
  | DeleteOneAction
  | ExecuteHookAction
  | FetchAction;

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

export type FetchAction = {
  kind: "fetch";
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

export type FieldSetterArray = {
  kind: "array";
  elements: FieldSetter[];
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
  | FieldSetterQuery
  | FieldSetterArray;

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
