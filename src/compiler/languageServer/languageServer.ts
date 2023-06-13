import "../../common/setupAliases";

import { createHash } from "crypto";

import {
  Diagnostic,
  DiagnosticSeverity,
  LSPErrorCodes,
  ProposedFeatures,
  ResponseError,
  SemanticTokens,
  SemanticTokensBuilder,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { CompileResult, compileToAST } from "..";
import { TokenData } from "../ast/ast";

import { TokenModifiers, TokenTypes, buildTokens } from "./tokenBuilder";

const connection: ProposedFeatures.Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

documents.listen(connection);

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

const compiledFiles: Map<string, { hash: string; result: CompileResult }> = new Map();

function getFileHash(source: string): string {
  const hash = createHash("sha256");
  hash.update(source);
  return hash.digest("hex");
}

function compile(document: TextDocument): CompileResult {
  const source = document.getText();
  const hash = getFileHash(source);
  const previousCompilation = compiledFiles.get(document.uri);
  if (previousCompilation?.hash === hash) {
    return previousCompilation.result;
  }

  const result = compileToAST([{ source }]);
  compiledFiles.set(document.uri, { hash, result });
  return result;
}

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(document: TextDocument): Promise<void> {
  const { errors } = compile(document);

  const diagnostics: Diagnostic[] = errors.map((error) => ({
    severity: DiagnosticSeverity.Error,
    range: {
      start: document.positionAt(error.errorPosition.start),
      end: document.positionAt(error.errorPosition.end + 1),
    },
    message: error.message,
    source: document.uri,
  }));

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

function buildSemanticTokens(document: TextDocument): SemanticTokens | ResponseError {
  const builder = new SemanticTokensBuilder();
  function addToken(
    token: TokenData,
    tokenType: TokenTypes,
    tokenModifiers: TokenModifiers = TokenModifiers.none
  ) {
    const { character, line } = document.positionAt(token.start);
    const length = token.end - token.start + 1;

    builder.push(line, character, length, tokenType, tokenModifiers);
  }

  const { ast } = compile(document);
  if (!ast) {
    return new ResponseError<void>(LSPErrorCodes.ServerCancelled, "");
  }

  buildTokens(ast.document, addToken);
  return builder.build();
}

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return { data: [] };
  }
  return buildSemanticTokens(document);
});

connection.listen();
