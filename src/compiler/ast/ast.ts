import { Type } from "./type";

export type ProjectASTs = {
  plugins: Record<string, GlobalAtom[]>;
  document: GlobalAtom[];
};

export type GlobalAtom = Model | Entrypoint | Populator | Runtime | Authenticator;

export type Model = WithKeyword<{
  kind: "model";
  name: Identifier;
  atoms: ModelAtom[];
}>;
export type ModelAtom = Field | Reference | Relation | Query | Computed | ModelHook;

export type Field = WithKeyword<{
  kind: "field";
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: FieldAtom[];
  resolved?: true;
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
  ref: Ref;
  type: Type;
  atoms: ReferenceAtom[];
  resolved?: true;
}>;
export type ReferenceAtom = WithKeyword<
  { kind: "to"; identifier: IdentifierRef } | { kind: "nullable" } | { kind: "unique" }
>;

export type Relation = WithKeyword<{
  kind: "relation";
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: RelationAtom[];
  resolved?: true;
}>;
export type RelationAtom = WithKeyword<
  { kind: "from"; identifier: IdentifierRef } | { kind: "through"; identifier: IdentifierRef }
>;

export type Query = WithKeyword<{
  kind: "query";
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: QueryAtom[];
  resolved?: true;
}>;
export type QueryAtom = WithKeyword<
  | {
      kind: "from";
      identifierPath: IdentifierRef[];
      as?: WithKeyword<{ identifierPath: IdentifierRef[] }>;
    }
  | { kind: "filter"; expr: Expr<Db> }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "limit"; value: IntegerLiteral }
  | { kind: "offset"; value: IntegerLiteral }
  | { kind: "select"; select: Select }
  | { kind: "aggregate"; aggregate: AggregateType }
>;
export type AggregateType = "count" | "one" | "first";
export type OrderBy = (
  | {
      identifierPath: IdentifierRef[];
      keyword?: undefined;
      order?: undefined;
    }
  | WithKeyword<{
      identifierPath: IdentifierRef[];
      order: OrderType;
    }>
)[];
export type OrderType = "asc" | "desc";

export type Computed = WithKeyword<{
  kind: "computed";
  name: Identifier;
  ref: Ref;
  type: Type;
  expr: Expr<Db>;
  resolved?: true;
}>;

export type Entrypoint = WithKeyword<{
  kind: "entrypoint";
  name: Identifier;
  atoms: EntrypointAtom[];
}>;
export type EntrypointAtom =
  | WithKeyword<
      | {
          kind: "target";
          identifier: IdentifierRef;
          as?: WithKeyword<{ identifier: IdentifierRef }>;
        }
      | { kind: "identifyWith"; identifier: IdentifierRef }
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
export type EndpointType = "list" | "get" | "create" | "update" | "delete" | "custom";
export type EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type EndpointCardinality = "one" | "many";

export type EndpointAtom = WithKeyword<
  | { kind: "action"; actions: Action[] }
  | { kind: "authorize"; expr: Expr<Code> }
  | { kind: "method"; method: EndpointMethod; methodKeyword: TokenData }
  | { kind: "cardinality"; cardinality: EndpointCardinality; cardinalityKeyword: TokenData }
  | { kind: "path"; path: StringLiteral }
>;

export type Action = ModelAction | DeleteAction | ExecuteAction | FetchAction;

export type ModelAction = WithKeyword<{
  kind: "create" | "update";
  target?: IdentifierRef[];
  as?: WithKeyword<{ identifier: IdentifierRef }>;
  atoms: ModelActionAtom[];
}>;
export type ModelActionAtom =
  | ActionAtomSet
  | ActionAtomReferenceThrough
  | ActionAtomDeny
  | ActionAtomInput
  | ActionAtomVirtualInput;

export type DeleteAction = WithKeyword<{
  kind: "delete";
  target?: IdentifierRef[];
}>;

export type ExecuteAction = WithKeyword<{
  kind: "execute";
  keywordAs?: TokenData;
  name?: Identifier;
  atoms: ExecuteActionAtom[];
}>;
export type ExecuteActionAtom =
  | ActionAtomVirtualInput
  | ActionHook
  | WithKeyword<{ kind: "responds" }>;

export type FetchAction = WithKeyword<{
  kind: "fetch";
  keywordAs: TokenData;
  name: Identifier;
  atoms: FetchActionAtom[];
}>;
export type FetchActionAtom = ActionAtomVirtualInput | AnonymousQuery;

export type ActionAtomSet = WithKeyword<{
  kind: "set";
  target: IdentifierRef;
  set: ActionHook | { kind: "expr"; expr: Expr<Code> };
}>;
export type ActionAtomReferenceThrough = WithKeyword<{
  kind: "referenceThrough";
  target: IdentifierRef;
  through: IdentifierRef;
  keywordThrough: TokenData;
}>;
export type ActionAtomDeny = WithKeyword<{
  kind: "deny";
  fields:
    | WithKeyword<{ kind: "all" }>
    | {
        kind: "list";
        fields: IdentifierRef[];
      };
}>;
export type ActionAtomInput = WithKeyword<{
  kind: "input";
  fields: {
    field: IdentifierRef;
    atoms: InputAtom[];
  }[];
}>;
export type InputAtom = WithKeyword<{ kind: "optional" } | { kind: "default"; value: Expr<Code> }>;
export type ActionAtomVirtualInput = WithKeyword<{
  kind: "virtualInput";
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: ActionAtomVirtualInputAtom[];
}>;

