import { BinaryOperator, EndpointType, LiteralValue, SelectAST, UnaryOperator } from "./ast";

import { WithContext } from "@src/common/error";

export type Specification = {
  models: ModelSpec[];
  entrypoints: EntrypointSpec[];
  populators: PopulatorSpec[];
};

export type ModelSpec = WithContext<{
  name: string;
  alias?: string;
  fields: FieldSpec[];
  references: ReferenceSpec[];
  relations: RelationSpec[];
  queries: QuerySpec[];
  computeds: ComputedSpec[];
  hooks: ModelHookSpec[];
}>;

export type FieldSpec = WithContext<{
  name: string;
  type: string;
  default?: LiteralValue;
  unique?: boolean;
  nullable?: boolean;
  validators?: ValidatorSpec[];
}>;

export type ValidatorSpec = WithContext<
  | { kind: "hook"; hook: FieldValidatorHookSpec }
  | { kind: "builtin"; name: string; args: LiteralValue[] }
>;
export type ReferenceSpec = WithContext<{
  name: string;
  toModel: string;
  unique?: boolean;
  nullable?: boolean;
}>;

export type RelationSpec = WithContext<{
  name: string;
  fromModel: string;
  through: string;
}>;

export type QuerySpec = WithContext<{
  name: string;
  fromModel: string[];
  fromAlias?: string[];
  filter?: ExpSpec;
  orderBy?: { field: string[]; order?: "asc" | "desc" }[];
  limit?: number;
  select?: SelectAST;
}>;

export type ComputedSpec = WithContext<{
  name: string;
  exp: ExpSpec;
}>;

export type ExpSpec = WithContext<
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: ExpSpec;
      rhs: ExpSpec;
    }
  | { kind: "unary"; operator: UnaryOperator; exp: ExpSpec }
  | { kind: "identifier"; identifier: string[] }
  | { kind: "literal"; literal: LiteralValue }
>;

export type EntrypointSpec = WithContext<{
  name: string;
  target: { kind: "model" | "relation"; identifier: string; alias?: string };
  identify?: string;
  response?: SelectAST;
  endpoints: EndpointSpec[];
  entrypoints: EntrypointSpec[];
}>;

export type EndpointSpec = WithContext<{
  type: EndpointType;
  action?: ActionSpec[];
}>;

export type ActionSpec = WithContext<{
  kind: "create" | "update" | "delete";
  targetPath: string[] | undefined;
  alias: string | undefined;
  actionAtoms: ActionAtomSpec[];
}>;

export type ActionAtomSpec = WithContext<
  | ActionAtomSpecSet
  | ActionAtomSpecRefThrough
  | ActionAtomSpecAction
  | ActionAtomSpecDeny
  | ActionAtomSpecInput
>;

export type HookCode =
  | { kind: "inline"; inline: string }
  | { kind: "source"; target: string; file: string };

export type ActionAtomSpecSet = {
  kind: "set";
  target: string;
  set:
    | { kind: "hook"; hook: ActionHookSpec }
    | { kind: "literal"; value: LiteralValue }
    | { kind: "reference"; reference: string[] };
};
export type ActionAtomSpecAction = { kind: "action"; body: ActionSpec };
export type ActionAtomSpecRefThrough = { kind: "reference"; target: string; through: string };
export type ActionAtomSpecDeny = { kind: "deny"; fields: "*" | string[] };
export type ActionAtomSpecInput = { kind: "input"; fields: InputFieldSpec[] };
export type InputFieldSpec = {
  name: string;
  optional: boolean;
  default?: { kind: "literal"; value: LiteralValue } | { kind: "reference"; reference: string[] };
};

export type BaseHookSpec = WithContext<{
  name?: string;
  code: HookCode;
}>;

export type PopulatorSpec = WithContext<{
  name: string;
  populates: PopulateSpec[];
}>;

export type PopulateSpec = WithContext<{
  name: string;
  target: { kind: "model" | "relation"; identifier: string; alias?: string };
  identify?: string;
  repeat?: PopulateRepeatSpec;
  setters: PopulateSetterSpec[];
  populates: PopulateSpec[];
}>;

export type PopulateRepeatSpec = WithContext<
  | { kind: "fixed"; alias?: string; value: number }
  | { kind: "range"; alias?: string; range: { min?: number; max?: number } }
>;

export type PopulateSetterSpec = WithContext<{
  kind: "set";
  target: string;
  set: { kind: "literal"; value: LiteralValue } | { kind: "reference"; reference: string };
}>;

export type FieldValidatorHookSpec = BaseHookSpec & {
  arg?: string;
};

export type ModelHookSpec = BaseHookSpec & {
  name: string;
  args: { name: string; query: QuerySpec }[];
};

export type ActionHookSpec = BaseHookSpec & {
  args: Record<
    string,
    { kind: "literal"; value: LiteralValue } | { kind: "reference"; reference: string[] }
  >;
};
