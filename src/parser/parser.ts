import grammar from "./grammar/gaudi.ohm-bundle.js";

import {
  AST,
  FieldAST,
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
  FieldBody(body) {
    return body.parse();
  },
  TypeDefinition(_type, type) {
    return { type: type.parse() };
  },
  Type(type) {
    return type.sourceString;
  },
  FieldTag(tag) {
    return tag.sourceString;
  },
  Reference(_reference, identifier, _parenL, body, _parenR): ReferenceAST {
    return { kind: "reference", name: identifier.parse(), body: body.parse() };
  },
  ReferenceBody(_to, identifier): ReferenceBodyAST {
    return { to: identifier.parse() };
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
  if (m.succeeded()) {
    console.log("Success");
  } else {
    console.log("Fail");
    console.log(m.message);
  }

  const ast: AST = semantics(m).parse();

  return ast;
}
