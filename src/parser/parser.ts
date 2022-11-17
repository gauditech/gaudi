import grammar from "./grammar/gaudi.ohm-bundle.js";

import {
  AST,
  ActionAtomBodyAST,
  ActionBodyAST,
  ActionKindAST,
  ComputedAST,
  EndpointAST,
  EndpointBodyAST,
  EndpointType,
  EntrypointAST,
  EntrypointBodyAST,
  ExpAST,
  FieldAST,
  FieldBodyAST,
  FieldTag,
  HookAST,
  HookBodyAST,
  ModelAST,
  QueryAST,
  QueryBodyAST,
  QueryOrderAST,
  ReferenceAST,
  ReferenceBodyAST,
  ReferenceTag,
  RelationAST,
  RelationBodyAST,
  SelectAST,
} from "@src/types/ast";

const semantics = grammar.createSemantics();

semantics.addOperation("parse()", {
  Definition(definitions) {
    return definitions.parse();
  },
  Model(this, _model, identifierAs, _parenL, body, _parenR): ModelAST {
    const [name, alias] = identifierAs.parse();
    return { kind: "model", name, alias, body: body.parse(), interval: this.source };
  },
  Field(this, _field, identifier, _parenL, body, _parenR): FieldAST {
    return {
      kind: "field",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  FieldBody_type(this, _type, identifier): FieldBodyAST {
    return { kind: "type", type: identifier.parse(), interval: this.source };
  },
  FieldBody_default(this, _default, literal): FieldBodyAST {
    return { kind: "default", default: literal.parse(), interval: this.source };
  },
  FieldBody_tag(this, tag): FieldBodyAST {
    return { kind: "tag", tag: tag.sourceString as FieldTag, interval: this.source };
  },
  FieldBody_validate(this, _validate, _parenL, body, _parenR): FieldBodyAST {
    return { kind: "validate", validators: body.parse(), interval: this.source };
  },
  Validator(this, name, args) {
    return {
      name: name.parse(),
      args: args.children.map((c) => c.parse()),
      interval: this.source,
    };
  },
  Reference(this, _reference, identifier, _parenL, body, _parenR): ReferenceAST {
    return {
      kind: "reference",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  ReferenceBody_to(this, _to, identifier): ReferenceBodyAST {
    return { kind: "to", to: identifier.parse(), interval: this.source };
  },
  ReferenceBody_tag(this, tag): ReferenceBodyAST {
    return { kind: "tag", tag: tag.sourceString as ReferenceTag, interval: this.source };
  },
  Relation(this, _relation, identifier, _parenL, body, _parenR): RelationAST {
    return {
      kind: "relation",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  RelationBody_from(this, _from, identifier): RelationBodyAST {
    return { kind: "from", from: identifier.parse(), interval: this.source };
  },
  RelationBody_through(this, _from, identifier): RelationBodyAST {
    return { kind: "through", through: identifier.parse(), interval: this.source };
  },
  Query(this, _query, identifier, _parenL, body, _parenR): QueryAST {
    return {
      kind: "query",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  QueryBody_from(this, _from, identifierAs): QueryBodyAST {
    const [from, alias] = identifierAs.parse();
    return { kind: "from", from, alias, interval: this.source };
  },
  QueryBody_filter(this, _filter, exp): QueryBodyAST {
    return { kind: "filter", filter: exp.parse(), interval: this.source };
  },
  QueryBody_order_by(this, _order, _by, fields): QueryBodyAST {
    return { kind: "orderBy", orderings: fields.parse(), interval: this.source };
  },
  QueryBody_limit(this, _limit, limit): QueryBodyAST {
    return { kind: "limit", limit: limit.parse(), interval: this.source };
  },
  QueryOrder(this, field, orderNode): QueryOrderAST {
    const order =
      orderNode.sourceString === "asc"
        ? "asc"
        : orderNode.sourceString === "desc"
        ? "desc"
        : undefined;
    return { field: field.parse(), order, interval: this.source };
  },
  Computed(this, _computed, identifier, _parenL, exp, _parenR): ComputedAST {
    return {
      kind: "computed",
      name: identifier.parse(),
      exp: exp.parse(),
      interval: this.source,
    };
  },
  OrExp_or(this, lhs, _or, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "or",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  AndExp_and(this, lhs, _and, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "and",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  IsExp_is_not(this, lhs, _is, _not, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "is not",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  IsExp_is(this, lhs, _is, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "is",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  InExp_not_in(this, lhs, _not, _in, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "not in",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  InExp_in(this, lhs, _in, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "in",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  CompExp_lt(this, lhs, _lt, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "<",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  CompExp_lteq(this, lhs, _lteq, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "<=",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  CompExp_gt(this, lhs, _gt, rhs): ExpAST {
    return {
      kind: "binary",
      operator: ">",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  CompExp_gteq(this, lhs, _gteq, rhs): ExpAST {
    return {
      kind: "binary",
      operator: ">=",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  PrimaryExp_paren(this, _parenL, exp, _parenR): ExpAST {
    return { kind: "paren", exp: exp.parse(), interval: this.source };
  },
  PrimaryExp_not(this, _not, exp): ExpAST {
    return { kind: "unary", operator: "not", exp: exp.parse(), interval: this.source };
  },
  PrimaryExp_identifier(this, identifier): ExpAST {
    return { kind: "identifier", identifier: identifier.parse(), interval: this.source };
  },
  PrimaryExp_literal(this, literal): ExpAST {
    return { kind: "literal", literal: literal.parse(), interval: this.source };
  },
  Entrypoint(this, _entrypoint, identifier, _braceL, body, _braceR): EntrypointAST {
    return {
      kind: "entrypoint",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  EntrypointBody_target(this, _target, kind, identifierAs): EntrypointBodyAST {
    const [identifier, alias] = identifierAs.parse();
    return {
      kind: "target",
      target: { kind: kind.sourceString as "model" | "relation", identifier, alias },
      interval: this.source,
    };
  },
  EntrypointBody_identify(this, _identify, _with, identifier): EntrypointBodyAST {
    return { kind: "identify", identifier: identifier.parse(), interval: this.source };
  },
  EntrypointBody_response(this, _response, body): EntrypointBodyAST {
    return { kind: "response", select: body.parse(), interval: this.source };
  },
  EntrypointBody_endpoint(this, endpoint): EntrypointBodyAST {
    return { kind: "endpoint", endpoint: endpoint.parse() };
  },
  EntrypointBody_entrypoint(this, entrypoint): EntrypointBodyAST {
    return { kind: "entrypoint", entrypoint: entrypoint.parse() };
  },
  SelectBody(this, _braceL, body, _braceR): SelectAST {
    return { select: Object.fromEntries(body.parse()), interval: this.source };
  },
  Select_nested(this, name, nested): [string, SelectAST] {
    return [name.parse(), nested.parse()];
  },
  Select_single(this, name): [string, SelectAST] {
    return [name.parse(), { interval: this.source }];
  },
  Endpoint(this, endpointType, _endpoint, _braceL, body, _braceR): EndpointAST {
    return {
      type: endpointType.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  EndpointType(endpointType): EndpointType {
    return endpointType.sourceString as EndpointType;
  },
  EndpointBody_action(this, _action, _braceL, body, _braceR): EndpointBodyAST {
    return { kind: "action", body: body.parse(), interval: this.source };
  },
  Hook(this, _hook, identifier, _braceL, body, _braceR): HookAST {
    return {
      kind: "hook",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  HookBody_argument(this, _arg, nameIdentifier, typeIdentifier): HookBodyAST {
    return {
      kind: "arg",
      name: nameIdentifier.parse(),
      type: typeIdentifier.parse(),
      interval: this.source,
    };
  },
  HookBody_return_type(this, _returns, identifier): HookBodyAST {
    return { kind: "returnType", type: identifier.parse(), interval: this.source };
  },
  HookBody_inline_body(this, _inline, bodystr): HookBodyAST {
    return { kind: "inlineBody", inlineBody: bodystr.parse() };
  },
  ActionBody_default(this, kind, _braceL, body, _braceR): ActionBodyAST {
    return {
      kind: kind.sourceString as ActionKindAST,
      body: body.parse(),
      interval: this.source,
    };
  },
  ActionBody_named(this, kind, name, _braceL, body, _braceR): ActionBodyAST {
    return {
      kind: kind.sourceString as ActionKindAST,
      target: name.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  ActionBody_aliased(this, kind, name, _as, alias, _braceL, body, _braceR): ActionBodyAST {
    return {
      kind: kind.sourceString as ActionKindAST,
      target: name.parse(),
      alias: alias.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  ActionAtomBody_set_value(this, _set, identifier, value): ActionAtomBodyAST {
    return {
      kind: "set",
      target: identifier.parse(),
      set: { kind: "value", value: value.parse() },
      interval: this.source,
    };
  },
  ActionAtomBody_set_reference(this, _set, identifier, reference): ActionAtomBodyAST {
    return {
      kind: "set",
      target: identifier.parse(),
      set: { kind: "reference", reference: reference.parse() },
      interval: this.source,
    };
  },
  ActionAtomBody_reference(this, _reference, identifier, _through, through): ActionAtomBodyAST {
    return {
      kind: "reference",
      target: identifier.parse(),
      through: through.parse(),
      interval: this.source,
    };
  },
  ActionAtomBody_deny(this, _deny, body) {
    return {
      kind: "deny",
      fields: body.parse(),
    };
  },
  ActionAtomBody_nested_action(this, action): ActionAtomBodyAST {
    return {
      kind: "action",
      body: action.parse(),
    };
  },
  DenyPath_all(this, _asteriks) {
    return "*";
  },
  DenyPath_some(this, _braceL, fields, _braceR) {
    return fields.parse();
  },
  IdentifierPath(this, head, _dot, tail): string[] {
    return [head.parse(), ...tail.children.map((child) => child.parse())];
  },
  IdentifierWithAs_identifier(this, identifier) {
    return [identifier.parse(), undefined];
  },
  IdentifierWithAs_identifier_as(this, identifier, _as, alias) {
    return [identifier.parse(), alias.parse()];
  },
  IdentifierPathWithAs_identifier(this, identifier) {
    return [identifier.parse(), undefined];
  },
  IdentifierPathWithAs_identifier_as(this, identifier, _as, alias) {
    return [identifier.parse(), alias.parse()];
  },
  null(_null) {
    return null;
  },
  boolean(boolean) {
    return boolean.sourceString === "true";
  },
  integer(this, _integer) {
    return parseInt(this.sourceString);
  },
  float(this, _floatMajor, _dot, _floatMinor) {
    return parseFloat(this.sourceString);
  },
  string(_openQuote, string, _closeQuote) {
    return string.sourceString;
  },
  multiLineString(this, _tickL, body, _tickR): string {
    return body.sourceString;
  },
  identifier(this, _letter, _alnum) {
    return this.sourceString;
  },
  OptionalBraces_no_braces(exp) {
    return exp.parse();
  },
  OptionalBraces_braces(_braceL, exp, _braceR) {
    return exp.parse();
  },
  NewlineBody_empty() {
    return [];
  },
  NonemptyNewlineBody(head, _delimiter, tail, _delimiterTail) {
    return [head.parse(), ...tail.children.map((child) => child.parse())];
  },
  NonemptyListOf(this, head, _seperator, tail) {
    return [head.parse(), ...tail.children.map((c) => c.parse())];
  },
});

export function parse(input: string): AST {
  const m = grammar.match(input);
  if (!m.succeeded()) {
    throw Error(m.message);
  }

  const ast: AST = semantics(m).parse();

  return ast;
}
