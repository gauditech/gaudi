import {
  Ref,
  RefModel,
  RefModelAtom,
  RefModelField,
  RefModelReference,
  RefModelRelation,
  RefTarget,
} from "@src/compiler/ast/ast";
import { Type, TypeCardinality } from "@src/compiler/ast/type";
import { HookCode } from "@src/types/common";

export type LiteralValue = null | boolean | number | string;

export type Select = SingleSelect[];
export type SingleSelect = { name: string; expr: Expr } & (
  | { kind: "final" }
  | { kind: "nested"; select: Select }
);

export type IdentifierRef<R extends Ref = Ref> = {
  readonly text: string;
  readonly ref: R;
  readonly type: Type;
};

export type Specification = {
  models: Model[];
  apis: Api[];
  populators: Populator[];
  runtimes: ExecutionRuntime[];
  authenticator: Authenticator | undefined;
  generators: Generator[];
};

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
  name: string;
  ref: RefModelField;
  type: Type;
  primary: boolean;
  default?: LiteralValue;
  validators: Validator[];
};

export type Validator =
  | { kind: "hook"; hook: FieldValidatorHook }
  | { kind: "builtin"; name: string; args: LiteralValue[] };

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
  name: string;
  sourceModel: string;
  targetModel: string;
  cardinality: TypeCardinality;
  from: IdentifierRef[];
  fromAlias?: IdentifierRef[];
  filter?: Expr;
  orderBy?: QueryOrderBy[];
  limit?: number;
  offset?: number;
  select: Select;
  aggregate?: string;
};

export type QueryOrderBy = { expr: Expr; order?: "asc" | "desc" };

export type Computed = {
  name: string;
  ref: RefModelAtom;
  expr: Expr;
};

export type Expr = { type: Type } & (
  | { kind: "identifier"; identifier: IdentifierRef[] }
  | { kind: "literal"; literal: LiteralValue }
  | { kind: "array"; elements: Expr[] }
  | { kind: "function"; name: string; args: Expr[] }
);

export type Api = {
  name?: string;
  entrypoints: Entrypoint[];
};

export type Entrypoint<c extends TypeCardinality = TypeCardinality> = {
  name: string;
  model: string;
  cardinality: c;
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation>;
  alias: IdentifierRef<RefTarget>;
  identifyThrough: c extends "collection" ? IdentifierRef<RefModelField> : undefined;
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
  actions: Action[];
  authorize?: Expr;
  response: Select;
  pageable: boolean;
  orderBy?: QueryOrderBy[];
  filter?: Expr;
};

export type EndpointGet = {
  kind: "get";
  actions: Action[];
  authorize?: Expr;
  response: Select;
};

export type EndpointCreateUpdate = {
  kind: "create" | "update";
  actions: Action[];
  authorize?: Expr;
  response: Select;
};

export type EndpointDelete = {
  kind: "delete";
  actions: Action[];
  authorize?: Expr;
};

export type EndpointCardinality = "one" | "many";
export type EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type EndpointCustom = {
  kind: "custom";
  actions: Action[];
  authorize?: Expr;
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
      atoms: ActionAtomVirtualInput[];
    }
  | {
      kind: "fetch";
      alias: string;
      query: Query;
      atoms: ActionAtomVirtualInput[];
    };

export type ModelAction = Extract<Action, { kind: "create" | "update" }>;

export type ModelActionAtom =
  | ActionAtomInput
  | ActionAtomSet
  | ActionAtomRefThrough
  | ActionAtomVirtualInput;

export type ActionAtomSetHook = { kind: "hook"; hook: ActionHook };
export type ActionAtomSetExp = { kind: "expression"; expr: Expr };
export type ActionAtomSetQuery = { kind: "query"; query: Query };

export type ActionAtomInput = {
  kind: "input";
  target: IdentifierRef<RefModelField>;
  optional: boolean;
  default?:
    | { kind: "literal"; value: LiteralValue }
    | { kind: "reference"; reference: IdentifierRef[] };
};
export type ActionAtomSet = {
  kind: "set";
  target: IdentifierRef<RefModelField>;
  set: ActionAtomSetHook | ActionAtomSetExp;
};
export type ActionAtomRefThrough = {
  kind: "reference";
  target: IdentifierRef<RefModelReference>;
  through: IdentifierRef<RefModelField>;
};
export type ActionAtomVirtualInput = {
  kind: "virtual-input";
  name: string;
  type: string;
  nullable: boolean;
  optional: boolean;
  validators: Validator[];
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
  alias: IdentifierRef<RefTarget>;
  setters: ActionAtomSet[];
  populates: Populate[];
  repeater?: Repeater;
};

export type FieldValidatorHook = {
  arg?: string;
  code: HookCode;
};

export type ModelHook = {
  name: string;
  ref: RefModelAtom;
  args: { name: string; query: Query }[];
  code: HookCode;
};

export type ActionHook = {
  args: (
    | { kind: "expression"; name: string; expr: Expr }
    | { kind: "query"; name: string; query: Query }
  )[];
  code: HookCode;
};

// ----- Execution Runtime

export type ExecutionRuntime = {
  name: string;
  sourcePath: string;
};

// ---------- authenticator

export type Authenticator = {
  name?: string;
  authUserModelName: string;
  accessTokenModelName: string;
  method: AuthenticatorMethod;
};

export type AuthenticatorMethod = AuthenticatorBasicMethod;

export type AuthenticatorBasicMethod = {
  kind: "basic";
};

// ----- Generators

export type Generator = {
  kind: "generator-client";
  target: string;
  output?: string;
};
