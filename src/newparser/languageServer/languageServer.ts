import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ProposedFeatures,
  SemanticTokensBuilder,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node";

import { TokenData } from "../ast/ast";
import { parse } from "../parser";

import { TokenModifiers, TokenTypes, buildTokens } from "./tokenBuilder";

const connection: ProposedFeatures.Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

documents.listen(connection);

documents.onWillSave((_event) => {
  connection.console.log("On Will save received");
});

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

function buildSemanticTokens(builder: SemanticTokensBuilder, document: TextDocument) {
  function addToken(token: TokenData, tokenType: TokenTypes, tokenModifiers: TokenModifiers = 0) {
    const { character, line } = document.positionAt(token.start);
    const length = token.end - token.start + 1;

    builder.push(line, character, length, tokenType, tokenModifiers);
  }

  const source = document.getText();
  const { ast } = parse(source);
  if (ast) buildTokens(ast, addToken);
}

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return { data: [] };
  }
  const builder = getTokenBuilder(document);
  buildSemanticTokens(builder, document);
  return builder.build();
});

connection.listen();
