import { BinaryOperator, LiteralValue, UnaryOperator } from "./ast";

import { WithContext } from "@src/common/error";

export type Specification = {
  models: ModelSpec[];
};

export type ModelSpec = WithContext<{
  name: string;
  fields: FieldSpec[];
  references: ReferenceSpec[];
  relations: RelationSpec[];
  queries: QuerySpec[];
}>;

export type FieldSpec = WithContext<{
  name: string;
  type: string;
  default?: LiteralValue;
  unique?: boolean;
  nullable?: boolean;
}>;

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
  fromModel: string;
  filter?: ExpSpec;
}>;

export type ExpSpec = WithContext<
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: ExpSpec;
      rhs: ExpSpec;
    }
  | { kind: "unary"; operator: UnaryOperator; exp: ExpSpec }
  | { kind: "identifier"; name: string }
  | { kind: "literal"; value: LiteralValue }
>;
