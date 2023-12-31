import {
  Ref,
  RefEntrypoint,
  RefModel,
  RefModelAtom,
  RefModelField,
  RefModelReference,
  RefModelRelation,
  RefPopulate,
} from "@compiler/compiler/ast/ast";
import { FieldType, Type, TypeCardinality } from "@compiler/compiler/ast/type";
import { HookCode } from "@compiler/types/common";

export type Literal = IntegerLiteral | FloatLiteral | BooleanLiteral | NullLiteral | StringLiteral;
export type IntegerLiteral = { kind: "integer"; value: number };
export type FloatLiteral = { kind: "float"; value: number };
export type BooleanLiteral = { kind: "boolean"; value: boolean };
export type NullLiteral = { kind: "null"; value: null };
export type StringLiteral = { kind: "string"; value: string };

export type Select = SingleSelect[];
export type SingleSelect = { name: string; expr: Expr<"db"> } & (
  | { kind: "final" }
  | { kind: "nested"; select: Select }
);

export type IdentifierRef<R extends Ref = Ref> = {
  readonly text: string;
  readonly ref: R;
  readonly type: Type;
};

export type Specification = {
  validators: Validator[];
  models: Model[];
  apis: Api[];
  populators: Populator[];
  runtimes: ExecutionRuntime[];
  authenticator: Authenticator | undefined;
  generators: Generator[];
};

export type Validator = {
  name: string;
  args: { name: string; type: FieldType }[];
  assert: Expr<"code">;
  error: { code: string };
};

export type ValidateExpr =
  | { kind: "and" | "or"; exprs: ValidateExpr[] }
  | { kind: "call"; validator: string; args: Expr<"code">[] };

export type Model = {
  name: string;
  fields: Field[];
  references: Reference[];
  relations: Relation[];
  queries: Query[];
  computeds: Computed[];
  hooks: ModelHook[];
};

export type Field = {
  ref: RefModelField;
  primary: boolean;
  default?: Expr<"code">;
  validate?: ValidateExpr;
};

export type Reference = {
  name: string;
  ref: RefModelReference;
  to: RefModel;
  unique: boolean;
  nullable: boolean;
  onDelete?: ReferenceOnDeleteAction;
};
export type ReferenceOnDeleteAction = "setNull" | "cascade";

export type Relation = {
  name: string;
  ref: RefModelRelation;
  through: RefModelReference;
  unique: boolean;
};

export type Query = {
  name?: string;
  sourceModel: string;
  targetModel: string;
  cardinality: TypeCardinality;
  from: IdentifierRef[];
  fromAlias?: IdentifierRef[];
  filter?: Expr<"db">;
  orderBy?: QueryOrderBy[];
  limit?: number;
  offset?: number;
  aggregate?: string;
  select?: Select;
};

export type QueryOrderBy = { expr: Expr<"db">; order?: "asc" | "desc" };

export type Computed = {
  name: string;
  ref: RefModelAtom;
  expr: Expr<"db">;
};

export type Expr<kind extends "db" | "code"> =
  | ({ type: Type } & (
      | { kind: "identifier"; identifier: IdentifierRef[] }
      | { kind: "literal"; literal: Literal }
      | { kind: "array"; elements: Expr<kind>[] }
      | { kind: "function"; name: string; args: Expr<kind>[] }
    ))
  | (kind extends "code" ? { kind: "hook"; hook: ActionHook; type: Type } : never);

export type Api = {
  name?: string;
  entrypoints: Entrypoint[];
};

export type Entrypoint<c extends TypeCardinality = TypeCardinality> = {
  name: string;
  model: string;
  cardinality: c;
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation>;
  alias: IdentifierRef<RefEntrypoint>;
  identifyThrough: c extends "collection" ? IdentifierRef<RefModelAtom>[] : undefined;
  endpoints: Endpoint[];
  entrypoints: Entrypoint[];
};

export type Endpoint =
  | EndpointList
  | EndpointGet
  | EndpointCreateUpdate
  | EndpointDelete
  | EndpointCustom;

