import { match } from "ts-pattern";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ProposedFeatures,
  SemanticTokensBuilder,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node";

import {
  Action,
  ActionAtomDeny,
  ActionAtomInput,
  ActionAtomReferenceThrough,
  ActionAtomSet,
  Computed,
  Definition,
  Endpoint,
  Entrypoint,
  Expr,
  Field,
  Hook,
  HookAtom,
  Identifier,
  IdentifierAs,
  IdentifierPath,
  IdentifierPathAs,
  Literal,
  Model,
  Populate,
  Populator,
  Query,
  Reference,
  Relation,
  Repeater,
  Select,
  TokenData,
  UnnamedHook,
  Validator,
} from "./parsed";
import { parse } from "./parser";

const connection: ProposedFeatures.Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

documents.listen(connection);

documents.onWillSave((_event) => {
  connection.console.log("On Will save received");
});

enum TokenTypes {
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

enum TokenModifiers {
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

connection.onInitialize((params) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: {
        documentSelector: ["gaudi"],
        legend: {
          tokenTypes: params.capabilities.textDocument!.semanticTokens!.tokenTypes,
          tokenModifiers: params.capabilities.textDocument!.semanticTokens!.tokenModifiers,
        },
        range: false,
        full: {
          delta: false,
        },
      },
    },
  };
});

const tokenBuilders: Map<string, SemanticTokensBuilder> = new Map();
documents.onDidClose((event) => {
  tokenBuilders.delete(event.document.uri);
});
function getTokenBuilder(document: TextDocument): SemanticTokensBuilder {
  let result = tokenBuilders.get(document.uri);
  if (result !== undefined) {
    return result;
  }
  result = new SemanticTokensBuilder();
  tokenBuilders.set(document.uri, result);
  return result;
}

