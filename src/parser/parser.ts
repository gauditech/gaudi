import grammar from "./grammar/gaudi.ohm-bundle.js";

import {
  AST,
  ExpAST,
  FieldAST,
  FieldBodyAST,
  ModelAST,
  QueryAST,
  QueryBodyAST,
  ReferenceAST,
  ReferenceBodyAST,
  RelationAST,
  RelationBodyAST,
} from "@src/types/ast";

const semantics = grammar.createSemantics();

semantics.addOperation("parse()", {
  Definition(models) {
    return { models: models.parse() };
  },
  Model(_model, identifier, _parenL, body, _parenR): ModelAST {
    return { name: identifier.parse(), body: body.parse() };
  },
  Field(_field, identifier, _parenL, body, _parenR): FieldAST {
    return { kind: "field", name: identifier.parse(), body: body.parse() };
  },
  FieldBody_type(_type, identifier): FieldBodyAST {
    return { type: identifier.parse() };
  },
  FieldBody_default(_default, literal): FieldBodyAST {
    return { default: literal.parse() };
  },
  FieldBody_tag(tag) {
    return tag.sourceString;
  },
  Reference(_reference, identifier, _parenL, body, _parenR): ReferenceAST {
    return { kind: "reference", name: identifier.parse(), body: body.parse() };
  },
  ReferenceBody_to(_to, identifier): ReferenceBodyAST {
    return { to: identifier.parse() };
  },
  ReferenceBody_tag(tag) {
    return tag.sourceString;
  },
  Relation(_relation, identifier, _parenL, body, _parenR): RelationAST {
    return { kind: "relation", name: identifier.parse(), body: body.parse() };
  },
  RelationBody_from(_from, identifier): RelationBodyAST {
    return { from: identifier.parse() };
  },
  RelationBody_through(_from, identifier): RelationBodyAST {
    return { through: identifier.parse() };
  },
  Query(_query, identifier, _parenL, body, _parenR): QueryAST {
    return { kind: "query", name: identifier.parse(), body: body.parse() };
  },
  QueryBody_from(_from, identifier): QueryBodyAST {
    return { from: identifier.parse() };
  },
  QueryBody_filter(_filter, exp): QueryBodyAST {
    return { filter: exp.parse() };
  },
  OrExp_or(lhs, _or, rhs): ExpAST {
    return { kind: "binary", operator: "or", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  AndExp_and(lhs, _and, rhs): ExpAST {
    return { kind: "binary", operator: "and", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  EqExp_eq(lhs, _eq, rhs): ExpAST {
    return { kind: "binary", operator: "==", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  EqExp_neq(lhs, _neq, rhs): ExpAST {
    return { kind: "binary", operator: "!=", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  InExp_in(lhs, _in, rhs): ExpAST {
    return { kind: "binary", operator: "in", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  CompExp_lt(lhs, _lt, rhs): ExpAST {
    return { kind: "binary", operator: "<", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  CompExp_lteq(lhs, _lteq, rhs): ExpAST {
    return { kind: "binary", operator: "<=", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  CompExp_gt(lhs, _gt, rhs): ExpAST {
    return { kind: "binary", operator: ">", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  CompExp_gteq(lhs, _gteq, rhs): ExpAST {
    return { kind: "binary", operator: ">=", lhs: lhs.parse(), rhs: rhs.parse() };
  },
  PrimaryExp_paren(_parenL, exp, _parenR): ExpAST {
    return { kind: "paren", exp: exp.parse() };
  },
  PrimaryExp_not(_not, exp): ExpAST {
    return { kind: "unary", operator: "!", exp: exp.parse() };
  },
  PrimaryExp_identifier(identifier): ExpAST {
    return { kind: "identifier", name: identifier.parse() };
  },
  PrimaryExp_literal(literal): ExpAST {
    return { kind: "literal", value: literal.parse() };
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
  identifier(this, _letter, _alnum) {
    return this.sourceString;
  },
  NewlineBody_empty() {
    return [];
  },
  NonemptyNewlineBody(head, _delimiter, tail, _delimiterTail) {
    return [head.parse(), ...tail.children.map((child) => child.parse())];
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
