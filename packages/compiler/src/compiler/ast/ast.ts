import { FieldType, Type } from "./type";

export type ProjectASTs = {
  plugins: GlobalAtom[][];
  documents: Map<string, GlobalAtom[]>;
};

export type GlobalAtom = Validator | Model | Api | Populator | Runtime | Authenticator | Generator;

export type Validator = {
  kind: "validator";
  keyword: TokenData;
  name: IdentifierRef<RefValidator>;
  atoms: ValidatorAtom[];
};

export type ValidatorAtom =
  | ValidatorArg
  | { kind: "assert"; keyword: TokenData; expr: Expr<Code> }
  | { kind: "assertHook"; keyword: TokenData; hook: ValidatorHook }
  | ValidatorError;

export type ValidatorArg = {
  kind: "arg";
  keyword: TokenData;
  name: IdentifierRef<RefValidatorArg>;
  atoms: ValidatorArgAtom[];
};
export type ValidatorArgAtom = { kind: "type"; keyword: TokenData; identifier: Identifier };

export type ValidatorError = { kind: "error"; keyword: TokenData; atoms: ValidatorErrorAtom[] };
export type ValidatorErrorAtom = { kind: "code"; keyword: TokenData; code: StringLiteral };

export type Model = {
  kind: "model";
  keyword: TokenData;
  name: IdentifierRef<RefModel>;
  atoms: ModelAtom[];
};
export type ModelAtom = Field | Reference | Relation | Query | Computed | ModelHook;

export type Field = {
  kind: "field";
  keyword: TokenData;
  name: IdentifierRef<RefModelField>;
  atoms: FieldAtom[];
};
export type FieldAtom = { keyword: TokenData } & (
  | { kind: "type"; identifier: Identifier }
  | { kind: "unique" }
  | { kind: "nullable" }
  | { kind: "default"; literal: Literal }
  | { kind: "validate"; expr: ValidateExpr }
);

export type Reference = {
  kind: "reference";
  keyword: TokenData;
  name: IdentifierRef<RefModelReference>;
  atoms: ReferenceAtom[];
};
export type ReferenceAtom = { keyword: TokenData } & (
  | { kind: "to"; identifier: IdentifierRef<RefModel> }
  | { kind: "nullable" }
  | { kind: "unique" }
  | { kind: "onDelete"; action: ReferenceOnDeleteAtomAction }
);
export type ReferenceOnDeleteAtomAction = { keyword: TokenData } & (
  | { kind: "cascade" }
  | { kind: "setNull" }
);

export type Relation = {
  kind: "relation";
  keyword: TokenData;
  name: IdentifierRef<RefModelRelation>;
  atoms: RelationAtom[];
};
export type RelationAtom = { keyword: TokenData } & (
  | { kind: "from"; identifier: IdentifierRef<RefModel> }
  | { kind: "through"; identifier: IdentifierRef<RefModelReference> }
);

export type Query = {
  kind: "query";
  keyword: TokenData;
  name: IdentifierRef<RefModelQuery>;
  atoms: QueryAtom[];
};
export type QueryAtom = { keyword: TokenData } & (
  | {
      kind: "from";
      identifierPath: IdentifierRef[];
      as?: { keyword: TokenData; identifierPath: IdentifierRef<RefQueryTarget>[] };
    }
  | { kind: "filter"; expr: Expr<Db> }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "limit"; value: IntegerLiteral }
  | { kind: "offset"; value: IntegerLiteral }
  | { kind: "aggregate"; aggregate: AggregateType }
);
export type AggregateType = "count" | "sum" | "one" | "first";
export type OrderBy = (
  | {
      expr: Expr<"db">;
      keyword?: undefined;
      order?: undefined;
    }
  | {
      expr: Expr<"db">;
      order: OrderType;
      keyword: TokenData;
    }
)[];
export type OrderType = "asc" | "desc";

export type Computed = {
  kind: "computed";
  keyword: TokenData;
  name: IdentifierRef<RefModelComputed>;
  expr: Expr<Db>;
};

export type Api = {
  kind: "api";
  keyword: TokenData;
  name?: Identifier;
  atoms: Entrypoint[];
};

export type Entrypoint = {
  kind: "entrypoint";
  keyword: TokenData;
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation>;
  ref?: RefEntrypoint;
  as?: { keyword: TokenData; identifier: IdentifierRef<RefEntrypoint> };
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
  atoms: {
    kind: "through";
    keyword: TokenData;
    identifierPath: IdentifierRef<RefModelAtom>[];
  }[];
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
  | { kind: "extraInputs"; extraInputs: ExtraInput[] }
  | { kind: "action"; actions: Action[] }
  | { kind: "authorize"; expr: Expr<Code> }
  | { kind: "method"; method: EndpointMethod; methodKeyword: TokenData }
  | { kind: "cardinality"; cardinality: EndpointCardinality; cardinalityKeyword: TokenData }
  | { kind: "path"; path: StringLiteral }
  | { kind: "pageable" }
  | { kind: "orderBy"; orderBy: OrderBy }
  | { kind: "filter"; expr: Expr<Db> }
);