export type EndpointList = {
  kind: "list";
  input: ExtraInput[];
  actions: Action[];
  authorize?: Expr<"code">;
  response: Select;
  pageable: boolean;
  orderBy?: QueryOrderBy[];
  filter?: Expr<"db">;
};

export type EndpointGet = {
  kind: "get";
  input: ExtraInput[];
  actions: Action[];
  authorize?: Expr<"code">;
  response: Select;
};

export type EndpointCreateUpdate = {
  kind: "create" | "update";
  input: ExtraInput[];
  actions: Action[];
  authorize?: Expr<"code">;
  response: Select;
};

export type EndpointDelete = {
  kind: "delete";
  input: ExtraInput[];
  actions: Action[];
  authorize?: Expr<"code">;
};

export type EndpointCardinality = "one" | "many";
export type EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type EndpointCustom = {
  kind: "custom";
  input: ExtraInput[];
  actions: Action[];
  authorize?: Expr<"code">;
  cardinality: EndpointCardinality;
  method: EndpointMethod;
  path: string;
};

export type Action =
  | {
      kind: "create" | "update";
      alias: string;
      targetPath: IdentifierRef[];
      actionAtoms: ModelActionAtom[];
      isPrimary: boolean;
    }
  | {
      kind: "delete";
      targetPath: IdentifierRef[];
    }
  | {
      kind: "execute";
      alias: string;
      hook: ActionHook;
      responds: boolean;
    }
  | {
      kind: "respond";
      body: Expr<"code">;
      httpStatus?: Expr<"code">;
      httpHeaders?: { name: string; value: Expr<"code"> }[];
    }
  | {
      kind: "query";
      alias: string;
      query: Query;
      operation: ActionQueryOperation;
    }
  | {
      kind: "validate";
      key: string;
      validate: ValidateExpr;
    };

export type ActionQueryOperation =
  | { kind: "update"; atoms: ActionAtomSet[] }
  | { kind: "delete" }
  | { kind: "select" };

export type ModelAction = Extract<Action, { kind: "create" | "update" }>;

export type ModelActionAtom = ActionAtomInput | ActionAtomSet | ActionAtomRefThrough;

export type ActionAtomSetQuery = { kind: "query"; query: Query };

export type ActionAtomInput = {
  kind: "input";
  target: RefModelField;
  optional: boolean;
  default?: Expr<"code">;
};
export type ActionAtomSet = {
  kind: "set";
  target: RefModelField;
  expr: Expr<"code">;
};
export type ActionAtomRefThrough = {
  kind: "reference";
  target: RefModelReference;
  through: RefModelAtom[];
};
export type ExtraInput = {
  kind: "extra-input";
  name: string;
  type: FieldType;
  nullable: boolean;
  optional: boolean;
  validate?: ValidateExpr;
};

export type Repeater =
  | { kind: "fixed"; alias?: string; value: number }
  | { kind: "range"; alias?: string; range: { start?: number; end?: number } };

export type Populator = {
  name: string;
  populates: Populate[];
};

export type Populate<c extends TypeCardinality = TypeCardinality> = {
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation>;
  cardinality: c;
  alias: IdentifierRef<RefPopulate>;
  setters: ActionAtomSet[];
  populates: Populate[];
  repeater?: Repeater;
};

export type ValidatorHook = {
  args: { name: string; expr: Expr<"code"> }[];
  code: HookCode;
};

export type ModelHook = {
  name: string;
  ref: RefModelAtom;
  args: { name: string; query: Query }[];
  code: HookCode;
};

export type ActionHook = {
  args: { name: string; expr: Expr<"code"> }[];
  code: HookCode;
};

// ----- Execution Runtime

export type ExecutionRuntime = {
  name: string;
  sourcePath: string;
};

// ---------- authenticator

export type Authenticator = {
  model: IdentifierRef<RefModel>;
};

// ----- Generators

export type Generator =
  | {
      kind: "generator-client";
      target: string;
      output?: string;
    }
  | {
      kind: "generator-apidocs";
      basePath?: string;
    };
