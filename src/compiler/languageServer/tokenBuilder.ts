import { match } from "ts-pattern";

import {
  Action,
  ActionAtomDeny,
  ActionAtomInput,
  ActionAtomReferenceThrough,
  ActionAtomSet,
  ActionHook,
  AnonymousQuery,
  Api,
  Authenticator,
  Computed,
  Endpoint,
  Entrypoint,
  ExecuteAction,
  Expr,
  ExtraInput,
  Field,
  FieldValidationHook,
  Generator,
  GlobalAtom,
  Identifier,
  IdentifierRef,
  Literal,
  Model,
  ModelAction,
  ModelHook,
  Populate,
  Populator,
  Query,
  QueryAction,
  QueryAtom,
  Reference,
  Relation,
  RepeatValue,
  Runtime,
  Select,
  TokenData,
  Validator,
} from "../ast/ast";

export enum TokenTypes {
  namespace = 0,
  type = 1,
  class = 2,
  enum = 3,
  interface = 4,
  struct = 5,
  typeParameter = 6,
  parameter = 7,
  variable = 8,
  property = 9,
  enumMember = 10,
  event = 11,
  function = 12,
  method = 13,
  macro = 14,
  keyword = 15,
  modifier = 16,
  comment = 17,
  string = 18,
  number = 19,
  regexp = 20,
  operator = 21,
  decorator = 22,
}

export enum TokenModifiers {
  none = 0,
  declaration = 1,
  definition = 2,
  readonly = 4,
  static = 8,
  deprecated = 16,
  abstract = 32,
  async = 64,
  modification = 128,
  documentation = 256,
  defaultLibrary = 512,
}

