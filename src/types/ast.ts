import { WithContext } from "@src/common/error";

export type AST = DefinitionAST[];

export type DefinitionAST = ModelAST | EntrypointAST;

export type ModelAST = WithContext<{
  kind: "model";
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

export type EntrypointAST = WithContext<{
  kind: "entrypoint";
  name: string;
  body: EntrypointBodyAST[];
}>;

export type EntrypointBodyAST = WithContext<
  | { kind: "targetModel"; identifier: string }
  | { kind: "targetRelation"; identifier: string }
  | { kind: "identify"; identifier: string }
  | { kind: "alias"; identifier: string }
  | { kind: "response"; select: string[] }
  | { kind: "endpoint"; endpoint: EndpointAST }
  | { kind: "entrypoint"; entrypoint: EntrypointAST }
>;

export type EndpointAST = WithContext<{
  type: EndpointType;
  body: EndpointBodyAST[];
}>;

export type EndpointType = "list" | "get" | "create" | "update" | "delete";

export type EndpointBodyAST = WithContext<{ kind: "action"; body: ActionBodyAST[] }>;

export type ActionBodyAST = WithContext<{
  kind: "create" | "update";
  target: string;
  body: ActionAtomBodyAST[];
}>;

export type ActionAtomBodyAST = WithContext<
  | { kind: "set"; target: string; value: LiteralValue }
  | { kind: "reference"; target: string; through: string }
>;

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
