import { WithContext } from "@src/common/error";

export type AST = DefinitionAST[];

export type DefinitionAST = ModelAST | EntrypointAST | PopulatorAST;

export type ModelAST = WithContext<{
  kind: "model";
  name: string;
  alias?: string;
  body: ModelBodyAST[];
  isAuth: boolean;
}>;

export type ModelBodyAST = FieldAST | ReferenceAST | RelationAST | QueryAST | ComputedAST | HookAST;

export type FieldAST = WithContext<{
  kind: "field";
  name: string;
  body: FieldBodyAST[];
}>;

export type FieldBodyAST = WithContext<
  | { kind: "type"; type: string }
  | { kind: "default"; default: LiteralValue }
  | { kind: "tag"; tag: FieldTag }
  | { kind: "validate"; validators: ValidatorAST[] }
>;

export type ValidatorAST = WithContext<
  { kind: "hook"; hook: HookAST } | { kind: "builtin"; name: string; args: LiteralValue[] }
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
  | { kind: "from"; from: string[]; alias?: string[] }
  | { kind: "filter"; filter: ExpAST }
  | { kind: "orderBy"; orderings: QueryOrderAST[] }
  | { kind: "limit"; limit: number }
  | { kind: "offset"; offset: number }
  | { kind: "select"; select: SelectAST }
  | { kind: "aggregate"; name: string }
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
  | { kind: "function"; name: string; args: ExpAST[] }
>;

export type EntrypointAST = WithContext<{
  kind: "entrypoint";
  name: string;
  body: EntrypointBodyAST[];
}>;

export type EntrypointBodyAST = WithContext<
  | { kind: "target"; target: { kind: "model" | "relation"; identifier: string; alias?: string } }
  | { kind: "identify"; identifier: string }
  | { kind: "response"; select: SelectAST }
  | { kind: "authorize"; expression: ExpAST }
  | { kind: "endpoint"; endpoint: EndpointAST }
  | { kind: "entrypoint"; entrypoint: EntrypointAST }
>;

export type SelectAST = WithContext<{
  select?: Record<string, SelectAST>;
}>;

export type EndpointAST = WithContext<{
  type: EndpointType;
  body: EndpointBodyAST[];
}>;

export type EndpointType = "list" | "get" | "create" | "update" | "delete";

export type EndpointBodyAST = WithContext<
  { kind: "action"; body: ActionBodyAST[] } | { kind: "authorize"; expression: ExpAST }
>;

export type ActionKindAST = "create" | "update" | "delete";

export type ActionBodyAST = WithContext<{
  kind: ActionKindAST;
  target?: string[];
  alias?: string;
  body: ActionAtomBodyAST[];
}>;

export type ActionAtomBodyAST = WithContext<
  | {
      kind: "set";
      target: string;
      set:
        | { kind: "hook"; hook: HookAST }
        | { kind: "literal"; value: LiteralValue }
        | { kind: "reference"; reference: string[] };
    }
  | { kind: "reference"; target: string; through: string }
  | { kind: "input"; fields: InputFieldAST[] }
  | { kind: "action"; body: ActionBodyAST }
  | { kind: "deny"; fields: "*" | string[] }
>;

export type InputFieldAST = WithContext<{
  name: string;
  opts: InputFieldOptAST[];
}>;

export type InputFieldOptAST = WithContext<
  | { kind: "optional" }
  | { kind: "default-value"; value: LiteralValue }
  | { kind: "default-reference"; path: string[] }
>;

export type HookAST = WithContext<{
  kind: "hook";
  name?: string;
  body: HookBodyAST[];
}>;

export type HookBodyAST = WithContext<
  | { kind: "arg"; name: string; value: HookArgValueAST }
  | { kind: "returnType"; type: string }
  | { kind: "source"; target: string; file: string }
  | { kind: "inline"; inline: string }
>;

export type HookArgValueAST = WithContext<
  | { kind: "query"; query: HookQueryAST }
  | { kind: "literal"; literal: LiteralValue }
  | { kind: "reference"; reference: string[] }
  | { kind: "default" }
>;

export type HookQueryAST = WithContext<{
  kind: "query";
  body: QueryBodyAST[];
}>;

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
  | ">="
  | "+"
  | "-"
  | "/"
  | "*";

export type UnaryOperator = "not";

// ----- Populators

export type PopulatorAST = WithContext<{
  kind: "populator";
  name: string;
  body: PopulateAST[];
}>;

export type PopulateAST = WithContext<{
  kind: "populate";
  name: string;
  body: PopulateBodyAST[];
}>;
export type PopulateBodyAST = WithContext<
  | { kind: "target"; target: { kind: "model" | "relation"; identifier: string; alias?: string } }
  | { kind: "identify"; identifier: string }
  | { kind: "repeat"; repeat: RepeaterAST }
  | { kind: "set"; target: string; set: PopulateSetterValueAST }
  | { kind: "populate"; populate: PopulateAST }
  // TODO: hints
>;

export type PopulateSetterValueAST = WithContext<
  | { kind: "literal"; value: LiteralValue }
  | { kind: "reference"; reference: string[] }
  | { kind: "hook"; hook: HookAST }
>;

export type RepeaterAST = WithContext<{
  alias?: string;
  atoms: RepeaterAtomAST[];
}>;

export type RepeaterAtomAST = WithContext<
  | { kind: "fixed"; value: number }
  | { kind: "start"; value: number }
  | { kind: "end"; value: number }
>;
