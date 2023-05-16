import {
  Ref,
  RefContext,
  RefModel,
  RefModelAtom,
  RefModelField,
  RefModelQuery,
  RefModelReference,
  RefModelRelation,
} from "@src/compiler/ast/ast";
import { Type } from "@src/compiler/ast/type";
import { HookCode } from "@src/types/common";

export type LiteralValue = null | boolean | number | string;

export type Select = SingleSelect[];
export type SingleSelect = { name: string; target: IdentifierRef<RefModelAtom> } & (
  | { kind: "final" }
  | { kind: "nested"; select: Select }
);

export type IdentifierRef<R extends Ref = Ref> = { text: string; ref: R; type: Type };

export type Specification = {
  models: Model[];
  entrypoints: Entrypoint[];
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
};

export type Relation = {
  name: string;
  ref: RefModelRelation;
  through: RefModelReference;
  unique: boolean;
  nullable: boolean;
};

export type Query = {
  name: string;
  sourceModel: string;
  targetModel: string;
  from: IdentifierRef[];
  fromAlias?: IdentifierRef[];
  filter?: Expr;
  orderBy?: QueryOrderBy[];
  limit?: number;
  offset?: number;
  select: Select;
  aggregate?: string;
};

export type QueryOrderBy = { field: string[]; order?: "asc" | "desc" };

export type Computed = {
  name: string;
  ref: RefModelAtom;
  expr: Expr;
};

export type Expr = { type: Type } & (
  | { kind: "identifier"; identifier: IdentifierRef[] }
  | { kind: "literal"; literal: LiteralValue }
  | { kind: "function"; name: string; args: Expr[] }
);

export type Entrypoint = {
  name: string;
  model: string;
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation | RefModelQuery>;
  alias: IdentifierRef<RefContext>;
  identifyThrough: IdentifierRef<RefModelField>;
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
  set: ActionAtomSetHook | ActionAtomSetExp | ActionAtomSetQuery;
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

export type ActionAtomHook = { kind: "hook"; hook: ActionHook };
export type ActionAtomResponds = { kind: "responds" };
export type ActionAtomQuery = { kind: "query"; query: Query };

export type Repeater =
  | { kind: "fixed"; alias?: string; value: number }
  | { kind: "range"; alias?: string; range: { start?: number; end?: number } };

export type Populator = {
  name: string;
  populates: Populate[];
};

export type Populate = {
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation | RefModelQuery>;
  alias: IdentifierRef<RefContext>;
  setters: PopulateSetter[];
  populates: Populate[];
  repeater?: Repeater;
};

export type PopulateSetter = {
  kind: "set";
  target: IdentifierRef<RefModelField>;
  set: ActionAtomSetHook | ActionAtomSetExp;
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
  api: string;
  output?: string;
};
