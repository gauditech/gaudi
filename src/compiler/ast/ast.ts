import { Type } from "./type";

export type ProjectASTs = {
  plugins: Record<string, GlobalAtom[]>;
  document: GlobalAtom[];
};

export type GlobalAtom = Model | Entrypoint | Populator | Runtime | Authenticator | Generator;

export type Model = {
  kind: "model";
  keyword: TokenData;
  name: Identifier;
  atoms: ModelAtom[];
};
export type ModelAtom = Field | Reference | Relation | Query | Computed | ModelHook;

export type Field = {
  kind: "field";
  keyword: TokenData;
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: FieldAtom[];
};
export type FieldAtom = { keyword: TokenData } & (
  | { kind: "type"; identifier: Identifier }
  | { kind: "unique" }
  | { kind: "nullable" }
  | { kind: "default"; literal: Literal }
  | { kind: "validate"; validators: Validator[] }
);
export type Validator =
  | FieldValidationHook
  | { kind: "builtin"; name: Identifier; args: Literal[] };

export type Reference = {
  kind: "reference";
  keyword: TokenData;
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: ReferenceAtom[];
};
export type ReferenceAtom = { keyword: TokenData } & (
  | { kind: "to"; identifier: IdentifierRef }
  | { kind: "nullable" }
  | { kind: "unique" }
);

export type Relation = {
  kind: "relation";
  keyword: TokenData;
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: RelationAtom[];
};
export type RelationAtom = { keyword: TokenData } & (
  | { kind: "from"; identifier: IdentifierRef }
  | { kind: "through"; identifier: IdentifierRef }
);

export type Query = {
  kind: "query";
  keyword: TokenData;
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: QueryAtom[];
};
export type QueryAtom = { keyword: TokenData } & (
  | {
      kind: "from";
      identifierPath: IdentifierRef[];
      as?: { keyword: TokenData; identifierPath: IdentifierRef[] };
    }
  | { kind: "filter"; expr: Expr<Db> }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "limit"; value: IntegerLiteral }
  | { kind: "offset"; value: IntegerLiteral }
  | { kind: "select"; select: Select }
  | { kind: "aggregate"; aggregate: AggregateType }
);
export type AggregateType = "count" | "one" | "first";
export type OrderBy = (
  | {
      identifierPath: IdentifierRef[];
      keyword?: undefined;
      order?: undefined;
    }
  | {
      identifierPath: IdentifierRef[];
      order: OrderType;
      keyword: TokenData;
    }
)[];
export type OrderType = "asc" | "desc";

export type Computed = {
  kind: "computed";
  keyword: TokenData;
  name: Identifier;
  ref: Ref;
  type: Type;
  expr: Expr<Db>;
};

export type Entrypoint = {
  kind: "entrypoint";
  keyword: TokenData;
  target: IdentifierRef;
  atoms: EntrypointAtom[];
};

export type EntrypointAtom =
  | { kind: "response"; select: Select; keyword: TokenData }
  | { kind: "authorize"; expr: Expr<Code>; keyword: TokenData }
  | Endpoint
  | Entrypoint
  | Identify;

export type Identify = {
  kind: "identify";
  keyword: TokenData;
  as?: { keyword: TokenData; identifier: IdentifierRef };
  atoms: { kind: "through"; keyword: TokenData; identifier: IdentifierRef }[];
};

export type Endpoint = {
  kind: "endpoint";
  keyword: TokenData;
  keywordType: TokenData;
  type: EndpointType;
  atoms: EndpointAtom[];
};
export type EndpointType = "list" | "get" | "create" | "update" | "delete" | "custom";
export type EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type EndpointCardinality = "one" | "many";

export type EndpointAtom = { keyword: TokenData } & (
  | { kind: "action"; actions: Action[] }
  | { kind: "authorize"; expr: Expr<Code> }
  | { kind: "method"; method: EndpointMethod; methodKeyword: TokenData }
  | { kind: "cardinality"; cardinality: EndpointCardinality; cardinalityKeyword: TokenData }
  | { kind: "path"; path: StringLiteral }
  | { kind: "pageable" }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "filter"; expr: Expr<Db> }
);

export type Action = ModelAction | DeleteAction | ExecuteAction | FetchAction;

export type ModelAction = {
  kind: "create" | "update";
  keyword: TokenData;
  target?: IdentifierRef[];
  as?: { keyword: TokenData; identifier: IdentifierRef };
  atoms: ModelActionAtom[];
};
export type ModelActionAtom =
  | ActionAtomSet
  | ActionAtomReferenceThrough
  | ActionAtomDeny
  | ActionAtomInput
  | ActionAtomVirtualInput;

export type DeleteAction = {
  kind: "delete";
  keyword: TokenData;
  target?: IdentifierRef[];
};

export type ExecuteAction = {
  kind: "execute";
  keyword: TokenData;
  keywordAs?: TokenData;
  name?: Identifier;
  atoms: ExecuteActionAtom[];
};
export type ExecuteActionAtom =
  | ActionAtomVirtualInput
  | ActionHook
  | { kind: "responds"; keyword: TokenData };

export type FetchAction = {
  kind: "fetch";
  keyword: TokenData;
  keywordAs: TokenData;
  name: Identifier;
  atoms: FetchActionAtom[];
};
export type FetchActionAtom = ActionAtomVirtualInput | AnonymousQuery;

