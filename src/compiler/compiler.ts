import _ from "lodash";

import { CompilerError } from "@src/common/error";
import { assertUnreachable } from "@src/common/utils";
import {
  AST,
  ActionBodyAST,
  AuthenticatorAST,
  AuthenticatorBodyAtomAST,
  AuthenticatorMethodBodyAtomAST,
  ComputedAST,
  EndpointAST,
  EntrypointAST,
  ExpAST,
  FieldAST,
  HookAST,
  InputFieldOptAST,
  LiteralValue,
  ModelAST,
  PopulateAST,
  PopulatorAST,
  QueryAST,
  ReferenceAST,
  RelationAST,
  ValidatorAST,
} from "@src/types/ast";
import {
  AUTH_TARGET_MODEL_NAME,
  ActionAtomSpec,
  ActionHookSpec,
  ActionSpec,
  AuthenticatorBasicMethodEventActionSpec,
  AuthenticatorMethodSpec,
  AuthenticatorSpec,
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
  PopulateSetterSpec,
  PopulateSpec,
  PopulatorSpec,
  QuerySpec,
  ReferenceSpec,
  RelationSpec,
  RepeaterSpec,
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
  let offset: number | undefined;
  let select: QuerySpec["select"];
  let aggregate: QuerySpec["aggregate"];

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
    } else if (b.kind === "offset") {
      offset = b.offset;
    } else if (b.kind === "select") {
      select = b.select;
    } else if (b.kind === "aggregate") {
      aggregate = { name: b.name };
    }
  });

  if (fromModel === undefined) {
    throw new CompilerError("'query' has no 'from'", query);
  }

  if (limit === undefined && offset !== undefined) {
    throw new CompilerError(
      `Can't use offset without limit`,
      query.body.find((a) => a.kind === "offset")
    );
  }

  return {
    name: query.name,
    fromModel,
    fromAlias,
    filter,
    interval: query.interval,
    orderBy,
    limit,
    offset,
    select,
    aggregate,
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
  } else if (exp.kind === "function") {
    return {
      kind: "function",
      name: exp.name,
      args: exp.args.map((arg: ExpAST) => compileQueryExp(arg)),
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
        return a;
      case "set": {
        switch (a.set.kind) {
          case "hook": {
            return { ...a, set: { kind: "hook", hook: compileActionHook(a.set.hook) } };
          }
          case "expression": {
            return { ...a, set: { kind: "expression", exp: compileQueryExp(a.set.exp) } };
          }
          default: {
            return assertUnreachable(a.set);
          }
        }
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
                  return { kind: "literal", value: o.value };
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
        return { kind: "input-list", fields };
      }
    }
  });
  return { kind: action.kind, targetPath: action.target, actionAtoms: atoms, alias: action.alias };
}

function compileEndpoint(endpoint: EndpointAST): EndpointSpec {
  let action: ActionSpec[] | undefined;
  let authorize: ExpSpec | undefined;

  endpoint.body.map((b) => {
    if (b.kind === "action") {
      action = b.body.map(compileAction);
    } else if (b.kind === "authorize") {
      authorize = compileQueryExp(b.expression);
    } else {
      assertUnreachable(b);
    }
  });

  return { type: endpoint.type, action, authorize, interval: endpoint.interval };
}

function compileEntrypoint(entrypoint: EntrypointAST): EntrypointSpec {
  let target: EntrypointSpec["target"] | undefined;
  let identify: string | undefined;
  let response: EntrypointSpec["response"] | undefined;
  let authorize: ExpSpec | undefined;
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
    } else if (b.kind === "authorize") {
      authorize = compileQueryExp(b.expression);
    } else {
      assertUnreachable(b);
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
    authorize,
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
      if (b.value.kind !== "default") {
        throw new CompilerError("'hook' inside field validation must have a 'default' 'arg'", b);
      }
      arg = b.name;
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
      if (b.value.kind !== "query") {
        throw new CompilerError("'hook' inside model must have 'arg' with 'query'", b);
      }
      // hook query has a generated name with pattern -> HOOK_NAME:ARG_NAME
      // placeholder name, not actually used FIXME
      const queryName = `${name}:${b.name}`;
      const query = compileQuery({ ...b.value.query, name: queryName }, []);
      args.push({ name: b.name, query });
    }
  });

  return { ...baseHook, name, args };
}

function compileActionHook(hook: HookAST): ActionHookSpec {
  const args: ActionHookSpec["args"] = {};

  const baseHook = compileBaseHook(hook);
  const name = baseHook.name;

  hook.body.forEach((b) => {
    if (b.kind === "arg") {
      if (b.value.kind === "expression") {
        args[b.name] = { kind: "expression", exp: compileQueryExp(b.value.exp) };
      } else {
        throw new CompilerError("Invalid `hook` type for this context", b);
      }
    }
  });

  return { ...baseHook, name, args };
}

