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
export const LSquare = createToken({ name: "LSquare", pattern: "[" });
export const RSquare = createToken({ name: "RSquare", pattern: "]" });

export const Dot = createToken({ name: "Dot", pattern: "." });
export const Colon = createToken({ name: "Colon", pattern: ":" });

export const Integer = createToken({ name: "Integer", pattern: /\d+/ });
export const Float = createToken({ name: "Float", pattern: /(\d+\.\d*)|\.\d+/ });

// https://github.com/Chevrotain/chevrotain/blob/master/examples/grammars/json/json.js
export const String = createToken({
  name: "String",
  pattern: /"(?:[^\\"]|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
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
export const Validator = createWeakKeyword("validator");
export const Validate = createWeakKeyword("validate");
export const Update = createWeakKeyword("update");
export const Unique = createWeakKeyword("unique");
export const Type = createWeakKeyword("type");
export const Ts = createWeakKeyword("ts");
export const To = createWeakKeyword("to");
export const Through = createWeakKeyword("through");
export const Target = createWeakKeyword("target");
export const Sum = createWeakKeyword("sum");
export const Start = createWeakKeyword("start");
export const Source = createWeakKeyword("source");
export const Set = createWeakKeyword("set");
export const Select = createWeakKeyword("select");
export const Runtime = createWeakKeyword("runtime");
export const Returns = createWeakKeyword("returns");
export const Response = createWeakKeyword("response");
export const Responds = createWeakKeyword("responds");
export const Respond = createWeakKeyword("respond");
export const Required = createWeakKeyword("required");
export const Repeat = createWeakKeyword("repeat");
export const Relation = createWeakKeyword("relation");
export const Reference = createWeakKeyword("reference");
export const Query = createWeakKeyword("query");
export const POST = createWeakKeyword("POST");
export const Populator = createWeakKeyword("populator");
export const Populate = createWeakKeyword("populate");
export const Path = createWeakKeyword("path");
export const PATCH = createWeakKeyword("PATCH");
export const Pageable = createWeakKeyword("pageable");
export const Output = createWeakKeyword("output");
export const Order = createWeakKeyword("order");
export const One = createWeakKeyword("one");
export const On = createWeakKeyword("on");
export const Offset = createWeakKeyword("offset");
export const Nullable = createWeakKeyword("nullable");
export const Model = createWeakKeyword("model");
export const Method = createWeakKeyword("method");
export const Many = createWeakKeyword("many");
export const List = createWeakKeyword("list");
export const Limit = createWeakKeyword("limit");
export const Key = createWeakKeyword("key");
export const Js = createWeakKeyword("js");
export const Inputs = createWeakKeyword("inputs");
export const Input = createWeakKeyword("input");
export const Inline = createWeakKeyword("inline");
export const Identify = createWeakKeyword("identify");
export const HttpStatus = createWeakKeyword("httpStatus");
export const HttpHeaders = createKeyword("httpHeaders");
export const Hook = createWeakKeyword("hook");
export const GET = createWeakKeyword("GET");
export const Get = createWeakKeyword("get");
export const Generate = createWeakKeyword("generate");
export const From = createWeakKeyword("from");
export const First = createWeakKeyword("first");
export const Filter = createWeakKeyword("filter");
export const Field = createWeakKeyword("field");
export const Fetch = createWeakKeyword("fetch");
export const Extra = createWeakKeyword("extra");
export const Execute = createWeakKeyword("execute");
export const Error = createWeakKeyword("error");
export const Entrypoint = createWeakKeyword("entrypoint");
export const Endpoint = createWeakKeyword("endpoint");
export const End = createWeakKeyword("end");
export const Desc = createWeakKeyword("desc");
export const DELETE = createWeakKeyword("DELETE");
export const Delete = createWeakKeyword("delete");
export const Default = createWeakKeyword("default");
export const Custom = createWeakKeyword("custom");
export const Create = createWeakKeyword("create");
export const Count = createWeakKeyword("count");
export const Computed = createWeakKeyword("computed");
export const Code = createWeakKeyword("code");
export const Client = createWeakKeyword("client");
export const Cascade = createWeakKeyword("cascade");
export const Cardinality = createWeakKeyword("cardinality");
export const By = createWeakKeyword("by");
export const Body = createWeakKeyword("body");
export const Basic = createWeakKeyword("basic");
export const Authorize = createWeakKeyword("authorize");
export const Auth = createWeakKeyword("auth");
export const Assert = createWeakKeyword("assert");
export const Asc = createWeakKeyword("asc");
export const As = createWeakKeyword("as");
export const Arg = createWeakKeyword("arg");
export const Api = createWeakKeyword("api");
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
  LSquare,
  RSquare,
  Dot,
  Colon,
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
  Validator,
  Validate,
  Update,
  Unique,
  Type,
  Ts,
  To,
  Through,
  Target,
  Sum,
  Start,
  Source,
  Set,
  Select,
  Runtime,
  Returns,
  Response,
  Responds,
  Respond,
  Repeat,
  Relation,
  Reference,
  Required,
  Query,
  POST,
  Populator,
  Populate,
  Path,
  PATCH,
  Pageable,
  Output,
  Order,
  One,
  On,
  Offset,
  Nullable,
  Model,
  Method,
  Many,
  List,
  Limit,
  Key,
  Js,
  Inputs,
  Input,
  Inline,
  Identify,
  HttpStatus,
  HttpHeaders,
  Hook,
  GET,
  Get,
  Generate,
  From,
  First,
  Filter,
  Field,
  Fetch,
  Extra,
  Execute,
  Error,
  Entrypoint,
  Endpoint,
  End,
  Desc,
  DELETE,
  Delete,
  Default,
  Custom,
  Create,
  Count,
  Computed,
  Code,
  Client,
  Cascade,
  Cardinality,
  By,
  Body,
  Basic,
  Authorize,
  Auth,
  Assert,
  Asc,
  As,
  Arg,
  Api,
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

export const lexer = new Lexer(Object.values(GaudiTokens));
