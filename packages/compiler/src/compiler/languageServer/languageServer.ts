import fs from "fs";
import path from "path";

import { sync as glob } from "fast-glob";
import _ from "lodash";
import {
  Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  Location,
  ProposedFeatures,
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

import { SourceRef, findIdentifierFromPosition, getIdentifiers } from "./identifierSearch";
import { TokenModifiers, TokenTypes, buildTokens } from "./tokenBuilder";

import { readConfig } from "@compiler/config";

const connection: ProposedFeatures.Connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

documents.listen(connection);

connection.onInitialize((params) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      definitionProvider: !!params.capabilities.textDocument?.definition,
      referencesProvider: !!params.capabilities.textDocument?.references,
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
  identifiers: SourceRef[];
};
const projects: Map<string, Project> = new Map();
type NonProjectFile = {
  fileUri: string;
  ast: GlobalAtom[];
  identifiers: SourceRef[];
};
const nonProjectFiles: Map<string, NonProjectFile> = new Map();

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
    const identifiers = getIdentifiers(result.ast);
    const project: Project = { configUri, inputFolder, ast: result.ast, identifiers };
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
  if (result.ast && ast) {
    const identifiers = getIdentifiers(result.ast);
    nonProjectFiles.set(document.uri, { fileUri: document.uri, ast, identifiers });
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

function getAstFromUri(uri: string): GlobalAtom[] | undefined {
  return findProjectFromFile(uri)?.ast.documents.get(uri) ?? nonProjectFiles.get(uri)?.ast;
}

function getIdentifiersFromUri(uri: string): SourceRef[] | undefined {
  return findProjectFromFile(uri)?.identifiers ?? nonProjectFiles.get(uri)?.identifiers;
}

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  managedFiles.set(uri, change.document.getText());
  const project = findProjectFromFile(uri);
  let configUri, inputFolder;
  if (!project) {
    const filename = uriToPath(uri);
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

connection.languages.semanticTokens.on((params): SemanticTokens => {
  const uri = params.textDocument.uri;
  const ast = getAstFromUri(uri);
  if (!ast) {
    return { data: [] };
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
});

function gaudiTokenToLSPLocation({ filename, start, end }: TokenData): Location {
  return {
    uri: filename,
    range: {
      start: { line: start.line - 1, character: start.column - 1 },
      end: { line: end.line - 1, character: end.column },
    },
  };
}

connection.onDefinition((params): Location | undefined => {
  const uri = params.textDocument.uri;
  const ids = getIdentifiersFromUri(uri);
  if (!ids) {
    return undefined;
  }
  const clickedId = findIdentifierFromPosition(
    ids,
    {
      line: params.position.line + 1,
      column: params.position.character,
    },
    uri
  );
  if (!clickedId) {
    return undefined;
  }
  if (clickedId.isDefinition) {
    return gaudiTokenToLSPLocation(clickedId.token);
  }
  for (const { isDefinition, ref, token } of ids) {
    if (isDefinition && _.isEqual(ref, clickedId.ref)) {
      return gaudiTokenToLSPLocation(token);
    }
  }
  return undefined;
});

connection.onReferences((params): Location[] | undefined => {
  const uri = params.textDocument.uri;
  const ids = getIdentifiersFromUri(uri);
  if (!ids) {
    return undefined;
  }
  const clickedId = findIdentifierFromPosition(
    ids,
    {
      line: params.position.line + 1,
      column: params.position.character,
    },
    uri
  );
  if (!clickedId) {
    return undefined;
  }
  return ids
    .filter(({ isDefinition, ref }) => !isDefinition && _.isEqual(ref, clickedId.ref))
    .map(({ token }) => gaudiTokenToLSPLocation(token));
});

connection.listen();
