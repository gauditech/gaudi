export type Definition = (Model | Entrypoint | Populator)[];

export type Model = WithKeyword<{
  kind: "model";
  name: Identifier;
  atoms: ModelAtom[];
}>;
export type ModelAtom = Field | Reference | Relation | Query | Computed | ModelHook;

export type Field = WithKeyword<{
  kind: "field";
  name: Identifier;
  ref: RefModelAtom<"field">;
  atoms: FieldAtom[];
}>;
export type FieldAtom = WithKeyword<
  | { kind: "type"; identifier: Identifier }
  | { kind: "unique" }
  | { kind: "nullable" }
  | { kind: "default"; literal: Literal }
  | { kind: "validate"; validators: Validator[] }
>;
export type Validator =
  | FieldValidationHook
  | { kind: "builtin"; name: Identifier; args: Literal[] };

export type Reference = WithKeyword<{
  kind: "reference";
  name: Identifier;
  ref: RefModelAtom<"reference">;
  atoms: ReferenceAtom[];
}>;
export type ReferenceAtom = WithKeyword<
  { kind: "to"; identifier: Identifier; ref: RefModel } | { kind: "nullable" } | { kind: "unique" }
>;

export type Relation = WithKeyword<{
  kind: "relation";
  name: Identifier;
  ref: RefModelAtom<"relation">;
  atoms: RelationAtom[];
}>;
export type RelationAtom = WithKeyword<
  | { kind: "from"; identifier: Identifier; ref: RefModel }
  | { kind: "through"; identifier: Identifier; ref: RefModelAtom<"reference"> }
>;

export type Query = WithKeyword<{
  kind: "query";
  name: Identifier;
  ref: RefModelAtom<"query">;
  atoms: QueryAtom[];
}>;
export type QueryAtom = WithKeyword<
  | {
      kind: "from";
      identifierPath: IdentifierPath;
      as?: WithKeyword<{ identifier: IdentifierPath }>;
      refs: RefModelAtom<"reference" | "relation" | "query">[];
    }
  | { kind: "filter"; expr: Expr<Db> }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "limit"; value: IntegerLiteral }
  | { kind: "offset"; value: IntegerLiteral }
  | { kind: "select"; select: Select }
  | { kind: "aggregate"; aggregate: AggregateType }
>;
export type AggregateType = "count" | "sum";
export type OrderBy = (
  | {
      identifierPath: IdentifierPath;
      refs: RefModelAtomDb[];
    }
  | WithKeyword<{
      identifierPath: IdentifierPath;
      refs: RefModelAtomDb[];
      order: OrderType;
    }>
)[];
export type OrderType = "count" | "sum";

export type Computed = WithKeyword<{
  kind: "computed";
  name: Identifier;
  ref: RefModelAtom<"computed">;
  expr: Expr<Db>;
}>;

export type Entrypoint = WithKeyword<{
  kind: "entrypoint";
  name: Identifier;
  atoms: EntrypointAtom[];
}>;
export type EntrypointAtom =
  | WithKeyword<
      | { kind: "target"; identifier: IdentifierAs; ref: RefModel | RefModelAtom<"relation"> }
      | { kind: "identifyWith"; identifier: Identifier; ref: RefModelAtom<"field"> }
      | { kind: "response"; select: Select }
      | { kind: "authorize"; expr: Expr<Code> }
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
  { kind: "action"; actions: Action[] } | { kind: "authorize"; expr: Expr<Code> }
>;

export type Action = WithKeyword<{
  kind: ActionType;
  target?: IdentifierPathAs;
  refs: RefEndpointContext[];
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
  ref: RefModelAtom<"field" | "reference">;
  set: ActionFieldHook | { kind: "expr"; expr: Expr<Code> };
}>;
export type ActionAtomReferenceThrough = WithKeyword<{
  kind: "referenceThrough";
  target: Identifier;
  targetRef: RefModelAtom<"reference">;
  through: Identifier;
  throughRef: RefModelAtom<"field">;
}>;
export type ActionAtomDeny = WithKeyword<{
  kind: "deny";
  fields:
    | WithKeyword<{ kind: "all" }>
    | {
        kind: "list";
        fields: { identifier: Identifier; ref: RefModelAtom<"field" | "reference"> }[];
      };
}>;
export type ActionAtomInput = WithKeyword<{
  kind: "input";
  fields: {
    field: Identifier;
    ref: RefModelAtom<"field" | "reference">;
    atoms: InputAtom[];
  }[];
}>;
export type InputAtom = WithKeyword<{ kind: "optional" } | { kind: "default"; value: Expr<Code> }>;

