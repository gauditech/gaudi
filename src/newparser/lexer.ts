import { Lexer, TokenType, createToken } from "chevrotain";

const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});
const Comment = createToken({ name: "Comment", pattern: /\/\/.*/, group: Lexer.SKIPPED });

export const Comma = createToken({ name: "Comma", pattern: "," });

export const LCurly = createToken({ name: "LCurly", pattern: "{" });
export const RCurly = createToken({ name: "RCurly", pattern: "}" });
export const LRound = createToken({ name: "LRound", pattern: "(" });
export const RRound = createToken({ name: "RRound", pattern: ")" });

export const Dot = createToken({ name: "Dot", pattern: "." });

export const Integer = createToken({ name: "Integer", pattern: /\d+/ });
export const Float = createToken({ name: "Float", pattern: /(\d+\.\d*)|\.\d+/ });
export const String = createToken({
  name: "String",
  pattern: /(["'])((\\{2})*|(.*?[^\\](\\{2})*))\1/,
});

export const Identifier = createToken({ name: "Identifier", pattern: Lexer.NA });

const IdentifierBase = createToken({
  name: "IdentifierBase",
  pattern: /[a-zA-Z_@]\w*/,
  categories: [Identifier],
});

export const Mul = createOperator("Mul", "*");
export const Div = createOperator("Div", "/");
export const Add = createOperator("Add", "+");
export const Sub = createOperator("Sub", "-");
export const Gte = createOperator("Gte", ">=");
export const Gt = createOperator("Gt", ">");
export const Lte = createOperator("Lte", "<=");
export const Lt = createOperator("Lt", "<");

export const With = createWeakKeyword("with");
export const Validate = createWeakKeyword("validate");
export const Update = createWeakKeyword("update");
export const Unique = createWeakKeyword("unique");
export const Type = createWeakKeyword("type");
export const To = createWeakKeyword("to");
export const Through = createWeakKeyword("through");
export const Target = createWeakKeyword("target");
export const Sum = createWeakKeyword("sum");
export const Start = createWeakKeyword("start");
export const Source = createWeakKeyword("source");
export const Set = createWeakKeyword("set");
export const Select = createWeakKeyword("select");
export const Returns = createWeakKeyword("returns");
export const Response = createWeakKeyword("response");
export const Repeat = createWeakKeyword("repeat");
export const Relation = createWeakKeyword("relation");
export const Reference = createWeakKeyword("reference");
export const Query = createWeakKeyword("query");
export const Populator = createWeakKeyword("populator");
export const Populate = createWeakKeyword("populate");
export const Order = createWeakKeyword("order");
export const Optional = createWeakKeyword("optional");
export const Offset = createWeakKeyword("offset");
export const Nullable = createWeakKeyword("nullable");
export const Model = createWeakKeyword("model");
export const List = createWeakKeyword("list");
export const Limit = createWeakKeyword("limit");
export const Input = createWeakKeyword("input");
export const Inline = createWeakKeyword("inline");
export const Identify = createWeakKeyword("identify");
export const Hook = createWeakKeyword("hook");
export const Get = createWeakKeyword("get");
export const From = createWeakKeyword("from");
export const Filter = createWeakKeyword("filter");
export const Field = createWeakKeyword("field");
export const Entrypoint = createWeakKeyword("entrypoint");
export const Endpoint = createWeakKeyword("endpoint");
export const End = createWeakKeyword("end");
export const Desc = createWeakKeyword("desc");
export const Deny = createWeakKeyword("deny");
export const Delete = createWeakKeyword("delete");
export const Default = createWeakKeyword("default");
export const Create = createWeakKeyword("create");
export const Count = createWeakKeyword("count");
export const Computed = createWeakKeyword("computed");
export const By = createWeakKeyword("by");
export const Authorize = createWeakKeyword("authorize");
export const Auth = createWeakKeyword("auth");
export const Asc = createWeakKeyword("asc");
export const As = createWeakKeyword("as");
export const Arg = createWeakKeyword("arg");
export const Action = createWeakKeyword("action");

export const Null = createKeyword("null");
export const True = createKeyword("true");
export const False = createKeyword("false");
export const Or = createKeyword("or");
export const And = createKeyword("and");
export const Is = createKeyword("is");
export const Not = createKeyword("not");
export const In = createKeyword("in");

function createWeakKeyword(keyword: string, longer_alt?: TokenType) {
  return createToken({
    name: keyword.substring(0, 1).toUpperCase() + keyword.substring(1),
    pattern: keyword,
    longer_alt: longer_alt ? [longer_alt, IdentifierBase] : IdentifierBase,
    categories: [Identifier],
  });
}

function createKeyword(keyword: string) {
  return createToken({
    name: keyword.substring(0, 1).toUpperCase() + keyword.substring(1),
    pattern: keyword,
    longer_alt: IdentifierBase,
  });
}

function createOperator(name: string, operator: string) {
  return createToken({ name, pattern: operator });
}

export const GaudiTokens = [
  WhiteSpace,
  Comment,
  Comma,
  LCurly,
  RCurly,
  LRound,
  RRound,
  Dot,
  Mul,
  Div,
  Add,
  Sub,
  Gte,
  Gt,
  Lte,
  Lt,
  Integer,
  Float,
  String,
  With,
  Validate,
  Update,
  Unique,
  Type,
  To,
  Through,
  Target,
  Sum,
  Start,
  Source,
  Set,
  Select,
  Returns,
  Response,
  Repeat,
  Relation,
  Reference,
  Query,
  Populator,
  Populate,
  Order,
  Optional,
  Offset,
  Nullable,
  Model,
  List,
  Limit,
  Input,
  Inline,
  Identify,
  Hook,
  Get,
  From,
  Filter,
  Field,
  Entrypoint,
  Endpoint,
  End,
  Desc,
  Deny,
  Delete,
  Default,
  Create,
  Count,
  Computed,
  By,
  Authorize,
  Auth,
  Asc,
  As,
  Arg,
  Action,
  Null,
  True,
  False,
  Or,
  And,
  Is,
  Not,
  In,
  IdentifierBase,
  Identifier,
];

export const GaudiLexer = new Lexer(Object.values(GaudiTokens));
