import grammar from "./grammar/gaudi.ohm-bundle.js";

import {
  AST,
  FieldAST,
  FieldBodyAST,
  ModelAST,
  ModelBodyAST,
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
  ModelBody(part): ModelBodyAST {
    return part.parse();
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
  literal(literal) {
    return literal.parse();
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
  NewlineBody(body) {
    return body.parse();
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
