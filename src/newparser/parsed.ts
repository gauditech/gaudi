export type Definition = (Model | Entrypoint | Populator)[];
export type Model = WithKeyword<{
  kind: "model";
  name: Identifier;
  atoms: ModelAtom[];
}>;
export type ModelAtom = Field | Reference | Relation | Computed | Hook;
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
  | { kind: "limit"; value: number }
  | { kind: "offset"; value: number }
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
export type EntrypointAtom = WithKeyword<
  | { kind: "target"; identifier: IdentifierAs }
  | { kind: "identifyWith"; identifier: Identifier }
  | { kind: "response"; select: Select }
  | { kind: "authorize"; expr: Expr }
  | { kind: "endpoints"; endpoint: Endpoint }
  | { kind: "entrypoints"; entrypoint: Entrypoint }
>;
export type Endpoint = WithKeyword<{ type: EndpointType; atoms: EndpointAtom[] }>;
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
export type Repeater = { kind: "body"; atoms: RepeaterAtom[] } | { kind: "simple"; value: number };
export type RepeaterAtom = WithKeyword<
  { kind: "start"; value: number } | { kind: "end"; value: number }
>;
export type UnnamedHook = WithKeyword<{ kind: "hook"; atoms: HookAtom[] }>;
export type Hook = UnnamedHook & { name: Identifier };
export type HookAtom = WithKeyword<
  | { kind: "default_arg"; name: Identifier }
  | { kind: "arg_expr"; name: Identifier; expr: Expr }
  | { kind: "source"; keywordFrom: SourcePos; name: Identifier; file: string }
  | { kind: "inline"; code: string }
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
export type Literal =
  | { kind: "integer"; value: number }
  | { kind: "float"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null"; value: null }
  | { kind: "string"; value: string };
export type Identifier = { text: string; pos: SourcePos };
export type IdentifierPath = Identifier[];
export type IdentifierAs = { identifier: Identifier; as?: Identifier };
export type IdentifierPathAs = { identifierPath: Identifier[]; as?: Identifier };
export type SourcePos = { start: number; end: number };
export type WithKeyword<O extends Record<string, unknown>> = { keyword: SourcePos } & O;