export type ActionAtomVirtualInputAtom = WithKeyword<
  | { kind: "type"; identifier: Identifier }
  | { kind: "nullable" }
  | { kind: "validate"; validators: Validator[] }
>;

export type Populator = WithKeyword<{
  kind: "populator";
  name: Identifier;
  atoms: Populate[];
}>;
export type Populate = WithKeyword<{ kind: "populate"; name: Identifier; atoms: PopulateAtom[] }>;
export type PopulateAtom =
  | WithKeyword<
      | {
          kind: "target";
          identifier: IdentifierRef;
          as?: WithKeyword<{ identifier: IdentifierRef }>;
        }
      | { kind: "repeat"; repeater: Repeater }
    >
  | ActionAtomSet
  | Populate;

export type Repeater =
  | { name?: Identifier; kind: "body"; atoms: RepeaterAtom[] }
  | { name?: Identifier; kind: "simple"; value: IntegerLiteral };
export type RepeaterAtom = WithKeyword<
  { kind: "start"; value: IntegerLiteral } | { kind: "end"; value: IntegerLiteral }
>;

export type Runtime = WithKeyword<{ kind: "runtime"; name: Identifier; atoms: RuntimeAtom[] }>;
export type RuntimeAtom = WithKeyword<
  { kind: "default" } | { kind: "sourcePath"; path: StringLiteral }
>;

export type Authenticator = WithKeyword<{ kind: "authenticator"; atoms: AuthenticatorAtom[] }>;
export type AuthenticatorAtom = WithKeyword<{ kind: "method"; method: AuthenticatorMethod }>;
export type AuthenticatorMethod = WithKeyword<{ kind: "basic" }>;

export type Hook<named extends boolean, simple extends boolean> = WithKeyword<{
  kind: "hook";
  name: named extends true ? Identifier : undefined;
  ref: named extends true ? Ref : undefined;
  atoms: WithKeyword<
    | (simple extends true
        ? { kind: "default_arg"; name: Identifier }
        :
            | { kind: "arg_expr"; name: Identifier; expr: Expr<Code> }
            | { kind: "arg_query"; name: Identifier; query: AnonymousQuery })
    | {
        kind: "source";
        keywordFrom: TokenData;
        name: Identifier;
        file: StringLiteral;
        runtimePath?: string;
      }
    | { kind: "inline"; code: StringLiteral }
    | { kind: "runtime"; identifier: Identifier }
  >[];
}>;
export type ModelHook = Hook<true, false> & { type: Type; resolved?: true };
export type FieldValidationHook = Hook<false, true>;
export type ActionHook = Hook<false, false>;

export type AnonymousQuery = WithKeyword<{
  kind: "anonymousQuery";
  atoms: QueryAtom[];
  type: Type;
}>;

export type Select = {
  target:
    | { kind: "short"; name: IdentifierRef }
    | { kind: "long"; name: Identifier; identifierPath: IdentifierRef[] };
  select?: Select;
}[];

export type Db = "db";
export type Code = "code";
export type ExprKind = Db | Code;
export type Expr<kind extends ExprKind = ExprKind> = (
  | WithKeyword<{
      kind: "binary";
      operator: BinaryOperator;
      lhs: Expr<kind>;
      rhs: Expr<kind>;
    }>
  | { kind: "group"; expr: Expr<kind> }
  | WithKeyword<{ kind: "unary"; operator: UnaryOperator; expr: Expr<kind> }>
  | { kind: "path"; path: IdentifierRef[] }
  | { kind: "literal"; literal: Literal }
  | { kind: "function"; name: Identifier; args: Expr<kind>[] }
) & { type: Type; sourcePos: TokenData };
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

export type RefUnresolved = { kind: "unresolved" };
export type RefModel = { kind: "model"; model: string };
export type RefModelAtom = {
  kind: "modelAtom";
  atomKind: ModelAtom["kind"];
  name: string;
  model: string;
  unique: boolean;
};
export type RefContext = { kind: "context" };
export type Ref = RefUnresolved | RefModel | RefModelAtom | RefContext;

export const unresolvedRef: Ref = { kind: "unresolved" };

export type Identifier = { text: string; token: TokenData };
export type IdentifierRef = { identifier: Identifier; ref: Ref; type: Type };

export type TokenData = { start: number; end: number };

export type WithKeyword<O extends Record<string, unknown>> = { keyword: TokenData } & O;

export type Parsed = "parsed";
export type Resolved = "resolved";
export type Typed = "typed";
export type Stage = Parsed | Resolved | Typed;