export type Populator = WithKeyword<{
  kind: "populator";
  name: Identifier;
  atoms: Populate[];
}>;
export type Populate = WithKeyword<{ kind: "populate"; atoms: PopulateAtom[] }>;
export type PopulateAtom =
  | WithKeyword<
      | { kind: "target"; identifier: IdentifierAs; ref: RefModel | RefModelAtom<"relation"> }
      | { kind: "identify"; identifier: Identifier; ref: RefModelAtom<"field"> }
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

export type Hook<named extends boolean, simple extends boolean> = WithKeyword<{
  kind: "hook";
  name: named extends true ? Identifier : undefined;
  atoms: WithKeyword<
    | (simple extends true
        ? { kind: "default_arg"; name: Identifier }
        : { kind: "arg_expr"; name: Identifier; expr: Expr<Code> })
    | { kind: "source"; keywordFrom: TokenData; name: Identifier; file: StringLiteral }
    | { kind: "inline"; code: StringLiteral }
  >[];
}>;
export type ModelHook = Hook<true, false> & { ref: RefModelAtom<"hook"> };
export type FieldValidationHook = Hook<false, true>;
export type ActionFieldHook = Hook<false, false>;

export type Select = {
  name: Identifier;
  identifierPath?: IdentifierPath;
  refs: RefModelAtom[];
  select?: Select;
}[];

export type Db = "db";
export type Code = "code";
export type ExprKind = Db | Code;
export type Expr<kind extends ExprKind> =
  | WithKeyword<{
      kind: "binary";
      operator: BinaryOperator;
      lhs: Expr<kind>;
      rhs: Expr<kind>;
    }>
  | { kind: "group"; expr: Expr<kind> }
  | WithKeyword<{ kind: "unary"; operator: UnaryOperator; expr: Expr<kind> }>
  | {
      kind: "identifierPath";
      identifierPath: IdentifierPath;
      refs: (kind extends Db ? RefModelAtomDb : RefEndpointContext)[];
    }
  | { kind: "literal"; literal: Literal }
  | { kind: "function"; name: Identifier; args: Expr<kind>[] };
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

export type RefBase<r> = { kind: "unresolved"; error?: true } | r;

export type RefModel = RefBase<{ kind: "model"; model: string }>;
export type RefModelAtom<k extends ModelAtom["kind"] = ModelAtom["kind"]> = RefBase<{
  kind: "modelAtom";
  atomKind: k;
  model: string;
  atom: string;
  nextModel: k extends "reference" | "relation" | "query" ? string : undefined;
}>;
export type RefModelAtomDb = RefModelAtom<
  "field" | "reference" | "relation" | "query" | "computed"
>;

export type RefAuth = RefBase<{ kind: "auth"; path: string[] }>;
export type RefInput = RefBase<{ kind: "input"; path: string[] }>;
export type RefEndpointContext = RefModel | RefModelAtom | RefAuth | RefInput;

export type Identifier = { text: string; token: TokenData };
export type IdentifierPath = Identifier[];
export type IdentifierAs = { identifier: Identifier; as?: WithKeyword<{ identifier: Identifier }> };
export type IdentifierPathAs = {
  identifierPath: Identifier[];
  as?: WithKeyword<{ identifier: Identifier }>;
};

export type TokenData = { start: number; end: number };

export type WithKeyword<O extends Record<string, unknown>> = { keyword: TokenData } & O;

export type Parsed = "parsed";
export type Resolved = "resolved";
export type Typed = "typed";
export type Stage = Parsed | Resolved | Typed;