function buildTokens(builder: SemanticTokensBuilder, document: TextDocument) {
  function addToken(token: TokenData, tokenType: TokenTypes, tokenModifiers: TokenModifiers = 0) {
    const { character, line } = document.positionAt(token.start);
    const length = token.end - token.start;

    builder.push(line, character, length, tokenType, tokenModifiers);
  }

  function buildDefinition(definition: Definition) {
    definition.forEach((d) => {
      match(d)
        .with({ kind: "model" }, buildModel)
        .with({ kind: "entrypoint" }, buildEntrypoint)
        .with({ kind: "populator" }, buildPopulator)
        .exhaustive();
    });
  }

  function buildModel({ keyword, name, atoms }: Model) {
    buildKeyword(keyword);
    buildIdentifier(name);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "field" }, buildField)
        .with({ kind: "reference" }, buildReference)
        .with({ kind: "relation" }, buildRelation)
        .with({ kind: "query" }, buildQuery)
        .with({ kind: "computed" }, buildComputed)
        .with({ kind: "hook" }, buildHook)
        .exhaustive()
    );
  }

  function buildField({ keyword, name, atoms }: Field) {
    buildKeyword(keyword);
    buildIdentifier(name);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "type" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifier(identifier);
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
    buildIdentifier(name);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "to" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifier(identifier);
        })
        .with({ kind: "unique" }, ({ keyword }) => buildKeyword(keyword))
        .with({ kind: "nullable" }, ({ keyword }) => buildKeyword(keyword))
        .exhaustive()
    );
  }

  function buildRelation({ keyword, name, atoms }: Relation) {
    buildKeyword(keyword);
    buildIdentifier(name);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "from" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifier(identifier);
        })
        .with({ kind: "through" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifier(identifier);
        })
        .exhaustive()
    );
  }

  function buildQuery({ keyword, name, atoms }: Query) {
    buildKeyword(keyword);
    buildIdentifier(name);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "from" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierPath(identifier);
        })
        .with({ kind: "filter" }, ({ keyword, expr }) => {
          buildKeyword(keyword);
          buildExpr(expr);
        })
        .with({ kind: "orderBy" }, ({ keyword, orderBy }) => {
          buildKeyword(keyword);
          orderBy.forEach((orderBy) => {
            buildIdentifier(orderBy.identifier);
            if ("keyword" in orderBy) buildKeyword(orderBy.keyword);
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
    buildIdentifier(name);
    buildExpr(expr);
  }

  function buildValidator(validator: Validator) {
    match(validator)
      .with({ kind: "builtin" }, ({ name, args }) => {
        buildIdentifier(name);
        args.forEach(buildLiteral);
      })
      .with({ kind: "hook" }, buildUnnamedHook)
      .exhaustive();
  }

  function buildEntrypoint({ keyword, atoms }: Entrypoint) {
    buildKeyword(keyword);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "target" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierAs(identifier);
        })
        .with({ kind: "identifyWith" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifier(identifier);
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

  function buildEndpoint({ keyword, atoms }: Endpoint) {
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
        .exhaustive()
    );
  }

  function buildAction({ keyword, target, atoms }: Action) {
    buildKeyword(keyword);
    if (target) buildIdentifierPathAs(target);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "set" }, buildActionAtomSet)
        .with({ kind: "referenceThrough" }, () => buildActionAtomReferenceThrough)
        .with({ kind: "deny" }, () => buildActionAtomDeny)
        .with({ kind: "input" }, () => buildActionAtomInput)
        .exhaustive()
    );
  }

  function buildActionAtomSet({ keyword, target, set }: ActionAtomSet) {
    buildKeyword(keyword);
    buildIdentifier(target);
    match(set)
      .with({ kind: "hook" }, buildUnnamedHook)
      .with({ kind: "expr" }, ({ expr }) => buildExpr(expr))
      .exhaustive();
  }

  function buildActionAtomReferenceThrough({
    keyword,
    target,
    through,
  }: ActionAtomReferenceThrough) {
    buildKeyword(keyword);
    buildIdentifier(target);
    buildIdentifier(through);
  }

  function buildActionAtomDeny({ keyword, fields }: ActionAtomDeny) {
    buildKeyword(keyword);
    match(fields)
      .with({ kind: "all" }, ({ keyword }) => buildKeyword(keyword))
      .with({ kind: "list" }, ({ fields }) => fields.forEach(buildIdentifier))
      .exhaustive();
  }

  function buildActionAtomInput({ keyword, fields }: ActionAtomInput) {
    buildKeyword(keyword);
    fields.forEach(({ field, atoms }) => {
      buildIdentifier(field);
      atoms.forEach((a) =>
        match(a)
          .with({ kind: "optional" }, ({ keyword }) => {
            buildKeyword(keyword);
          })
          .with({ kind: "default_literal" }, ({ keyword, value }) => {
            buildKeyword(keyword);
            buildLiteral(value);
          })
          .with({ kind: "default_reference" }, ({ keyword, value }) => {
            buildKeyword(keyword);
            buildIdentifierPath(value);
          })
          .exhaustive()
      );
    });
  }

  function buildPopulator({ keyword, name, atoms }: Populator) {
    buildKeyword(keyword);
    buildIdentifier(name);
    atoms.forEach((a) => match(a).with({ kind: "populate" }, buildPopulate).exhaustive());
  }

  function buildPopulate({ keyword, atoms }: Populate) {
    buildKeyword(keyword);
    atoms.forEach((a) =>
      match(a)
        .with({ kind: "target" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifierAs(identifier);
        })
        .with({ kind: "identify" }, ({ keyword, identifier }) => {
          buildKeyword(keyword);
          buildIdentifier(identifier);
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

  function buildUnnamedHook(hook: UnnamedHook) {
    buildKeyword(hook.keyword);
    hook.atoms.forEach(buildHookAtom);
  }

  function buildHook(hook: Hook) {
    buildKeyword(hook.keyword);
    buildIdentifier(hook.name);
    hook.atoms.forEach(buildHookAtom);
  }

  function buildHookAtom(atom: HookAtom) {
    match(atom)
      .with({ kind: "arg_expr" }, ({ keyword, name, expr }) => {
        buildKeyword(keyword);
        buildIdentifier(name);
        buildExpr(expr);
      })
      .with({ kind: "default_arg" }, ({ keyword, name }) => {
        buildKeyword(keyword);
        buildIdentifier(name);
      })
      .with({ kind: "source" }, ({ keyword, name, keywordFrom, file }) => {
        buildKeyword(keyword);
        buildIdentifier(name);
        buildKeyword(keywordFrom);
        buildLiteral(file);
      })
      .with({ kind: "inline" }, ({ keyword, code }) => {
        buildKeyword(keyword);
        buildLiteral(code);
      })
      .exhaustive();
  }

  function buildSelect(select: Select) {
    select.forEach(({ identifier, select }) => {
      buildIdentifier(identifier);
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
      .with({ kind: "identifierPath" }, ({ identifierPath }) => buildIdentifierPath(identifierPath))
      .with({ kind: "literal" }, ({ literal }) => buildLiteral(literal))
      .with({ kind: "function" }, ({ name, args }) => {
        buildIdentifier(name);
        args.forEach(buildExpr);
      })
      .exhaustive();
  }

  function buildLiteral(literal: Literal) {
    match(literal)
      .with({ kind: "integer" }, { kind: "float" }, ({ token }) =>
        addToken(token, TokenTypes.number)
      )
      .with({ kind: "boolean" }, { kind: "null" }, ({ token }) =>
        addToken(
          token,
          TokenTypes.variable,
          TokenModifiers.defaultLibrary | TokenModifiers.readonly
        )
      )
      .with({ kind: "string" }, ({ token }) => addToken(token, TokenTypes.string))
      .exhaustive();
    return addToken(literal.token, TokenTypes.variable);
  }

  function buildIdentifier(identifier: Identifier) {
    return addToken(identifier.token, TokenTypes.variable);
  }

  function buildIdentifierAs({ identifier, as }: IdentifierAs) {
    buildIdentifier(identifier);
    if (as) buildIdentifier(as);
  }

  function buildIdentifierPath(identifierPath: IdentifierPath) {
    identifierPath.map(buildIdentifier);
  }

  function buildIdentifierPathAs({ identifierPath, as }: IdentifierPathAs) {
    buildIdentifierPath(identifierPath);
    if (as) buildIdentifier(as);
  }

  function buildKeyword(keyword: TokenData) {
    return addToken(keyword, TokenTypes.keyword);
  }

  function buildOperator(operator: TokenData) {
    return addToken(operator, TokenTypes.operator);
  }

  const source = document.getText();
  const { ast } = parse(source);
  buildDefinition(ast);
}

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return { data: [] };
  }
  const builder = getTokenBuilder(document);
  buildTokens(builder, document);
  return builder.build();
});

connection.listen();