export type ActionAtomSet = {
  kind: "set";
  keyword: TokenData;
  target: IdentifierRef;
  set: ActionHook | { kind: "expr"; expr: Expr<Code> };
};
export type ActionAtomReferenceThrough = {
  kind: "referenceThrough";
  keyword: TokenData;
  target: IdentifierRef;
  through: IdentifierRef;
  keywordThrough: TokenData;
};
export type ActionAtomDeny = {
  kind: "deny";
  keyword: TokenData;
  fields:
    | { kind: "all"; keyword: TokenData }
    | {
        kind: "list";
        fields: IdentifierRef[];
      };
};
export type ActionAtomInput = {
  kind: "input";
  keyword: TokenData;
  fields: {
    field: IdentifierRef;
    atoms: InputAtom[];
  }[];
};
export type InputAtom = { keyword: TokenData } & (
  | { kind: "optional" }
  | { kind: "default"; value: Expr<Code> }
);
export type ActionAtomVirtualInput = {
  kind: "virtualInput";
  keyword: TokenData;
  name: Identifier;
  ref: Ref;
  type: Type;
  atoms: ActionAtomVirtualInputAtom[];
};

export type ActionAtomVirtualInputAtom = { keyword: TokenData } & (
  | { kind: "type"; identifier: Identifier }
  | { kind: "nullable" }
  | { kind: "validate"; validators: Validator[] }
);

export type Populator = {
  kind: "populator";
  keyword: TokenData;
  name: Identifier;
  atoms: Populate[];
};
export type Populate = {
  kind: "populate";
  keyword: TokenData;
  name: Identifier;
  atoms: PopulateAtom[];
};
export type PopulateAtom =
  | {
      kind: "target";
      keyword: TokenData;
      identifier: IdentifierRef;
      as?: { keyword: TokenData; identifier: IdentifierRef };
    }
  | {
      kind: "repeat";
      keyword: TokenData;
      as?: { keyword: TokenData; identifier: IdentifierRef };
      repeatValue: RepeatValue;
    }
  | ActionAtomSet
  | Populate;

export type RepeatValue =
  | { kind: "long"; atoms: RepeatAtom[] }
  | { kind: "short"; value: IntegerLiteral };
export type RepeatAtom = { keyword: TokenData } & (
  | { kind: "start"; value: IntegerLiteral }
  | { kind: "end"; value: IntegerLiteral }
);

export type GeneratorType = "client";
export type Generator = {
  kind: "generator";
  keyword: TokenData;
} & {
  type: Extract<GeneratorType, "client">;
  keywordType: TokenData;
  atoms: GeneratorClientAtom[];
};
export type GeneratorClientAtom =
  | {
      kind: "target";
      keyword: TokenData;
      value: GeneratorClientAtomTarget;
      keywordValue: TokenData;
    }
  | { kind: "api"; keyword: TokenData; value: GeneratorClientAtomApi; keywordValue: TokenData }
  | { kind: "output"; keyword: TokenData; value: StringLiteral };
export type GeneratorClientAtomTarget = "js";
export type GeneratorClientAtomApi = "entrypoint" | "model";

export type Runtime = {
  kind: "runtime";
  keyword: TokenData;
  name: Identifier;
  atoms: RuntimeAtom[];
};
export type RuntimeAtom = { keyword: TokenData } & (
  | { kind: "default" }
  | { kind: "sourcePath"; path: StringLiteral }
);

export type Authenticator = {
  kind: "authenticator";
  keyword: TokenData;
  atoms: AuthenticatorAtom[];
};
export type AuthenticatorAtom = { kind: "method"; keyword: TokenData; method: AuthenticatorMethod };
export type AuthenticatorMethod = { kind: "basic"; keyword: TokenData };

export type Hook<named extends boolean, simple extends boolean> = {
  kind: "hook";
  keyword: TokenData;
  name: named extends true ? Identifier : undefined;
  ref: named extends true ? Ref : undefined;
  atoms: (
    | (simple extends true
        ? { kind: "default_arg"; keyword: TokenData; name: Identifier }
        :
            | { kind: "arg_expr"; keyword: TokenData; name: Identifier; expr: Expr<Code> }
            | { kind: "arg_query"; keyword: TokenData; name: Identifier; query: AnonymousQuery })
    | {
        kind: "source";
        keyword: TokenData;
        keywordFrom: TokenData;
        name: Identifier;
        file: StringLiteral;
        runtimePath?: string;
      }
    | { kind: "inline"; keyword: TokenData; code: StringLiteral }
    | { kind: "runtime"; keyword: TokenData; identifier: Identifier }
  )[];
};
export type ModelHook = Hook<true, false> & { type: Type };
export type FieldValidationHook = Hook<false, true>;
export type ActionHook = Hook<false, false>;

export type AnonymousQuery = {
  kind: "anonymousQuery";
  keyword: TokenData;
  atoms: QueryAtom[];
  type: Type;
};

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
  | {
      kind: "binary";
      keyword: TokenData;
      operator: BinaryOperator;
      lhs: Expr<kind>;
      rhs: Expr<kind>;
    }
  | { kind: "group"; expr: Expr<kind> }
  | { kind: "unary"; keyword: TokenData; operator: UnaryOperator; expr: Expr<kind> }
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
export type ContextKind =
  | "entrypointTarget"
  | "populateTarget"
  | "fetch"
  | "virtualInput"
  | "repeat"
  | "authToken"
  | "struct";
export type RefContext = { kind: "context"; contextKind: ContextKind };
export type Ref = RefUnresolved | RefModel | RefModelAtom | RefContext;

export const unresolvedRef: Ref = { kind: "unresolved" };

export type Identifier = { text: string; token: TokenData };
export type IdentifierRef = { identifier: Identifier; ref: Ref; type: Type };

export type TokenData = { start: number; end: number };

export type Parsed = "parsed";
export type Resolved = "resolved";
export type Typed = "typed";
export type Stage = Parsed | Resolved | Typed;
