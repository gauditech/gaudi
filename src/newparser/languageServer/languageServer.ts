import "../../common/setupAliases";

import { createHash } from "crypto";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Diagnostic,
  DiagnosticSeverity,
  ErrorCodes,
  ProposedFeatures,
  ResponseError,
  SemanticTokens,
  SemanticTokensBuilder,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node";

import { Definition, TokenData } from "../ast/ast";
import { checkForm } from "../checkForm";
import { CompilerError } from "../compilerError";
import { parse } from "../parser";
import { resolve } from "../resolver";

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

type CompileResult = {
  ast: Definition | undefined;
  compilerErrors: CompilerError[];
  success: boolean;
  errorMessage: string;
};

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

  const { ast, success: parseSuccess, lexerErrors, parserErrors } = parse(source);

  const compilerErrors: CompilerError[] = [];

  if (ast) {
    compilerErrors.push(...checkForm(ast));
    compilerErrors.push(...resolve(ast));
  }

  const success = parseSuccess && compilerErrors.length === 0;

  const result = {
    ast,
    compilerErrors,
    success,
    errorMessage: lexerErrors?.at(0)?.message ?? parserErrors?.at(0)?.message ?? "",
  };
  compiledFiles.set(document.uri, { hash, result });

  return result;
}

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(document: TextDocument): Promise<void> {
  const { compilerErrors } = compile(document);

  const diagnostics: Diagnostic[] = compilerErrors.map((error) => ({
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
  function addToken(token: TokenData, tokenType: TokenTypes, tokenModifiers: TokenModifiers = 0) {
    const { character, line } = document.positionAt(token.start);
    const length = token.end - token.start + 1;

    builder.push(line, character, length, tokenType, tokenModifiers);
  }

  const { ast, errorMessage } = compile(document);
  if (ast) {
    buildTokens(ast, addToken);
    return builder.build();
  }

  return new ResponseError<void>(ErrorCodes.ParseError, errorMessage);
}

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return { data: [] };
  }
  return buildSemanticTokens(document);
});

connection.listen();
