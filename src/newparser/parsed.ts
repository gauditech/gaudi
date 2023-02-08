export type Definition = (Model | Entrypoint | Populator)[];
export type Model = {
  kind: "model";
  name: Identifier;
  atoms: ModelAtom[];
};
export type ModelAtom = Field | Reference | Relation | Computed | Hook;
export type Field = {
  kind: "field";
  name: Identifier;
  atoms: FieldAtom[];
};
export type FieldAtom =
  | { kind: "type"; identifier: Identifier }
  | { kind: "unique" }
  | { kind: "default"; literal: Literal }
  | { kind: "validate"; validators: Validator[] };
export type Validator = UnnamedHook | { kind: "builtin"; name: Identifier; args: Literal[] };
export type Reference = {
  kind: "reference";
  name: Identifier;
  atoms: ReferenceAtom[];
};
export type ReferenceAtom =
  | { kind: "to"; identifier: Identifier }
  | { kind: "nullable" }
  | { kind: "unique" };
export type Relation = {
  kind: "relation";
  name: Identifier;
  atoms: RelationAtom[];
};
export type RelationAtom =
  | { kind: "from"; identifier: Identifier }
  | { kind: "through"; identifier: Identifier };
export type Query = {
  kind: "query";
  name: Identifier;
  atoms: QueryAtom[];
};
export type QueryAtom =
  | { kind: "from"; identifier: IdentifierPath }
  | { kind: "filter"; expr: Expr }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "limit"; value: number }
  | { kind: "offset"; value: number }
  | { kind: "select"; select: Select }
  | { kind: "aggregate"; aggregate: AggregateType };
export type AggregateType = "count" | "sum";
export type OrderBy = { identifier: Identifier; order?: OrderType }[];
export type OrderType = "count" | "sum";
export type Computed = {
  kind: "computed";
  name: Identifier;
  expr: Expr;
};
export type Entrypoint = {
  kind: "entrypoint";
  atoms: EntrypointAtom[];
};
export type EntrypointAtom =
  | { kind: "target"; identifier: IdentifierAs }
  | { kind: "identify"; identifier: Identifier }
  | { kind: "response"; select: Select }
  | { kind: "authorize"; expr: Expr }
  | { kind: "endpoints"; endpoint: Endpoint }
  | { kind: "entrypoints"; entrypoint: Entrypoint };
export type Endpoint = { type: EndpointType; atoms: EndpointAtom[] };
export type EndpointType = "list" | "get" | "create" | "update" | "delete";
export type EndpointAtom =
  | { kind: "action"; actions: Action[] }
  | { kind: "authorize"; expr: Expr };
export type Action = { kind: ActionType; target?: IdentifierPathAs; atoms: ActionAtom[] };
export type ActionType = "create" | "update" | "delete";
export type ActionAtom =
  | ActionAtomSet
  | ActionAtomReferenceThrough
  | ActionAtomDeny
  | ActionAtomInput;
export type ActionAtomSet = {
  kind: "set";
  target: Identifier;
  set: UnnamedHook | { kind: "expr"; expr: Expr };
};
export type ActionAtomReferenceThrough = {
  kind: "referenceThrough";
  target: Identifier;
  through: Identifier;
};
export type ActionAtomDeny = { kind: "deny"; fields: "*" | Identifier[] };
export type ActionAtomInput = {
  kind: "input";
  fields: { field: Identifier; atoms: InputAtom[] }[];
};
export type InputAtom =
  | { kind: "optional" }
  | { kind: "default_literal"; value: Literal }
  | { kind: "default_reference"; value: IdentifierPath };
export type Populator = { kind: "populator"; name: Identifier; atoms: Populate[] };
export type Populate = { kind: "populate"; atoms: PopulateAtom[] };
export type PopulateAtom =
  | { kind: "target"; identifier: IdentifierAs }
  | { kind: "identify"; identifier: Identifier }
  | { kind: "repeat"; repeater: Repeater }
  | ActionAtomSet
  | Populate;
export type Repeater = { kind: "body"; atoms: RepeaterAtom[] } | { kind: "simple"; value: number };
export type RepeaterAtom = { kind: "start"; value: number } | { kind: "end"; value: number };
export type UnnamedHook = { kind: "hook"; atoms: HookAtom[] };
export type Hook = UnnamedHook & { name: Identifier };
export type HookAtom =
  | { kind: "default_arg"; name: Identifier }
  | { kind: "arg_expr"; name: Identifier; expr: Expr }
  | { kind: "source"; name: Identifier; file: string }
  | { kind: "inline"; code: string };
export type Select = { identifier: Identifier; select?: Select }[];
export type Expr =
  | {
      kind: "binary";
      operator: BinaryOperator;
      lhs: Expr;
      rhs: Expr;
    }
  | { kind: "group"; expr: Expr }
  | { kind: "unary"; operator: UnaryOperator; expr: Expr }
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
