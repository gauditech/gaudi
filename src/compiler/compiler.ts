import { CompilerError } from "@src/common/error";
import {
  AST,
  ActionBodyAST,
  ComputedAST,
  EndpointAST,
  EntrypointAST,
  ExpAST,
  FieldAST,
  LiteralValue,
  ModelAST,
  QueryAST,
  ReferenceAST,
  RelationAST,
} from "@src/types/ast";
import {
  ActionSpec,
  ComputedSpec,
  EndpointSpec,
  EntrypointSpec,
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
  let orderBy: QuerySpec["orderBy"];
  let limit: number | undefined;

  query.body.forEach((b) => {
    if (b.kind === "from") {
      fromModel = b.from;
    } else if (b.kind === "filter") {
      filter = compileQueryExp(b.filter);
    } else if (b.kind === "orderBy") {
      orderBy = b.orderings;
    } else if (b.kind === "limit") {
      limit = b.limit;
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'query' has no 'from'", query);
  }

  return { name: query.name, fromModel, filter, interval: query.interval, orderBy, limit };
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

function compileAction(action: ActionBodyAST): ActionSpec {
  return { kind: action.kind, target: action.target, actionAtoms: action.body };
}

function compileEndpoint(endpoint: EndpointAST): EndpointSpec {
  let action: ActionSpec[] | undefined;

  endpoint.body.map((b) => {
    if (b.kind === "action") {
      action = b.body.map(compileAction);
    }
  });

  return { type: endpoint.type, action, interval: endpoint.interval };
}

function compileEntrypoint(entrypoint: EntrypointAST): EntrypointSpec {
  let target: EntrypointSpec["target"] | undefined;
  let identify: string | undefined;
  let alias: string | undefined;
  let response: string[] | undefined;
  const endpoints: EndpointSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];

  entrypoint.body.forEach((b) => {
    if (b.kind === "target") {
      target = b.target;
    } else if (b.kind === "identify") {
      identify = b.identifier;
    } else if (b.kind === "alias") {
      alias = b.identifier;
    } else if (b.kind === "response") {
      response = b.select;
    } else if (b.kind === "endpoint") {
      endpoints.push(compileEndpoint(b.endpoint));
    } else if (b.kind === "entrypoint") {
      entrypoints.push(compileEntrypoint(b.entrypoint));
    }
  });

  if (target === undefined) {
    throw new CompilerError("'entrypoint' has no 'target'", entrypoint);
  }

  return {
    name: entrypoint.name,
    target,
    identify,
    alias,
    response,
    endpoints,
    entrypoints,
    interval: entrypoint.interval,
  };
}
export function compile(input: AST): Specification {
  const models: ModelSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];

  input.map((definition) => {
    if (definition.kind === "model") {
      models.push(compileModel(definition));
    } else {
      entrypoints.push(compileEntrypoint(definition));
    }
  });

  return { models, entrypoints };
}
