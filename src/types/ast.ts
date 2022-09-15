export type AST = {
  models: ModelAST[];
};

export type ModelAST = {
  name: string;
  body: ModelBodyAST[];
};

export type ModelBodyAST = FieldAST | ReferenceAST | RelationAST | QueryAST;

export type FieldAST = {
  kind: "field";
  name: string;
  body: FieldBodyAST[];
};

export type FieldBodyAST = { type: string } | { default: LiteralValue } | "nullable" | "unique";

export type ReferenceAST = {
  kind: "reference";
  name: string;
  body: ReferenceBodyAST[];
};

export type ReferenceBodyAST = { to: string } | "nullable" | "unique";

export type RelationAST = {
  kind: "relation";
  name: string;
  body: RelationBodyAST[];
};

export type RelationBodyAST = { from: string } | { through: string };

export type QueryAST = {
  kind: "query";
  name: string;
  body: QueryBodyAST[];
};

export type QueryBodyAST = { from: string } | { filter: ExpAST };

export type ExpAST =
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: ExpAST;
      rhs: ExpAST;
    }
  | { kind: "paren"; exp: ExpAST }
  | { kind: "unary"; operator: UnaryOperator; exp: ExpAST }
  | { kind: "identifier"; name: string }
  | { kind: "literal"; value: LiteralValue };

export type LiteralValue = null | boolean | number | string;

export type BinaryOperator = "or" | "and" | "==" | "!=" | "in" | "<" | "<=" | ">" | ">=";

export type UnaryOperator = "!";
