import fs from "fs";
import path from "path";

import { sync as glob } from "fast-glob";
import {
  Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  FileChangeType,
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
import { URI } from "vscode-uri";

import { compileToAST } from "..";
import { GlobalAtom, ProjectASTs, TokenData } from "../ast/ast";
import { CompilerError } from "../compilerError";

import { TokenModifiers, TokenTypes, buildTokens } from "./tokenBuilder";

import { readConfig } from "@compiler/config";

const connection: ProposedFeatures.Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

documents.listen(connection);

connection.onInitialize((params) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: {
        documentSelector: [{ language: "gaudi" }],
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

const managedFiles: Map<string, string> = new Map();
type Project = {
  configUri: string;
  inputFolder: string;
  ast: ProjectASTs;
};
const projects: Map<string, Project> = new Map();
const nonProjectFiles: Map<string, GlobalAtom[]> = new Map();

connection.onInitialized(() => {
  connection.workspace.connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: [{ globPattern: "**/gaudiconfig.{json,yaml}" }],
  });
});

connection.onDidChangeWatchedFiles(({ changes }) => {
  for (const { type, uri } of changes) {
    if (type === FileChangeType.Deleted) {
      projects.delete(uri);
      continue;
    }

    const configFile = uriToPath(uri);
    if (!configFile) {
      continue;
    }

    const config = readConfig(configFile);
    // paths from readConfig must be converted to absolute paths
    const inputFolder = path.resolve(process.cwd(), config.inputFolder);
    const project = projects.get(uri);

    if (project && inputFolder === project.inputFolder) {
      continue;
    }

    compileProject(uri, inputFolder);
  }
});

function uriToPath(uri: string): string | undefined {
  const { fsPath, scheme } = URI.parse(uri);
  if (scheme === "file") {
    return fsPath;
  }
  return undefined;
}

function readGaudiFiles(directory: string): Map<string, string> {
  const filepaths = glob(`${directory}/**/*.gaudi`);
  const files = new Map<string, string>();
  for (const filepath of filepaths) {
    const uri = URI.file(filepath).toString();
    const managedFile = managedFiles.get(uri);
    if (managedFile) {
      files.set(uri, managedFile);
    } else {
      files.set(uri, fs.readFileSync(filepath).toString("utf-8"));
    }
  }
  return files;
}

function compileProject(configUri: string, inputFolder: string) {
  const files = readGaudiFiles(inputFolder);
  const inputs = [...files.entries()].map(([filename, source]) => ({ source, filename }));

  const result = compileToAST(inputs);

  const diagnosticsByFile = new Map(
    inputs.map(({ filename }): [string, Diagnostic[]] => [filename, []])
  );

  result.errors?.forEach((error) => {
    const diagnostic = errorToDiagnostic(error);
    diagnosticsByFile.get(error.errorPosition.filename)?.push(diagnostic);
  });

  for (const [filename, diagnostics] of diagnosticsByFile) {
    connection.sendDiagnostics({ uri: filename, diagnostics });
  }

  if (result.ast) {
    const project: Project = { configUri, inputFolder, ast: result.ast };
    projects.set(configUri, project);
  } else {
    projects.delete(configUri);
  }
}

function compileNonProjectFile(document: TextDocument) {
  const result = compileToAST([{ filename: document.uri, source: document.getText() }]);

  const diagnostics = result.errors?.map(errorToDiagnostic) ?? [];

  connection.sendDiagnostics({ uri: document.uri, diagnostics });

  const ast = result.ast?.documents.get(document.uri);
  if (ast) {
    nonProjectFiles.set(document.uri, ast);
  } else {
    nonProjectFiles.delete(document.uri);
  }
}

function errorToDiagnostic(error: CompilerError): Diagnostic {
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: {
        line: error.errorPosition.start.line - 1,
        character: error.errorPosition.start.column - 1,
      },
      end: {
        line: error.errorPosition.end.line - 1,
        character: error.errorPosition.end.column,
      },
    },
    message: error.message,
    source: "gaudi",
  };
}

function findProjectFromFile(uri: string): Project | undefined {
  for (const project of projects.values()) {
    if (uriToPath(uri)?.startsWith(project.inputFolder)) {
      return project;
    }
  }
  return undefined;
}

documents.onDidChangeContent((change) => {
  managedFiles.set(change.document.uri, change.document.getText());
  const project = findProjectFromFile(change.document.uri);
  let configUri, inputFolder;
  if (!project) {
    const filename = uriToPath(change.document.uri);
    let config;
    try {
      config = filename ? readConfig(path.dirname(filename)) : undefined;
    } catch {
      config = undefined;
    }
    // paths from readConfig must be converted to absolute paths
    const cwd = process.cwd();
    configUri = config && URI.file(path.resolve(cwd, config.configFile)).toString();
    inputFolder = config && path.resolve(cwd, config.inputFolder);
    if (!configUri || !inputFolder || !filename?.startsWith(inputFolder)) {
      return compileNonProjectFile(change.document);
    }
  } else {
    configUri = project.configUri;
    inputFolder = project.inputFolder;
  }
  compileProject(configUri, inputFolder);
});

function buildSemanticTokens(document: TextDocument): SemanticTokens | ResponseError {
  const ast =
    findProjectFromFile(document.uri)?.ast.documents.get(document.uri) ??
    nonProjectFiles.get(document.uri);
  if (!ast) {
    return new ResponseError<void>(LSPErrorCodes.ServerCancelled, "");
  }

  const builder = new SemanticTokensBuilder();
  function addToken(
    token: TokenData,
    tokenType: TokenTypes,
    tokenModifiers: TokenModifiers = TokenModifiers.none
  ) {
    const line = token.start.line - 1;
    const character = token.start.column - 1;
    const length = token.end.column - token.start.column + 1;

    builder.push(line, character, length, tokenType, tokenModifiers);
  }
  buildTokens(ast, addToken);
  return builder.build();
}

connection.languages.semanticTokens.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return { data: [] };
  }
  const r = buildSemanticTokens(document);
  return r;
});

connection.listen();
