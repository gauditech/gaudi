export type Definition = (Model | Entrypoint | Populator)[];
export type Model = WithKeyword<{
  kind: "model";
  name: Identifier;
  atoms: ModelAtom[];
}>;
export type ModelAtom = Field | Reference | Relation | Query | Computed | Hook;
export type Field = WithKeyword<{
  kind: "field";
  name: Identifier;
  atoms: FieldAtom[];
}>;
export type FieldAtom = WithKeyword<
  | { kind: "type"; identifier: Identifier }
  | { kind: "unique" }
  | { kind: "nullable" }
  | { kind: "default"; literal: Literal }
  | { kind: "validate"; validators: Validator[] }
>;
export type Validator = UnnamedHook | { kind: "builtin"; name: Identifier; args: Literal[] };
export type Reference = WithKeyword<{
  kind: "reference";
  name: Identifier;
  atoms: ReferenceAtom[];
}>;
export type ReferenceAtom = WithKeyword<
  { kind: "to"; identifier: Identifier } | { kind: "nullable" } | { kind: "unique" }
>;
export type Relation = WithKeyword<{
  kind: "relation";
  name: Identifier;
  atoms: RelationAtom[];
}>;
export type RelationAtom = WithKeyword<
  { kind: "from"; identifier: Identifier } | { kind: "through"; identifier: Identifier }
>;
export type Query = WithKeyword<{
  kind: "query";
  name: Identifier;
  atoms: QueryAtom[];
}>;
export type QueryAtom = WithKeyword<
  | { kind: "from"; identifier: IdentifierPath }
  | { kind: "filter"; expr: Expr }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "limit"; value: IntegerLiteral }
  | { kind: "offset"; value: IntegerLiteral }
  | { kind: "select"; select: Select }
  | { kind: "aggregate"; aggregate: AggregateType }
>;
export type AggregateType = "count" | "sum";
export type OrderBy = (
  | { identifier: Identifier }
  | WithKeyword<{ identifier: Identifier; order: OrderType }>
)[];
export type OrderType = "count" | "sum";
export type Computed = WithKeyword<{
  kind: "computed";
  name: Identifier;
  expr: Expr;
}>;
export type Entrypoint = WithKeyword<{
  kind: "entrypoint";
  atoms: EntrypointAtom[];
}>;
export type EntrypointAtom =
  | WithKeyword<
      | { kind: "target"; identifier: IdentifierAs }
      | { kind: "identifyWith"; identifier: Identifier }
      | { kind: "response"; select: Select }
      | { kind: "authorize"; expr: Expr }
    >
  | Endpoint
  | Entrypoint;
export type Endpoint = WithKeyword<{
  kind: "endpoint";
  keywordType: TokenData;
  type: EndpointType;
  atoms: EndpointAtom[];
}>;
export type EndpointType = "list" | "get" | "create" | "update" | "delete";
export type EndpointAtom = WithKeyword<
  { kind: "action"; actions: Action[] } | { kind: "authorize"; expr: Expr }
>;
export type Action = WithKeyword<{
  kind: ActionType;
  target?: IdentifierPathAs;
  atoms: ActionAtom[];
}>;
export type ActionType = "create" | "update" | "delete";
export type ActionAtom =
  | ActionAtomSet
  | ActionAtomReferenceThrough
  | ActionAtomDeny
  | ActionAtomInput;
export type ActionAtomSet = WithKeyword<{
  kind: "set";
  target: Identifier;
  set: UnnamedHook | { kind: "expr"; expr: Expr };
}>;
export type ActionAtomReferenceThrough = WithKeyword<{
  kind: "referenceThrough";
  target: Identifier;
  through: Identifier;
}>;
export type ActionAtomDeny = WithKeyword<{ kind: "deny"; fields: "*" | Identifier[] }>;
export type ActionAtomInput = WithKeyword<{
  kind: "input";
  fields: { field: Identifier; atoms: InputAtom[] }[];
}>;
export type InputAtom = WithKeyword<
  | { kind: "optional" }
  | { kind: "default_literal"; value: Literal }
  | { kind: "default_reference"; value: IdentifierPath }
>;
export type Populator = WithKeyword<{ kind: "populator"; name: Identifier; atoms: Populate[] }>;
export type Populate = WithKeyword<{ kind: "populate"; atoms: PopulateAtom[] }>;
export type PopulateAtom =
  | WithKeyword<
      | { kind: "target"; identifier: IdentifierAs }
      | { kind: "identify"; identifier: Identifier }
      | { kind: "repeat"; repeater: Repeater }
    >
  | ActionAtomSet
  | Populate;
export type Repeater =
  | { kind: "body"; atoms: RepeaterAtom[] }
  | { kind: "simple"; value: IntegerLiteral };
export type RepeaterAtom = WithKeyword<
  { kind: "start"; value: IntegerLiteral } | { kind: "end"; value: IntegerLiteral }
>;
export type UnnamedHook = WithKeyword<{ kind: "hook"; atoms: HookAtom[] }>;
export type Hook = UnnamedHook & { name: Identifier };
export type HookAtom = WithKeyword<
  | { kind: "default_arg"; name: Identifier }
  | { kind: "arg_expr"; name: Identifier; expr: Expr }
  | { kind: "source"; keywordFrom: TokenData; name: Identifier; file: StringLiteral }
  | { kind: "inline"; code: StringLiteral }
>;
export type Select = { identifier: Identifier; select?: Select }[];
export type Expr =
  | WithKeyword<{
      kind: "binary";
      operator: BinaryOperator;
      lhs: Expr;
      rhs: Expr;
    }>
  | { kind: "group"; expr: Expr }
  | WithKeyword<{ kind: "unary"; operator: UnaryOperator; expr: Expr }>
  | { kind: "identifierPath"; identifierPath: IdentifierPath }
  | { kind: "literal"; literal: Literal }
  | { kind: "function"; name: Identifier; args: Expr[] };
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
export type UnaryOperator = "not";
export type Literal = IntegerLiteral | FloatLiteral | BooleanLiteral | NullLiteral | StringLiteral;
export type IntegerLiteral = { kind: "integer"; value: number; token: TokenData };
export type FloatLiteral = { kind: "float"; value: number; token: TokenData };
export type BooleanLiteral = { kind: "boolean"; value: boolean; token: TokenData };
export type NullLiteral = { kind: "null"; value: null; token: TokenData };
export type StringLiteral = { kind: "string"; value: string; token: TokenData };
export type Identifier = { text: string; token: TokenData };
export type IdentifierPath = Identifier[];
export type IdentifierAs = { identifier: Identifier; as?: Identifier };
export type IdentifierPathAs = { identifierPath: Identifier[]; as?: Identifier };
export type TokenData = { start: number; end: number };
export type WithKeyword<O extends Record<string, unknown>> = { keyword: TokenData } & O;
