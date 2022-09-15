import {
  AST,
  ExpAST,
  FieldAST,
  LiteralValue,
  ModelAST,
  QueryAST,
  ReferenceAST,
  RelationAST,
} from "@src/types/ast";
import {
  ExpSpec,
  FieldSpec,
  ModelSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  Specification,
} from "@src/types/specification";

function compileField(field: FieldAST): FieldSpec {
  let type = "unknown";
  let default_: LiteralValue;
  let nullable: boolean;
  let unique: boolean;
  field.body.forEach((b) => {
    if (b === "nullable") {
      nullable = true;
    } else if (b === "unique") {
      unique = true;
    } else if ("type" in b) {
      type = b.type;
    } else if ("default" in b) {
      default_ = b.default;
    }
  });

  return { name: field.name, type, default: default_, nullable, unique };
}

function compileReference(reference: ReferenceAST): ReferenceSpec {
  let toModel: string;
  let nullable: boolean;
  let unique: boolean;
  reference.body.forEach((b) => {
    if (b === "nullable") {
      nullable = true;
    } else if (b === "unique") {
      unique = true;
    } else {
      toModel = b.to;
    }
  });

  return { name: reference.name, toModel, nullable, unique };
}

function compileRelation(relation: RelationAST): RelationSpec {
  let fromModel: string;
  let through: string;
  relation.body.forEach((b) => {
    if ("from" in b) {
      fromModel = b.from;
    } else {
      through = b.through;
    }
  });

  return { name: relation.name, fromModel, through };
}

function compileQuery(query: QueryAST): QuerySpec {
  let fromModel: string;
  let filter: ExpSpec;
  query.body.forEach((b) => {
    if ("from" in b) {
      fromModel = b.from;
    } else {
      filter = compileQueryExp(b.filter);
    }
  });

  return { name: query.name, fromModel, filter };
}

function compileQueryExp(exp: ExpAST): ExpSpec {
  if (exp.kind === "paren") {
    return compileQueryExp(exp.exp);
  } else if (exp.kind === "binary") {
    return {
      kind: "binary",
      operator: exp.operator,
      lhs: compileQueryExp(exp.lhs),
      rhs: compileQueryExp(exp.rhs),
    };
  } else if (exp.kind === "unary") {
    return { kind: "unary", operator: exp.operator, exp: compileQueryExp(exp.exp) };
  } else {
    return exp;
  }
}

function compileModel(model: ModelAST): ModelSpec {
  const fields: FieldSpec[] = [];
  const references: ReferenceSpec[] = [];
  const relations: RelationSpec[] = [];
  const queries: QuerySpec[] = [];

  model.body.forEach((b) => {
    if (b.kind === "field") {
      fields.push(compileField(b));
    } else if (b.kind === "reference") {
      references.push(compileReference(b));
    } else if (b.kind === "relation") {
      relations.push(compileRelation(b));
    } else if (b.kind === "query") {
      queries.push(compileQuery(b));
    }
  });

  return { name: model.name, fields, references, relations, queries };
}

export function compile(input: AST): Specification {
  return { models: input.models.map(compileModel) };
}
