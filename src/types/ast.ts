export type AST = {
  models: ModelAST[];
};

export type ModelAST = {
  name: string;
  body: ModelBodyAST[];
};

export type ModelBodyAST = FieldAST | ReferenceAST | RelationAST;

export type FieldAST = {
  kind: "field";
  name: string;
  body: FieldBodyAST[];
};

export type FieldBodyAST = { type: string } | { default: unknown } | "nullable" | "unique";

export type ReferenceAST = {
  kind: "reference";
  name: string;
  body: ReferenceBodyAST[];
};

export type ReferenceBodyAST = { to: string } | "nullable" | "unique";

export type RelationAST = {
  kind: "relation";
  name: string;
  body: RelationBodyAST[];
};

export type RelationBodyAST = { from: string } | { through: string };