export function buildTokens(
  document: GlobalAtom[],
  push: (token: TokenData, tokenType: TokenTypes, tokenModifiers?: TokenModifiers) => void
) {
  function buildDocument(document: GlobalAtom[]) {
    document.forEach((d) => {
      match(d)
        .with({ kind: "model" }, buildModel)
        .with({ kind: "api" }, buildApi)
        .with({ kind: "populator" }, buildPopulator)
        .with({ kind: "runtime" }, buildRuntime)
        .with({ kind: "authenticator" }, buildAuthenticator)
        .with({ kind: "generator" }, buildGenerator)
        .exhaustive();
    });
  }

  function buildModel({ keyword, name, atoms }: Model) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.class);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "field" }, buildField)
        .with({ kind: "reference" }, buildReference)
        .with({ kind: "relation" }, buildRelation)
        .with({ kind: "query" }, buildQuery)
        .with({ kind: "computed" }, buildComputed)
        .with({ kind: "hook" }, buildModelHook)
        .exhaustive()
    );
  }

  function buildField({ keyword, name, atoms }: Field) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "type" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildType(identifier);
        })
        .with({ kind: "unique" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "nullable" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "default" }, ({ keyword, literal }) => {
          buildKeyword(keyword);
          buildLiteral(literal);
        })
        .with({ kind: "validate" }, ({ keyword, validators }) => {
          buildKeyword(keyword);
          validators.forEach(buildValidator);
        })
        .exhaustive()
    );
  }

  function buildReference({ keyword, name, atoms }: Reference) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "to" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierRef(identifier);
        })
        .with({ kind: "unique" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "nullable" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "onDelete" }, (onDelete) => {
          buildKeyword(onDelete.keyword);
          buildKeyword(onDelete.action.keyword);
        })
        .exhaustive()
    );
  }

  function buildRelation({ keyword, name, atoms }: Relation) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "from" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierRef(identifier);
        })
        .with({ kind: "through" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierRef(identifier);
        })
        .exhaustive()
    );
  }

  function buildQuery(query: Query) {
    buildKeyword(query.keyword);
    push(query.name.token, TokenTypes.property);
    query.atoms.forEach(buildQueryAtom);
  }

  function buildQueryAtom(atom: QueryAtom) {
    match(atom)
      .with({ kind: "from" }, ({ keyword, identifierPath, as }) => {
        buildKeyword(keyword);
        buildIdentifierPath(identifierPath);
        if (as) {
          buildKeyword(as.keyword);
          buildIdentifierPath(as.identifierPath);
        }
      })
      .with({ kind: "filter" }, ({ keyword, expr }) => {
        buildKeyword(keyword);
        buildExpr(expr);
      })
      .with({ kind: "orderBy" }, ({ keyword, orderBy }) => {
        buildKeyword(keyword);
        orderBy.forEach((orderBy) => {
          buildExpr(orderBy.expr);
          if (orderBy.keyword) buildKeyword(orderBy.keyword);
        });
      })
      .with({ kind: "limit" }, { kind: "offset" }, ({ keyword, value }) => {
        buildKeyword(keyword);
        buildLiteral(value);
      })
      .with({ kind: "aggregate" }, ({ keyword }) => {
        buildKeyword(keyword);
      })
      .exhaustive();
  }

  function buildComputed({ keyword, name, expr }: Computed) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    buildExpr(expr);
  }

  function buildValidator(validator: Validator) {
    match(validator)
      .with({ kind: "builtin" }, ({ name, args }) => {
        push(name.token, TokenTypes.property);
        args.forEach(buildLiteral);
      })
      .with({ kind: "hook" }, buildFieldValidationHook)
      .exhaustive();
  }

  function buildApi({ keyword, name, atoms }: Api) {
    buildKeyword(keyword);
    if (name) push(name.token, TokenTypes.variable);
    atoms.forEach((a) => match(a).with({ kind: "entrypoint" }, buildEntrypoint).exhaustive());
  }

  function buildEntrypoint({ keyword, target, as, atoms }: Entrypoint) {
    buildKeyword(keyword);
    buildIdentifierRef(target);
    if (as) {
      buildKeyword(as.keyword);
      buildIdentifierRef(as.identifier);
    }
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "identify" }, ({ keyword, atoms }) => {
          buildKeyword(keyword);
          atoms.forEach((a) =>
            match(a)
              .with({ kind: "through" }, ({ keyword, identifierPath }) => {
                buildKeyword(keyword);
                buildIdentifierPath(identifierPath);
              })
              .exhaustive()
          );
        })
        .with({ kind: "response" }, ({ keyword, select }) => {
          buildKeyword(keyword);
          buildSelect(select);
        })
        .with({ kind: "authorize" }, ({ keyword, expr }) => {
          buildKeyword(keyword);
          buildExpr(expr);
        })
        .with({ kind: "endpoint" }, buildEndpoint)
        .with({ kind: "entrypoint" }, buildEntrypoint)
        .exhaustive()
    );
  }

  function buildEndpoint({ keywordType, keyword, atoms }: Endpoint) {
    buildKeyword(keywordType);
    buildKeyword(keyword);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "extraInputs" }, ({ keyword, extraInputs }) => {
          buildKeyword(keyword);
          extraInputs.forEach(buildExtraInput);
        })
        .with({ kind: "action" }, ({ keyword, actions }) => {
          buildKeyword(keyword);
          actions.forEach(buildAction);
        })
        .with({ kind: "authorize" }, ({ keyword, expr }) => {
          buildKeyword(keyword);
          buildExpr(expr);
        })
        .with({ kind: "method" }, ({ keyword, methodKeyword }) => {
          buildKeyword(keyword);
          buildKeyword(methodKeyword);
        })
        .with({ kind: "cardinality" }, ({ keyword, cardinalityKeyword }) => {
          buildKeyword(keyword);
          buildKeyword(cardinalityKeyword);
        })
        .with({ kind: "path" }, ({ keyword, path }) => {
          buildKeyword(keyword);
          buildLiteral(path);
        })
        .with({ kind: "pageable" }, ({ keyword }) => {
          buildKeyword(keyword);
        })
        .with({ kind: "orderBy" }, ({ keyword, orderBy }) => {
          buildKeyword(keyword);
          orderBy.forEach((orderBy) => {
            buildExpr(orderBy.expr);
            if (orderBy.keyword) buildKeyword(orderBy.keyword);
          });
        })
        .with({ kind: "filter" }, ({ keyword, expr }) => {
          buildKeyword(keyword);
          buildExpr(expr);
        })
        .exhaustive()
    );
  }

  function buildExtraInput({ keyword, name, atoms }: ExtraInput) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "type" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildType(identifier);
        })
        .with({ kind: "nullable" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "validate" }, ({ keyword, validators }) => {
          buildKeyword(keyword);
          validators.forEach(buildValidator);
        })
        .exhaustive()
    );
  }

  function buildAction(action: Action) {
    match(action)
      .with({ kind: "create" }, { kind: "update" }, buildModelAction)
      .with({ kind: "delete" }, ({ keyword, target }) => {
        buildKeyword(keyword);
        if (target) buildIdentifierPath(target);
      })
      .with({ kind: "execute" }, buildExecuteAction)
      .with({ kind: "queryAction" }, buildQueryAction)
      .exhaustive();
  }

  function buildModelAction({ keyword, target, as, atoms }: ModelAction) {
    buildKeyword(keyword);
    if (target) buildIdentifierPath(target);
    if (as) {
      buildKeyword(as.keyword);
      buildIdentifierRef(as.identifier);
    }
    atoms.forEach((a) => {
      match(a)
        .with({ kind: "set" }, buildActionAtomSet)
        .with({ kind: "referenceThrough" }, buildActionAtomReferenceThrough)
        .with({ kind: "deny" }, buildActionAtomDeny)
        .with({ kind: "input" }, buildActionAtomInput)
        .exhaustive();
    });
  }

  function buildExecuteAction({ keyword, keywordAs, name, atoms }: ExecuteAction) {
    buildKeyword(keyword);
    if (keywordAs) buildKeyword(keywordAs);
    if (name) push(name.token, TokenTypes.variable);
    atoms.forEach((a) => {
      match(a)
        .with({ kind: "hook" }, buildActionHook)
        .with({ kind: "responds" }, ({ keyword }) => buildKeyword(keyword))
        .exhaustive();
    });
  }

  function buildAnonymousQuery({ keyword, atoms }: AnonymousQuery) {
    buildKeyword(keyword);
    atoms.forEach((a) => {
      match(a)
        .with({ kind: "select" }, ({ keyword, select }) => {
          buildKeyword(keyword);
          buildSelect(select);
        })
        .otherwise(buildQueryAtom);
    });
  }

  function buildQueryAction({ keyword, keywordAs, name, atoms }: QueryAction) {
    buildKeyword(keyword);
    if (keywordAs) buildKeyword(keywordAs);
    if (name) push(name.token, TokenTypes.variable);
    atoms.forEach((a) => {
      match(a)
        .with({ kind: "update" }, ({ keyword, atoms }) => {
          buildKeyword(keyword);
          atoms.forEach(buildActionAtomSet);
        })
        .with({ kind: "delete" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "select" }, ({ keyword, select }) => {
          buildKeyword(keyword);
          buildSelect(select);
        })
        .otherwise(buildQueryAtom);
    });
  }

  function buildActionAtomSet({ keyword, target, set }: ActionAtomSet) {
    buildKeyword(keyword);
    buildIdentifierRef(target);
    match(set)
      .with({ kind: "hook" }, buildActionHook)
      .with({ kind: "expr" }, ({ expr }) => buildExpr(expr))
      .exhaustive();
  }

  function buildActionAtomReferenceThrough({
    keyword,
    target,
    keywordThrough,
    through,
  }: ActionAtomReferenceThrough) {
    buildKeyword(keyword);
    buildIdentifierRef(target);
    buildKeyword(keywordThrough);
    buildIdentifierPath(through);
  }

  function buildActionAtomDeny({ keyword, fields }: ActionAtomDeny) {
    buildKeyword(keyword);
    match(fields)
      .with({ kind: "all" }, ({ keyword }) => buildKeyword(keyword))
      .with({ kind: "list" }, ({ fields }) => fields.forEach(buildIdentifierRef))
      .exhaustive();
  }

  function buildActionAtomInput({ keyword, fields }: ActionAtomInput) {
    buildKeyword(keyword);
    fields.forEach(({ field, atoms }) => {
      buildIdentifierRef(field);
      atoms.forEach((a) =>
        match(a)
          .with({ kind: "optional" }, ({ keyword }) => {
            buildKeyword(keyword);
          })
          .with({ kind: "default" }, ({ keyword, value }) => {
            buildKeyword(keyword);
            buildExpr(value);
          })
          .exhaustive()
      );
    });
  }

  function buildPopulator({ keyword, name, atoms }: Populator) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.variable);
    atoms.forEach((a) => match(a).with({ kind: "populate" }, buildPopulate).exhaustive());
  }

  function buildPopulate({ keyword, target, as, atoms }: Populate) {
    buildKeyword(keyword);
    buildIdentifierRef(target);
    if (as) {
      buildKeyword(as.keyword);
      buildIdentifierRef(as.identifier);
    }
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "repeat" }, ({ keyword, as, repeatValue }) => {
          buildKeyword(keyword);
          if (as) {
            buildKeyword(as.keyword);
            buildIdentifierRef(as.identifier);
          }
          buildRepeatValue(repeatValue);
        })
        .with({ kind: "set" }, buildActionAtomSet)
        .with({ kind: "populate" }, buildPopulate)
        .exhaustive()
    );
  }

  function buildRepeatValue(repeatValue: RepeatValue) {
    match(repeatValue)
      .with({ kind: "long" }, ({ atoms }) =>
        atoms.forEach(({ keyword, value }) => {
          buildKeyword(keyword);
          buildLiteral(value);
        })
      )
      .with({ kind: "short" }, ({ value }) => buildLiteral(value))
      .exhaustive();
  }

  function buildRuntime({ keyword, name, atoms }: Runtime) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.variable);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "default" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "sourcePath" }, ({ keyword, path }) => {
          buildKeyword(keyword);
          buildLiteral(path);
        })
        .exhaustive()
    );
  }

  function buildAuthenticator({ keyword, atoms }: Authenticator) {
    buildKeyword(keyword);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "method" }, ({ keyword, method }) => {
          buildKeyword(keyword);
          buildKeyword(method.keyword);
        })
        .exhaustive()
    );
  }

  function buildGenerator(generator: Generator) {
    buildKeyword(generator.keyword);
    match(generator)
      .with({ type: "client" }, (g) => {
        buildKeyword(g.keywordType);
        g.atoms.forEach((a) => {
          match(a)
            .with({ kind: "target" }, (a) => {
              buildKeyword(a.keyword);
              buildKeyword(a.keywordValue);
            })
            .with({ kind: "output" }, (a) => {
              buildKeyword(a.keyword);
              buildLiteral(a.value);
            })
            .exhaustive();
        });
      })
      .exhaustive();
  }

  function buildModelHook(hook: ModelHook) {
    buildKeyword(hook.keyword);
    push(hook.name.token, TokenTypes.property);
    hook.atoms.forEach(buildHookAtom);
  }

  function buildFieldValidationHook(hook: FieldValidationHook) {
    buildKeyword(hook.keyword);
    hook.atoms.forEach(buildHookAtom);
  }
  function buildActionHook(hook: ActionHook) {
    buildKeyword(hook.keyword);
    hook.atoms.forEach(buildHookAtom);
  }

  function buildHookAtom(atom: (ModelHook | FieldValidationHook | ActionHook)["atoms"][number]) {
    match(atom)
      .with({ kind: "arg_expr" }, ({ keyword, name, expr }) => {
        buildKeyword(keyword);
        push(name.token, TokenTypes.property);
        buildExpr(expr);
      })
      .with({ kind: "arg_query" }, ({ keyword, name, query }) => {
        buildKeyword(keyword);
        push(name.token, TokenTypes.property);
        buildAnonymousQuery(query);
      })
      .with({ kind: "default_arg" }, ({ keyword, name }) => {
        buildKeyword(keyword);
        push(name.token, TokenTypes.property);
      })
      .with({ kind: "source" }, ({ keyword, name, keywordFrom, file }) => {
        buildKeyword(keyword);
        push(name.token, TokenTypes.property);
        buildKeyword(keywordFrom);
        buildLiteral(file);
      })
      .with({ kind: "inline" }, ({ keyword, code }) => {
        buildKeyword(keyword);
        buildLiteral(code);
      })
      .with({ kind: "runtime" }, ({ keyword, identifier }) => {
        buildKeyword(keyword);
        push(identifier.token, TokenTypes.variable);
      })
      .exhaustive();
  }

  function buildSelect(select: Select) {
    select.forEach(({ target, select }) => {
      switch (target.kind) {
        case "short":
          buildIdentifierRef(target.name);
          break;
        case "long":
          push(target.name.token, TokenTypes.property);
          buildExpr(target.expr);
          break;
      }
      if (select) buildSelect(select);
    });
  }

  function buildExpr(expr: Expr) {
    match(expr)
      .with({ kind: "binary" }, ({ lhs, operator, keyword, rhs }) => {
        buildExpr(lhs);
        // tag symbolyc operators as operators and word operators as keywords
        if (/^\w/.test(operator)) {
          buildKeyword(keyword);
        } else {
          buildOperator(keyword);
        }
        buildExpr(rhs);
      })
      .with({ kind: "group" }, ({ expr }) => buildExpr(expr))
      .with({ kind: "array" }, ({ elements }) => elements.forEach((e) => buildExpr(e)))
      .with({ kind: "unary" }, ({ keyword, expr }) => {
        buildKeyword(keyword);
        buildExpr(expr);
      })
      .with({ kind: "path" }, ({ path }) => buildIdentifierPath(path))
      .with({ kind: "literal" }, ({ literal }) => buildLiteral(literal))
      .with({ kind: "function" }, ({ name, args }) => {
        push(name.token, TokenTypes.function);
        args.forEach(buildExpr);
      })
      .exhaustive();
  }

  function buildLiteral(literal: Literal) {
    match(literal)
      .with({ kind: "integer" }, { kind: "float" }, ({ token }) => push(token, TokenTypes.number))
      .with({ kind: "boolean" }, { kind: "null" }, ({ token }) =>
        push(token, TokenTypes.variable, TokenModifiers.static | TokenModifiers.readonly)
      )
      .with({ kind: "string" }, ({ token }) => push(token, TokenTypes.string))
      .exhaustive();
  }

  function buildIdentifierRef(identifier: IdentifierRef) {
    const isModel = identifier.ref?.kind === "model";
    const tokenType = isModel ? TokenTypes.class : TokenTypes.variable;
    return push(identifier.token, tokenType);
  }

  function buildType(identifier: Identifier) {
    return push(identifier.token, TokenTypes.type);
  }

  function buildIdentifierPath(path: IdentifierRef[]) {
    path.map(buildIdentifierRef);
  }

  function buildKeyword(keyword: TokenData) {
    return push(keyword, TokenTypes.keyword);
  }

  function buildOperator(operator: TokenData) {
    return push(operator, TokenTypes.operator);
  }

  buildDocument(document);
}
