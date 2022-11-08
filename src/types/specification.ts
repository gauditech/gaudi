import { BinaryOperator, EndpointType, LiteralValue, SelectAST, UnaryOperator } from "./ast";

import { WithContext } from "@src/common/error";

export type Specification = {
  models: ModelSpec[];
  entrypoints: EntrypointSpec[];
};

export type ModelSpec = WithContext<{
  name: string;
  alias?: string;
  fields: FieldSpec[];
  references: ReferenceSpec[];
  relations: RelationSpec[];
  queries: QuerySpec[];
  computeds: ComputedSpec[];
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
  { kind: "custom"; hook: HookSpec } | { kind: "builtin"; name: string; args: LiteralValue[] }
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
  target: { kind: "model" | "relation"; identifier: string };
  identify?: string;
  alias?: string;
  response?: SelectAST;
  endpoints: EndpointSpec[];
  entrypoints: EntrypointSpec[];
}>;

export type EndpointSpec = WithContext<{
  type: EndpointType;
  action?: ActionSpec[];
}>;

export type ActionSpec = WithContext<{
  kind: "create" | "update";
  target: string;
  actionAtoms: ActionAtomSpec[];
}>;

export type ActionAtomSpec = WithContext<
  | {
      kind: "set";
      target: string;
      set: { kind: "value"; value: LiteralValue } | { kind: "reference"; reference: string };
    }
  | { kind: "reference"; target: string; through: string }
>;

export type HookSpec = WithContext<{
  name: string;
  args: { name: string }[];
  returnType: string;
  inlineBody: string | undefined;
  source: string | undefined;
}>;
