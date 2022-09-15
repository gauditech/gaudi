import { BinaryOperator, UnaryOperator } from "./ast";

export type Specification = {
  models: ModelSpec[];
};

export type ModelSpec = {
  name: string;
  fields: FieldSpec[];
  references: ReferenceSpec[];
  relations: RelationSpec[];
  queries: QuerySpec[];
};

export type FieldSpec = {
  name: string;
  type: string;
  default?: unknown;
  unique?: boolean;
  nullable?: boolean;
};

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
  fromModel: string;
  filter?: ExpSpec;
};

export type ExpSpec =
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: ExpSpec;
      rhs: ExpSpec;
    }
  | { kind: "paren"; exp: ExpSpec }
  | { kind: "unary"; operator: UnaryOperator; exp: ExpSpec };
