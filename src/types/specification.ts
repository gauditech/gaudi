// old AST types
export type EndpointCardinality = "one" | "many";
export type EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type EndpointTypeAST = "list" | "get" | "create" | "update" | "delete" | "custom";

export type LiteralValue = null | boolean | number | string;

export type SelectAST = {
  select?: Record<string, SelectAST>;
};

export type UnaryOperator = "not";
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

export type Specification = {
  models: ModelSpec[];
  entrypoints: EntrypointSpec[];
  populators: PopulatorSpec[];
  runtimes: ExecutionRuntimeSpec[];
  authenticator: AuthenticatorSpec | undefined;
  generators: GeneratorSpec[];
};

export type ModelSpec = {
  name: string;
  alias?: string;
  fields: FieldSpec[];
  references: ReferenceSpec[];
  relations: RelationSpec[];
  queries: QuerySpec[];
  computeds: ComputedSpec[];
  hooks: ModelHookSpec[];
};

export type FieldSpec = {
  name: string;
  type: string;
  default?: LiteralValue;
  unique?: boolean;
  nullable?: boolean;
  validators?: ValidatorSpec[];
};

export type ValidatorSpec =
  | { kind: "hook"; hook: FieldValidatorHookSpec }
  | { kind: "builtin"; name: string; args: LiteralValue[] };
export type ReferenceSpec = {
  name: string;
  toModel: string;
  unique?: boolean;
  nullable?: boolean;
};

export type RelationSpec = {
  name: string;
  fromModel: string;
  through: string;
};

export type QuerySpec = {
  name: string;
  fromModel: string[];
  fromAlias?: string[];
  filter?: ExpSpec;
  orderBy?: { field: string[]; order?: "asc" | "desc" }[];
  limit?: ExpSpec;
  offset?: ExpSpec;
  select?: SelectAST;
  aggregate?: {
    name: string;
  };
};

export type ComputedSpec = {
  name: string;
  exp: ExpSpec;
};

export type ExpSpec =
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: ExpSpec;
      rhs: ExpSpec;
    }
  | { kind: "unary"; operator: UnaryOperator; exp: ExpSpec }
  | { kind: "identifier"; identifier: string[] }
  | { kind: "literal"; literal: LiteralValue }
  | { kind: "function"; name: string; args: ExpSpec[] };

export type EntrypointSpec = {
  name: string;
  target: { kind: "model" | "relation"; identifier: string; alias?: string };
  identify?: string;
  response?: SelectAST;
  authorize?: ExpSpec;
  endpoints: EndpointSpec[];
  entrypoints: EntrypointSpec[];
};

export type EndpointSpec = {
  type: EndpointTypeAST;
  actions?: ActionSpec[];
  authorize?: ExpSpec;
  cardinality?: EndpointCardinality;
  method?: EndpointMethod;
  path?: string;
  pageable: boolean;
};

export type ActionSpec =
  | {
      kind: "create" | "update";
      targetPath: string[] | undefined;
      alias: string | undefined;
      actionAtoms: ModelActionAtomSpec[];
    }
  | {
      kind: "delete";
      targetPath: string[] | undefined;
    }
  | {
      kind: "execute";
      alias: string | undefined;
      hook: ActionHookSpec;
      responds: boolean;
      atoms: ActionAtomSpecVirtualInput[];
    }
  | {
      kind: "fetch";
      alias: string | undefined;
      query: QuerySpec;
      atoms: ActionAtomSpecVirtualInput[];
    };

export type ModelActionSpec = Extract<ActionSpec, { kind: "create" | "update" }>;

export type ModelActionAtomSpec =
  | ActionAtomSpecSet
  | ActionAtomSpecRefThrough
  | ActionAtomSpecDeny
  | ActionAtomSpecVirtualInput
  | ActionAtomSpecInputList;

export type HookCodeSpec =
  | { kind: "inline"; inline: string }
  | { kind: "source"; target: string; file: string };

export type ActionAtomSpecSetHook = { kind: "hook"; hook: ActionHookSpec };
export type ActionAtomSpecSetExp = { kind: "expression"; exp: ExpSpec };
export type ActionAtomSpecSetQuery = { kind: "query"; query: QuerySpec };

export type ActionAtomSpecSet = {
  kind: "set";
  target: string;
  set: ActionAtomSpecSetHook | ActionAtomSpecSetExp | ActionAtomSpecSetQuery;
};
export type ActionAtomSpecHook = { kind: "hook"; hook: ActionHookSpec };
export type ActionAtomSpecRefThrough = { kind: "reference"; target: string; through: string };
export type ActionAtomSpecDeny = { kind: "deny"; fields: "*" | string[] };
export type ActionAtomSpecVirtualInput = {
  kind: "virtual-input";
  name: string;
  type: string;
  nullable: boolean;
  optional: boolean;
  validators: ValidatorSpec[];
};
export type ActionAtomSpecInput = { kind: "input"; fieldSpec: InputFieldSpec };
export type ActionAtomSpecInputList = { kind: "input-list"; fields: InputFieldSpec[] };
export type InputFieldSpec = {
  name: string;
  optional: boolean;
  default?: { kind: "literal"; value: LiteralValue } | { kind: "reference"; reference: string[] };
};
export type ActionAtomSpecResponds = { kind: "responds" };
export type ActionAtomSpecQuery = { kind: "query"; query: QuerySpec };

export type HookSpec = {
  name?: string;
  runtimeName?: string;
  code: HookCodeSpec;
};

export type RepeaterSpec =
  | { kind: "fixed"; alias?: string; value: number }
  | { kind: "range"; alias?: string; range: { start?: number; end?: number } };

export type PopulatorSpec = {
  name: string;
  populates: PopulateSpec[];
};

export type PopulateSpec = {
  name: string;
  target: { kind: "model" | "relation"; identifier: string; alias?: string };
  identify?: string;
  setters: PopulateSetterSpec[];
  populates: PopulateSpec[];
  repeater?: RepeaterSpec;
};

export type PopulateSetterSpec = {
  kind: "set";
  target: string;
  set: { kind: "hook"; hook: ActionHookSpec } | { kind: "expression"; exp: ExpSpec };
};

export type FieldValidatorHookSpec = HookSpec & {
  arg?: string;
};

export type ModelHookSpec = HookSpec & {
  name: string;
  args: { name: string; query: QuerySpec }[];
};

export type ActionHookSpec = HookSpec & {
  args: Record<string, { kind: "expression"; exp: ExpSpec } | { kind: "query"; query: QuerySpec }>;
};

// ----- Execution Runtime

export type ExecutionRuntimeSpec = {
  name: string;
  default?: boolean;
  sourcePath: string;
};

// ---------- authenticator

export const AUTH_TARGET_MODEL_NAME = "AuthUser";

export type AuthenticatorSpec = {
  name?: string;
  authUserModelName: string;
  accessTokenModelName: string;
  method: AuthenticatorMethodSpec;
};

export type AuthenticatorMethodSpec = AuthenticatorBasicMethodSpec;

export type AuthenticatorBasicMethodSpec = {
  kind: "basic";
};

// ----- Generators

export type GeneratorSpec = {
  kind: "generator-client";
  target: string;
  api: string;
  output?: string;
};
