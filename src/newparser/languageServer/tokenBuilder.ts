import { match } from "ts-pattern";

import {
  Action,
  ActionAtomDeny,
  ActionAtomInput,
  ActionAtomReferenceThrough,
  ActionAtomSet,
  ActionFieldHook,
  ActionVirtualInput,
  Computed,
  Definition,
  Endpoint,
  Entrypoint,
  Expr,
  Field,
  FieldValidationHook,
  Identifier,
  IdentifierRef,
  Literal,
  Model,
  ModelHook,
  Populate,
  Populator,
  Query,
  Reference,
  Relation,
  Repeater,
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
  definition: Definition,
  push: (token: TokenData, tokenType: TokenTypes, tokenModifiers?: TokenModifiers) => void
) {
  function buildDefinition(definition: Definition) {
    definition.forEach((d) => {
      match(d)
        .with({ kind: "model" }, buildModel)
        .with({ kind: "entrypoint" }, buildEntrypoint)
        .with({ kind: "populator" }, buildPopulator)
        .with({ kind: "runtime" }, buildRuntime)
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

  function buildQuery({ keyword, name, atoms }: Query) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    atoms.forEach((a) =>
      match(a)
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
            buildIdentifierPath(orderBy.identifierPath);
            if (orderBy.keyword) buildKeyword(orderBy.keyword);
          });
        })
        .with({ kind: "limit" }, { kind: "offset" }, ({ keyword, value }) => {
          buildKeyword(keyword);
          buildLiteral(value);
        })
        .with({ kind: "select" }, ({ keyword, select }) => {
          buildKeyword(keyword);
          buildSelect(select);
        })
        .with({ kind: "aggregate" }, ({ keyword }) => {
          buildKeyword(keyword);
        })
        .exhaustive()
    );
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

  function buildEntrypoint({ keyword, name, atoms }: Entrypoint) {
    buildKeyword(keyword);
    push(name.token, TokenTypes.property);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "target" }, ({ keyword, identifier, as }) => {
          buildKeyword(keyword);
          buildIdentifierRef(identifier);
          if (as) {
            buildKeyword(as.keyword);
            buildIdentifierRef(as.identifier);
          }
        })
        .with({ kind: "identifyWith" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierRef(identifier);
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
        .exhaustive()
    );
  }

  function buildAction({ keyword, target, as, atoms }: Action) {
    buildKeyword(keyword);
    if (target) buildIdentifierPath(target);
    if (as) {
      buildKeyword(as.keyword);
      buildIdentifierRef(as.identifier);
    }
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "set" }, buildActionAtomSet)
        .with({ kind: "referenceThrough" }, () => buildActionAtomReferenceThrough)
        .with({ kind: "virtualInput" }, () => buildActionAtomVirtualInput)
        .with({ kind: "deny" }, () => buildActionAtomDeny)
        .with({ kind: "input" }, () => buildActionAtomInput)
        .exhaustive()
    );
  }

  function buildActionAtomSet({ keyword, target, set }: ActionAtomSet) {
    buildKeyword(keyword);
    buildIdentifierRef(target);
    match(set)
      .with({ kind: "hook" }, buildActionFieldHook)
      .with({ kind: "expr" }, ({ expr }) => buildExpr(expr))
      .exhaustive();
  }

  function buildActionAtomReferenceThrough({
    keyword,
    target,
    through,
  }: ActionAtomReferenceThrough) {
    buildKeyword(keyword);
    buildIdentifierRef(target);
    buildIdentifierRef(through);
  }

  function buildActionAtomVirtualInput({ keyword, name, atoms }: ActionVirtualInput) {
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

  function buildPopulate({ keyword, atoms }: Populate) {
    buildKeyword(keyword);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "target" }, ({ keyword, identifier, as }) => {
          buildKeyword(keyword);
          buildIdentifierRef(identifier);
          if (as) {
            buildKeyword(as.keyword);
            buildIdentifierRef(as.identifier);
          }
        })
        .with({ kind: "repeat" }, ({ keyword, repeater }) => {
          buildKeyword(keyword);
          buildRepeater(repeater);
        })
        .with({ kind: "set" }, buildActionAtomSet)
        .with({ kind: "populate" }, buildPopulate)
        .exhaustive()
    );
  }

  function buildRepeater(repeater: Repeater) {
    match(repeater)
      .with({ kind: "body" }, ({ atoms }) =>
        atoms.forEach(({ keyword, value }) => {
          buildKeyword(keyword);
          buildLiteral(value);
        })
      )
      .with({ kind: "simple" }, ({ value }) => buildLiteral(value))
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

  function buildModelHook(hook: ModelHook) {
    buildKeyword(hook.keyword);
    push(hook.name.token, TokenTypes.property);
    hook.atoms.forEach(buildHookAtom);
  }

  function buildFieldValidationHook(hook: FieldValidationHook) {
    buildKeyword(hook.keyword);
    hook.atoms.forEach(buildHookAtom);
  }
  function buildActionFieldHook(hook: ActionFieldHook) {
    buildKeyword(hook.keyword);
    hook.atoms.forEach(buildHookAtom);
  }

  function buildHookAtom(
    atom: (ModelHook | FieldValidationHook | ActionFieldHook)["atoms"][number]
  ) {
    match(atom)
      .with({ kind: "arg_expr" }, ({ keyword, name, expr }) => {
        buildKeyword(keyword);
        push(name.token, TokenTypes.property);
        buildExpr(expr);
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
          buildIdentifierPath(target.identifierPath);
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
    const isModel = identifier.ref.kind === "model";
    const tokenType = isModel ? TokenTypes.class : TokenTypes.variable;
    return push(identifier.identifier.token, tokenType);
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

  buildDefinition(definition);
}
