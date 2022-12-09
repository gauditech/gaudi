import _ from "lodash";

import { CompilerError } from "@src/common/error";
import {
  AST,
  ActionBodyAST,
  ComputedAST,
  EndpointAST,
  EntrypointAST,
  ExpAST,
  FieldAST,
  HookAST,
  InputFieldOptAST,
  LiteralValue,
  ModelAST,
  QueryAST,
  ReferenceAST,
  RelationAST,
  ValidatorAST,
} from "@src/types/ast";
import {
  ActionAtomSpec,
  ActionSpec,
  BaseHookSpec,
  ComputedSpec,
  EndpointSpec,
  EntrypointSpec,
  ExpSpec,
  FieldSpec,
  FieldValidatorHookSpec,
  HookCode,
  InputFieldSpec,
  ModelHookSpec,
  ModelSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  Specification,
  ValidatorSpec,
} from "@src/types/specification";

function compileField(field: FieldAST): FieldSpec {
  let type: string | undefined;
  let default_: LiteralValue | undefined;
  let nullable: boolean | undefined;
  let unique: boolean | undefined;
  let validators: ValidatorSpec[] | undefined;

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
    } else if (b.kind === "validate") {
      validators = b.validators.map(compileValidator);
    }
  });

  if (type === undefined) {
    throw new CompilerError("'field' has no 'type'", field);
  }

  return {
    name: field.name,
    type,
    default: default_,
    nullable,
    unique,
    validators,
    interval: field.interval,
  };
}

function compileValidator(validator: ValidatorAST): ValidatorSpec {
  switch (validator.kind) {
    case "builtin":
      return validator;
    case "hook":
      return { ...validator, hook: compileFieldValidatorHook(validator.hook) };
  }
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

function compileQuery(query: QueryAST, defaultFromModel?: string[]): QuerySpec {
  let fromModel: string[] | undefined = defaultFromModel;
  let fromAlias: string[] | undefined;
  let filter: ExpSpec | undefined;
  let orderBy: QuerySpec["orderBy"];
  let limit: number | undefined;
  let select: QuerySpec["select"];

  query.body.forEach((b) => {
    if (b.kind === "from") {
      fromModel = b.from;
      fromAlias = b.alias;
    } else if (b.kind === "filter") {
      filter = compileQueryExp(b.filter);
    } else if (b.kind === "orderBy") {
      orderBy = b.orderings;
    } else if (b.kind === "limit") {
      limit = b.limit;
    } else if (b.kind === "select") {
      select = b.select;
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'query' has no 'from'", query);
  }

  return {
    name: query.name,
    fromModel,
    fromAlias,
    filter,
    interval: query.interval,
    orderBy,
    limit,
    select,
  };
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
  const hooks: ModelHookSpec[] = [];

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
    } else if (b.kind === "hook") {
      hooks.push(compileModelHook(b));
    }
  });

  return {
    name: model.name,
    alias: model.alias,
    fields,
    references,
    relations,
    queries,
    computeds,
    hooks,
    interval: model.interval,
  };
}

function compileAction(action: ActionBodyAST): ActionSpec {
  const atoms = action.body.map((a): ActionAtomSpec => {
    switch (a.kind) {
      case "action": {
        return { kind: "action", body: compileAction(a.body) };
      }
      case "deny":
      case "reference":
      case "set": {
        // action AST and Spec are currently the same
        return a;
      }
      case "input": {
        const fields = a.fields.map((f): InputFieldSpec => {
          const defaults = f.opts
            .filter((o): o is Exclude<InputFieldOptAST, { kind: "optional" }> =>
              o.kind.startsWith("default")
            )
            .map((o): InputFieldSpec["default"] => {
              switch (o.kind) {
                case "default-value": {
                  return { kind: "value", value: o.value };
                }
                case "default-reference": {
                  return { kind: "reference", reference: o.path };
                }
              }
            });
          if (defaults.length > 1) {
            throw new CompilerError(`Multiple 'default' for a field is not allowed`);
          }
          const optionals = f.opts.filter((o) => o.kind === "optional");
          if (optionals.length > 1) {
            throw new CompilerError(`Multiple 'optional' for a field is not allowed`);
          }
          return { name: f.name, default: defaults[0], optional: !_.isEmpty(optionals) };
        });
        return { kind: "input", fields };
      }
    }
  });
  return { kind: action.kind, targetPath: action.target, actionAtoms: atoms, alias: action.alias };
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
  let response: EntrypointSpec["response"] | undefined;
  const endpoints: EndpointSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];

  entrypoint.body.forEach((b) => {
    if (b.kind === "target") {
      target = b.target;
    } else if (b.kind === "identify") {
      identify = b.identifier;
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
    response,
    endpoints,
    entrypoints,
    interval: entrypoint.interval,
  };
}

function compileBaseHook(hook: HookAST): BaseHookSpec {
  const name = hook.name;
  let code: HookCode | undefined;

  hook.body.forEach((b) => {
    if (b.kind === "inline") {
      code = { kind: "inline", inline: b.inline };
    } else if (b.kind === "source") {
      code = { kind: "source", target: b.target, file: b.file };
    }
  });

  if (!code) {
    throw new CompilerError("'hook' needs to have 'source' or 'inline'", hook);
  }

  return {
    name,
    code,
    interval: hook.interval,
  };
}

function compileFieldValidatorHook(hook: HookAST): FieldValidatorHookSpec {
  let arg: string | undefined;
  const baseHook = compileBaseHook(hook);

  hook.body.forEach((b) => {
    if (b.kind === "arg") {
      if (arg !== undefined) {
        throw new CompilerError("'hook' inside field validation can only have one arg", b);
      }
      if (b.query) {
        throw new CompilerError(
          "'hook' inside field validation must have 'arg' without 'query'",
          b
        );
      }
      arg = b.reference;
    }
  });

  return { ...baseHook, arg };
}

function compileModelHook(hook: HookAST): ModelHookSpec {
  const args: ModelHookSpec["args"] = [];

  const baseHook = compileBaseHook(hook);
  const name = baseHook.name;

  if (!name) {
    throw new CompilerError("'hook' inside model must be named", hook);
  }

  hook.body.forEach((b) => {
    if (b.kind === "arg") {
      if (!b.query) {
        throw new CompilerError("'hook' inside model must have 'arg' with 'query'", b);
      }
      // hook query has a generated name with pattern -> HOOK_NAME:ARG_NAME
      // placeholder name, not actually used FIXME
      const queryName = `${name}:${b.reference}`;
      const query = compileQuery({ ...b.query, name: queryName }, []);
      args.push({ name: b.reference, query });
    }
  });

  return { ...baseHook, name, args };
}

export function compile(input: AST): Specification {
  const models: ModelSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];

  input.map((definition) => {
    if (definition.kind === "model") {
      models.push(compileModel(definition));
    } else if (definition.kind === "entrypoint") {
      entrypoints.push(compileEntrypoint(definition));
    }
  });

  return { models, entrypoints };
}