export type Action =
  | ModelAction
  | DeleteAction
  | ExecuteAction
  | QueryAction
  | RespondAction
  | ValidateAction;

export type ModelAction = {
  kind: "create" | "update";
  keyword: TokenData;
  target?: IdentifierRef[];
  as?: { keyword: TokenData; identifier: IdentifierRef<RefAction> };
  atoms: ModelActionAtom[];
  isPrimary?: true;
};
export type ModelActionAtom =
  | ActionAtomSet
  | ActionAtomReferenceThrough
  | ActionAtomDeny
  | ActionAtomInput;

export type DeleteAction = {
  kind: "delete";
  keyword: TokenData;
  target?: IdentifierRef[];
  isPrimary?: true;
};

export type ExecuteAction = {
  kind: "execute";
  keyword: TokenData;
  keywordAs?: TokenData;
  name?: IdentifierRef<RefAction>;
  atoms: ExecuteActionAtom[];
};
export type ExecuteActionAtom = ActionHook | { kind: "responds"; keyword: TokenData };

export type QueryAction = {
  kind: "queryAction";
  keyword: TokenData;
  keywordAs?: TokenData;
  name?: IdentifierRef<RefAction>;
  type: Type;
  atoms: QueryActionAtom[];
};
export type QueryActionAtom =
  | QueryAtom
  | { kind: "update"; keyword: TokenData; atoms: ActionAtomSet[] }
  | { kind: "delete"; keyword: TokenData }
  | { kind: "select"; keyword: TokenData; select: Select };

export type RespondAction = {
  kind: "respond";
  keyword: TokenData;
  atoms: RespondActionAtom[];
};
export type RespondActionAtom =
  | RespondActionAtomBody
  | RespondActionAtomHttpStatus
  | RespondActionAtomHttpHeaderMap;
export type RespondActionAtomBody = { kind: "body"; body: Expr<Code>; keyword: TokenData };
export type RespondActionAtomHttpStatus = {
  kind: "httpStatus";
  code: Expr<Code>;
  keyword: TokenData;
};
export type RespondActionAtomHttpHeaderMap = {
  kind: "httpHeaders";
  headers: RespondActionAtomHttpHeader[];
  keyword: TokenData;
};
export type RespondActionAtomHttpHeader = {
  kind: "header";
  name: StringLiteral;
  value: Expr<Code>;
  keyword: TokenData;
};

export type ValidateAction = {
  kind: "validate";
  keyword: TokenData;
  key: StringLiteral;
  expr: ValidateExpr;
};
export type ValidateExpr =
  | {
      kind: "binary";
      keyword: TokenData;
      operator: "and" | "or";
      lhs: ValidateExpr;
      rhs: ValidateExpr;
    }
  | { kind: "validator"; validator: IdentifierRef<RefValidator>; args: Expr<Code>[] }
  | { kind: "group"; expr: ValidateExpr };

export type ActionAtomSet = {
  kind: "set";
  keyword: TokenData;
  target: IdentifierRef<RefModelField | RefModelReference>;
  set: ActionHook | { kind: "expr"; expr: Expr<Code> };
};
export type ActionAtomReferenceThrough = {
  kind: "referenceThrough";
  keyword: TokenData;
  target: IdentifierRef<RefModelReference>;
  through: IdentifierRef<RefModelAtom>[];
  keywordThrough: TokenData;
};
export type ActionAtomDeny = {
  kind: "deny";
  keyword: TokenData;
  fields:
    | { kind: "all"; keyword: TokenData }
    | {
        kind: "list";
        fields: IdentifierRef<RefModelField | RefModelReference>[];
      };
};
export type ActionAtomInput = {
  kind: "input";
  keyword: TokenData;
  fields: {
    field: IdentifierRef<RefModelField | RefModelReference>;
    atoms: InputAtom[];
  }[];
};
export type InputAtom = { keyword: TokenData } & (
  | { kind: "optional" }
  | { kind: "default"; value: Expr<Code> }
);
export type ExtraInput = {
  kind: "field";
  keyword: TokenData;
  name: IdentifierRef<RefExtraInput>;
  atoms: ExtraInputAtom[];
};

