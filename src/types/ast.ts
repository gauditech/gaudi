import { WithContext } from "@src/common/error";

export type AST = DefinitionAST[];

export type DefinitionAST = ModelAST | EntrypointAST | PopulatorAST | ExecutionRuntimeAST;

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
  type: EndpointTypeAST;
  body: EndpointBodyAST[];
}>;

export type EndpointTypeAST = "list" | "get" | "create" | "update" | "delete" | "custom";
export type EndpointCardinality = "one" | "many";
export type EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type EndpointBodyAST = WithContext<
  | { kind: "action-block"; atoms: ActionBodyAST[] }
  | { kind: "authorize"; expression: ExpAST }
  | { kind: "cardinality"; value: EndpointCardinality }
  | { kind: "path"; value: string }
  | { kind: "method"; value: EndpointMethod }
>;

export type ActionKindAST = "create" | "update" | "delete";

export type ActionBodyAST = WithContext<{
  kind: ActionKindAST;
  target?: string[];
  alias?: string;
  atoms: ActionAtomAST[];
}>;

export type VirtualInputAST = WithContext<{
  kind: "virtual-input";
  name: string;
  atoms: VirtualInputAtomAST[];
}>;

export type VirtualInputAtomAST = WithContext<
  | { kind: "optional" }
  | { kind: "nullable" }
  | VirtualInputAtomASTType
  | VirtualInputAtomASTValidator
>;

export type VirtualInputAtomASTType = { kind: "type"; type: string };
export type VirtualInputAtomASTValidator = { kind: "validate"; validators: ValidatorAST[] };

export type ActionAtomAST = WithContext<
  | {
      kind: "set";
      target: string;
      set: { kind: "hook"; hook: HookAST } | { kind: "expression"; exp: ExpAST };
    }
  | { kind: "reference"; target: string; through: string }
  | VirtualInputAST
  | { kind: "input"; fields: InputFieldAST[] }
  | { kind: "action"; body: ActionBodyAST }
  | { kind: "deny"; fields: "*" | string[] }
  | { kind: "hook"; hook: HookAST }
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
  | { kind: "execution-runtime"; name: string }
>;

export type HookArgValueAST = WithContext<
  { kind: "query"; query: HookQueryAST } | { kind: "expression"; exp: ExpAST } | { kind: "default" }
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
  | {
      kind: "set";
      target: string;
      set: // TODO: hints
      { kind: "hook"; hook: HookAST } | { kind: "expression"; exp: ExpAST };
    }
  | { kind: "populate"; populate: PopulateAST }
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

// ----- Execution Runtime

export type ExecutionRuntimeAST = WithContext<{
  kind: "execution-runtime";
  name: string;
  body: ExecutionRuntimeBodyAtomAST[];
}>;

export type ExecutionRuntimeBodyAtomAST = WithContext<
  { kind: "sourcePath"; value: string } | { kind: "default" }
>;