function compilePopulator(populator: PopulatorAST): PopulatorSpec {
  const name = populator.name;
  const populates = populator.body.map(compilePopulate);

  return { name, populates };
}

function compilePopulate(populate: PopulateAST): PopulateSpec {
  const name = populate.name;
  let target: PopulateSpec["target"] | undefined;
  let identify: string | undefined;
  let repeater: RepeaterSpec | undefined;
  const setters: PopulateSetterSpec[] = [];
  const populates: PopulateSpec[] = [];

  populate.body.forEach((p) => {
    const kind = p.kind;
    if (kind === "target") {
      target = p.target;
    } else if (kind === "identify") {
      identify = p.identifier;
    } else if (kind === "repeat") {
      let fixed: number | undefined;
      let range: { start?: number; end?: number } | undefined;
      p.repeat.atoms.forEach((a) => {
        const kind = a.kind;
        if (kind === "fixed") {
          fixed = a.value;
        } else if (kind === "start") {
          range = range ?? {};
          range.start = a.value;
        } else if (kind === "end") {
          range = range ?? {};
          range.end = a.value;
        } else {
          assertUnreachable(kind);
        }
      });
      if (fixed != null && range != null) {
        throw new CompilerError(
          `Action repeat contains both fixed and range values: ${p.interval}`
        );
      }

      if (fixed != null) {
        repeater = {
          kind: "fixed",
          alias: p.repeat.alias,
          value: fixed,
        };
      } else if (range != null) {
        repeater = {
          kind: "range",
          alias: p.repeat.alias,
          range,
        };
      } else {
        throw new CompilerError(`Action repeat contains no values: ${p.interval}`);
      }
    } else if (kind === "set") {
      const set =
        p.set.kind === "hook"
          ? { kind: p.set.kind, hook: compileActionHook(p.set.hook) }
          : { kind: p.set.kind, exp: compileQueryExp(p.set.exp) };

      setters.push({ ...p, set });
    } else if (kind === "populate") {
      populates.push(compilePopulate(p.populate));
    } else {
      assertUnreachable(kind);
    }
  });

  if (target === undefined) {
    throw new CompilerError("'populate' has no 'target'", populate);
  }

  return {
    name,
    target,
    identify,
    repeater,
    setters,
    populates,
  };
}

function compileAuthenticator(authenticator: AuthenticatorAST): AuthenticatorSpec {
  const name = authenticator.name;
  // this is not exposed in blueprint yet
  const targetModelName = AUTH_TARGET_MODEL_NAME;
  const accessTokenModelName = `${targetModelName}AccessToken`;
  const method = compileAuthenticatorMethod(authenticator.body);

  if (method == null) {
    throw new CompilerError("Authenticator method is required.");
  }

  return { name, targetModelName, accessTokenModelName, method };
}

function compileAuthenticatorMethod(
  atoms: AuthenticatorBodyAtomAST[]
): AuthenticatorMethodSpec | undefined {
  const methodAtom = atoms.filter((a): a is AuthenticatorMethodBodyAtomAST => a.kind === "method");
  if (methodAtom.length == 0) {
    return;
  }
  if (methodAtom.length > 1) {
    throw new CompilerError(`Max 1 authenticator method is allowed but ${methodAtom.length} given`);
  }

  const method = methodAtom[0];
  const methodKind = method.methodKind;
  if (methodKind === "basic") {
    const eventActions: AuthenticatorBasicMethodEventActionSpec[] = method.body
      .filter((a) => a.kind === "event-action")
      .map((ea) => ({
        event: ea.body.event,
        actions: ea.body.body.map(compileAction),
      }));

    // add here basic method's config properties
    return { kind: "basic", eventActions };
  } else {
    assertUnreachable(methodKind);
  }
}

export function compile(input: AST): Specification {
  const models: ModelSpec[] = [];
  const entrypoints: EntrypointSpec[] = [];
  const populators: PopulatorSpec[] = [];
  let authenticator: AuthenticatorSpec | undefined = undefined;

  input.map((definition) => {
    const kind = definition.kind;
    if (kind === "model") {
      models.push(compileModel(definition));
    } else if (kind === "entrypoint") {
      entrypoints.push(compileEntrypoint(definition));
    } else if (kind === "populator") {
      populators.push(compilePopulator(definition));
    } else if (kind === "authenticator") {
      authenticator = compileAuthenticator(definition);
    } else {
      assertUnreachable(kind);
    }
  });

  return { models, entrypoints, populators, authenticator };
}