export type ExtraInputAtom = { keyword: TokenData } & (
  | { kind: "type"; identifier: Identifier }
  | { kind: "nullable" }
  | { kind: "validate"; expr: ValidateExpr }
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
  target: IdentifierRef<RefModel | RefModelReference | RefModelRelation>;
  ref?: RefPopulate;
  as?: { keyword: TokenData; identifier: IdentifierRef<RefPopulate> };
  atoms: PopulateAtom[];
};
export type PopulateAtom =
  | {
      kind: "repeat";
      keyword: TokenData;
      as?: { keyword: TokenData; identifier: IdentifierRef<RefRepeat> };
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
  | { kind: "output"; keyword: TokenData; value: StringLiteral };
export type GeneratorClientAtomTarget = "js" | "ts";

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

export type Hook<kind extends "model" | "validator" | "action"> = {
  kind: "hook";
  keyword: TokenData;
  name: kind extends "model" ? IdentifierRef<RefModelHook> : undefined;
  atoms: (
    | { kind: "arg_expr"; keyword: TokenData; name: Identifier; expr: Expr<Code> }
    | (kind extends "validator"
        ? never
        : { kind: "arg_query"; keyword: TokenData; name: Identifier; query: AnonymousQuery })
    | {
        kind: "source";
        keyword: TokenData;
        keywordFrom: TokenData;
        name: Identifier;
        file: StringLiteral;
        runtime?: string;
      }
    | { kind: "inline"; keyword: TokenData; code: StringLiteral }
    | { kind: "runtime"; keyword: TokenData; identifier: Identifier }
  )[];
};
export type ModelHook = Hook<"model">;
export type ValidatorHook = Hook<"validator">;
export type ActionHook = Hook<"action">;

export type AnonymousQuery = {
  kind: "anonymousQuery";
  keyword: TokenData;
  atoms: (QueryAtom | { kind: "select"; keyword: TokenData; select: Select })[];
  type: Type;
};

export type Select = {
  target:
    | { kind: "short"; name: IdentifierRef<RefModelAtom> }
    | { kind: "long"; name: Identifier; expr: Expr<Code> };
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
  | { kind: "array"; elements: Expr<kind>[] }
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

export type RefModel = {
  kind: "model";
  model: string;
};

export type RefModelField = {
  kind: "modelAtom";
  atomKind: "field";
  parentModel: string;
  name: string;
  type: FieldType;
  nullable: boolean;
  unique: boolean;
};
export type RefModelReference = {
  kind: "modelAtom";
  atomKind: "reference";
  parentModel: string;
  name: string;
  model: string;
  unique: boolean;
  nullable: boolean;
};
export type RefModelRelation = {
  kind: "modelAtom";
  atomKind: "relation";
  parentModel: string;
  name: string;
  model: string;
  through: string;
};
export type RefModelQuery = {
  kind: "modelAtom";
  atomKind: "query";
  parentModel: string;
  name: string;
  model: string;
};
export type RefModelComputed = {
  kind: "modelAtom";
  atomKind: "computed";
  parentModel: string;
  name: string;
};
export type RefModelHook = {
  kind: "modelAtom";
  atomKind: "hook";
  parentModel: string;
  name: string;
};

export type RefModelAtom =
  | RefModelField
  | RefModelReference
  | RefModelRelation
  | RefModelQuery
  | RefModelComputed
  | RefModelHook;

export type RefQueryTarget = {
  kind: "queryTarget";
  // TODO: track non-model queries
  parent: RefModelQuery | undefined;
  path: string[];
};
export type RefEntrypoint = {
  kind: "target";
  targetKind: "entrypoint";
  // undefined value simbolizes default api
  api?: string;
  path: string[];
  model: string;
};
export type RefPopulate = {
  kind: "target";
  targetKind: "populate";
  // undefined value simbolizes default api
  populator: string;
  path: string[];
  model: string;
};
// Endpoint is not a ref, but it can be parent to other refs
export type EndpointId =
  | { parent: RefEntrypoint; type: Exclude<EndpointType, "custom"> }
  | {
      parent: RefEntrypoint;
      type: Extract<EndpointType, "custom">;
      method: EndpointMethod;
      cardinality: EndpointCardinality;
      path: string;
    };
export type RefAction = {
  kind: "action";
  parent: EndpointId;
  name: string;
};
export type RefExtraInput = {
  kind: "extraInput";
  parent: EndpointId;
  name: string;
  type: FieldType;
  nullable: boolean;
};
export type RefRepeat = {
  kind: "repeat";
  parent: RefPopulate;
  name: string;
};
export type RefValidator = {
  kind: "validator";
  name: string;
};
export type RefValidatorArg = {
  kind: "validatorArg";
  parent: RefValidator;
  name: string;
  type: FieldType;
};
export type RefAuth = { kind: "auth"; model: string };
export type RefAuthToken = { kind: "authToken" };
export type RefStruct = { kind: "struct" };
export type Ref =
  | RefModel
  | RefModelAtom
  | RefQueryTarget
  | RefEntrypoint
  | RefPopulate
  | RefAction
  | RefRepeat
  | RefValidator
  | RefValidatorArg
  | RefExtraInput
  | RefAuth
  | RefAuthToken
  | RefStruct;

export type Identifier = { text: string; token: TokenData };
export type IdentifierRef<R extends Ref = Ref> = {
  text: string;
  token: TokenData;
  ref?: R;
  isDefinition: boolean;
  type: Type;
};

export type Position = { line: number; column: number };
export type TokenData = {
  filename: string;
  start: Position;
  end: Position;
};
export const zeroToken: TokenData = {
  filename: ":unset:",
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
};
