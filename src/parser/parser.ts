import grammar from "./grammar/gaudi.ohm-bundle.js";

import {
  AST,
  ComputedAST,
  ExpAST,
  FieldAST,
  FieldBodyAST,
  FieldTag,
  ModelAST,
  QueryAST,
  QueryBodyAST,
  ReferenceAST,
  ReferenceBodyAST,
  ReferenceTag,
  RelationAST,
  RelationBodyAST,
} from "@src/types/ast";

const semantics = grammar.createSemantics();

semantics.addOperation("parse()", {
  Definition(models) {
    return { models: models.parse() };
  },
  Model(this, _model, identifier, _parenL, body, _parenR): ModelAST {
    return { name: identifier.parse(), body: body.parse(), interval: this.source };
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
  QueryBody_from(this, _from, identifier): QueryBodyAST {
    return { from: identifier.parse(), interval: this.source };
  },
  QueryBody_filter(this, _filter, exp): QueryBodyAST {
    return { filter: exp.parse(), interval: this.source };
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
  IdentifierPath(this, head, _dot, tail): string[] {
    return [head.parse(), ...tail.children.map((child) => child.parse())];
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
});

export function parse(input: string): AST {
  const m = grammar.match(input);
  if (!m.succeeded()) {
    throw Error(m.message);
  }

  const ast: AST = semantics(m).parse();

  return ast;
}
