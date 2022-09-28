import { CompilerError } from "@src/common/error";
import {
  AST,
  ComputedAST,
  ExpAST,
  FieldAST,
  LiteralValue,
  ModelAST,
  QueryAST,
  ReferenceAST,
  RelationAST,
} from "@src/types/ast";
import {
  ComputedSpec,
  ExpSpec,
  FieldSpec,
  ModelSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  Specification,
} from "@src/types/specification";

function compileField(field: FieldAST): FieldSpec {
  let type: string | undefined;
  let default_: LiteralValue | undefined;
  let nullable: boolean | undefined;
  let unique: boolean | undefined;

  field.body.forEach((b) => {
    if (b.kind === "tag") {
      if (b.tag === "nullable") {
        nullable = true;
      } else if (b.tag === "unique") {
        unique = true;
      }
    } else if (b.kind === "type") {
      type = b.type;
    } else if (b.kind === "default") {
      default_ = b.default;
    }
  });

  if (type === undefined) {
    throw new CompilerError("'field' has no 'type'", field);
  }

  return { name: field.name, type, default: default_, nullable, unique, interval: field.interval };
}

function compileReference(reference: ReferenceAST): ReferenceSpec {
  let toModel: string | undefined;
  let nullable: boolean | undefined;
  let unique: boolean | undefined;

  reference.body.forEach((b) => {
    if (b.kind === "tag") {
      if (b.tag === "nullable") {
        nullable = true;
      } else if (b.tag === "unique") {
        unique = true;
      }
    } else if (b.kind === "to") {
      toModel = b.to;
    }
  });

  if (toModel === undefined) {
    throw new CompilerError("'reference' has no 'to' model", reference);
  }

  return { name: reference.name, toModel, nullable, unique, interval: reference.interval };
}

function compileRelation(relation: RelationAST): RelationSpec {
  let fromModel: string | undefined;
  let through: string | undefined;

  relation.body.forEach((b) => {
    if (b.kind === "from") {
      fromModel = b.from;
    } else if (b.kind === "through") {
      through = b.through;
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'relation' has no 'from' model", relation);
  }
  if (through === undefined) {
    throw new CompilerError("'relation' has no 'through'", relation);
  }

  return { name: relation.name, fromModel, through, interval: relation.interval };
}

function compileQuery(query: QueryAST): QuerySpec {
  let fromModel: string[] | undefined;
  let filter: ExpSpec | undefined;

  query.body.forEach((b) => {
    if ("from" in b) {
      fromModel = b.from;
    } else {
      filter = compileQueryExp(b.filter);
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'query' has no 'from'", query);
  }

  return { name: query.name, fromModel, filter, interval: query.interval };
}

function compileComputed(computed: ComputedAST): ComputedSpec {
  return {
    name: computed.name,
    exp: compileQueryExp(computed.exp),
    interval: computed.interval,
  };
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
      interval: exp.interval,
    };
  } else if (exp.kind === "unary") {
    return {
      kind: "unary",
      operator: exp.operator,
      exp: compileQueryExp(exp.exp),
      interval: exp.interval,
    };
  } else {
    return exp;
  }
}

function compileModel(model: ModelAST): ModelSpec {
  const fields: FieldSpec[] = [];
  const references: ReferenceSpec[] = [];
  const relations: RelationSpec[] = [];
  const queries: QuerySpec[] = [];
  const computeds: ComputedSpec[] = [];

  model.body.forEach((b) => {
    if (b.kind === "field") {
      fields.push(compileField(b));
    } else if (b.kind === "reference") {
      references.push(compileReference(b));
    } else if (b.kind === "relation") {
      relations.push(compileRelation(b));
    } else if (b.kind === "query") {
      queries.push(compileQuery(b));
    } else if (b.kind === "computed") {
      computeds.push(compileComputed(b));
    }
  });

  return {
    name: model.name,
    fields,
    references,
    relations,
    queries,
    computeds,
    interval: model.interval,
  };
}

export function compile(input: AST): Specification {
  return { models: input.models.map(compileModel) };
}
