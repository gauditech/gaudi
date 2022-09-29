import { WithContext } from "@src/common/error";

export type AST = {
  models: ModelAST[];
};

export type ModelAST = WithContext<{
  name: string;
  body: ModelBodyAST[];
}>;

export type ModelBodyAST = FieldAST | ReferenceAST | RelationAST | QueryAST | ComputedAST;

export type FieldAST = WithContext<{
  kind: "field";
  name: string;
  body: FieldBodyAST[];
}>;

export type FieldBodyAST = WithContext<
  | { kind: "type"; type: string }
  | { kind: "default"; default: LiteralValue }
  | { kind: "tag"; tag: FieldTag }
>;

export type FieldTag = "nullable" | "unique";

export type ReferenceAST = WithContext<{
  kind: "reference";
  name: string;
  body: ReferenceBodyAST[];
}>;

export type ReferenceBodyAST = WithContext<
  { kind: "to"; to: string } | { kind: "tag"; tag: ReferenceTag }
>;

export type ReferenceTag = "nullable" | "unique";

export type RelationAST = WithContext<{
  kind: "relation";
  name: string;
  body: RelationBodyAST[];
}>;

export type RelationBodyAST = WithContext<
  { kind: "from"; from: string } | { kind: "through"; through: string }
>;

export type QueryAST = WithContext<{
  kind: "query";
  name: string;
  body: QueryBodyAST[];
}>;

export type QueryBodyAST = WithContext<
  | { kind: "from"; from: string[] }
  | { kind: "filter"; filter: ExpAST }
  | { kind: "orderBy"; orderings: QueryOrderAST[] }
  | { kind: "limit"; limit: number }
>;

export type QueryOrderAST = WithContext<{ field: string[]; order?: "asc" | "desc" }>;

export type ComputedAST = WithContext<{ kind: "computed"; name: string; exp: ExpAST }>;

export type ExpAST = WithContext<
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: ExpAST;
      rhs: ExpAST;
    }
  | { kind: "paren"; exp: ExpAST }
  | { kind: "unary"; operator: UnaryOperator; exp: ExpAST }
  | { kind: "identifier"; identifier: string[] }
  | { kind: "literal"; literal: LiteralValue }
>;

export type Entrypoint = WithContext<{
  name: string;
  body: EntrypointBody[];
}>;

export type EntrypointBody = WithContext<
  | { kind: "target"; identifier: string }
  | { kind: "identify"; identifier: string }
  | { kind: "alias"; identifier: string }
  | { kind: "response"; select: string[] }
  | { kind: "endpoint"; endpoint: Endpoint }
  | { kind: "entrypoint"; entrypoint: Entrypoint }
>;

export type Endpoint = WithContext<{
  type: EndpointType;
  body: EndpointBody;
}>;

export type EndpointType = "list" | "get" | "create" | "update" | "delete";

export type EndpointBody = WithContext<{ kind: "action" }>;

export type LiteralValue = null | boolean | number | string;

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
  | ">=";

export type UnaryOperator = "not";
