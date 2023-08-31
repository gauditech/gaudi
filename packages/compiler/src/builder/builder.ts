import fs from "fs";
import path from "path";

import { Diagnostic, DiagnosticCategory, ModuleKind, Project, ScriptTarget, ts } from "ts-morph";

import { storeTemplateOutput } from "@compiler/builder/renderer/renderer";
import {
  BuildApiClientData,
  render as renderApiClientTpl,
} from "@compiler/builder/renderer/templates/apiClient.tpl";
import {
  OpenApiBuilderData,
  render as renderOpenApiTpl,
} from "@compiler/builder/renderer/templates/openapi.tpl";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@compiler/builder/renderer/templates/schema.prisma.tpl";
import { kindFilter, kindFind } from "@compiler/common/kindFilter";
import { initLogger } from "@compiler/common/logger";
import { assertUnreachable } from "@compiler/common/utils";
import { Definition } from "@compiler/types/definition";

const logger = initLogger("gaudi:compiler");

export const BUILDER_OPENAPI_SPEC_DIRECTORY = "api-spec";
export const BUILDER_OPENAPI_SPEC_FILE_NAME = "api.openapi.json";

export type BuilderConfig = {
  outputDirectory: string;
  gaudiDirectory: string;
  dbProvider: "postgresql" | "sqlite";
};

export async function build(definition: Definition, config: BuilderConfig): Promise<void> {
  setupDirectory(config.outputDirectory);
  setupDirectory(config.gaudiDirectory);

  await buildDefinition({ definition }, config.outputDirectory);
  await buildDb({ definition, dbProvider: config.dbProvider }, config.gaudiDirectory);
  await buildApiClients(definition, config.outputDirectory);
  await buildOpenApi(definition, config.outputDirectory);
}

// -------------------- part builders

// ---------- Setup directories

/** Make sure directory exists */
function setupDirectory(path: string) {
  // clear output directory
  if (!fs.existsSync(path)) {
    // (re)create output directory
    fs.mkdirSync(path, { recursive: true });
  }
}

// ---------- Definition

type BuildDefinitionData = {
  definition: Definition;
};

export async function renderDefinition(data: BuildDefinitionData): Promise<string> {
  return JSON.stringify(data.definition);
}

async function buildDefinition(data: BuildDefinitionData, outputDirectory: string) {
  const outFile = path.join(outputDirectory, "definition.json");

  return renderDefinition(data).then((content) => storeTemplateOutput(outFile, content));
}

// ---------- DB

export async function renderDbSchema(data: BuildDbSchemaData): Promise<string> {
  return renderDbSchemaTpl(data);
}

async function buildDb(data: BuildDbSchemaData, outputDirectory: string): Promise<unknown> {
  const outFile = path.join(outputDirectory, "db/schema.prisma");

  return (
    // render DB schema
    renderDbSchema(data).then((content) => storeTemplateOutput(outFile, content))
  );
}

// ---------- OpenAPI

export async function renderOpenApi(data: OpenApiBuilderData): Promise<string> {
  return renderOpenApiTpl(data);
}

async function buildOpenApi(definition: Definition, outputDirectory: string): Promise<unknown> {
  const apidocsGenerator = kindFind(definition.generators, "generator-apidocs");

  if (apidocsGenerator) {
    const outFile = path.join(
      outputDirectory,
      BUILDER_OPENAPI_SPEC_DIRECTORY,
      BUILDER_OPENAPI_SPEC_FILE_NAME
    );

    return (
      // render DB schema
      renderOpenApi({ definition, basePath: apidocsGenerator.basePath }).then((content) =>
        storeTemplateOutput(outFile, content)
      )
    );
  }
  // no generator
}

// ---------- API client

export async function renderApiClient(data: BuildApiClientData): Promise<string> {
  return renderApiClientTpl(data);
}

export async function buildApiClients(
  definition: Definition,
  outputDirectory: string
): Promise<unknown> {
  const clientGenerators = kindFilter(definition.generators, "generator-client");

  return Promise.all(
    clientGenerators.map((g) => {
      const kind = g.target;
      switch (kind) {
        case "ts": {
          // TODO: define a fixed starting point for relative generator output directories (eg. blueprint location)
          const outDirectory = g.output ?? path.join(outputDirectory, "client");
          const outFileName = `api-client.ts`;
          const outPath = path.join(outDirectory, outFileName);

          const t0 = Date.now(); // start timer

          return (
            renderApiClient({ definition, apis: definition.apis })
              // parse&save
              .then((content) => {
                // use TS compiler to check if content is valid
                const project = new Project({
                  compilerOptions: {
                    // let's support max 3 years old syntax level
                    target: ScriptTarget.ES2020,
                    module: ModuleKind.CommonJS,
                    declaration: true,
                    strict: true,
                    // these settings make emitting much faster (https://github.com/dsherret/ts-morph/issues/149)
                    isolatedModules: true,
                    noResolve: true,
                  },
                });
                // create virtual source file
                const sourceFile = project.createSourceFile(outPath, content, {
                  overwrite: true,
                });

                const diagnostics = sourceFile.getPreEmitDiagnostics();
                // no errors, we can emit files
                if (!hasTsErrors(diagnostics)) {
                  sourceFile.formatText({ indentSize: 2 });
                  sourceFile.save();

                  logger.debug(`Source file created [${Date.now() - t0} ms]: ${outPath}`);
                }
                // has errors, no emit
                else {
                  printTsError(diagnostics);

                  throw `Error creating API client source file: ${outPath}`;
                }
              })
          );
        }
        case "js": {
          // TODO: define a fixed starting point for relative generator output directories (eg. blueprint location)
          const outDirectory = g.output ?? path.join(outputDirectory, "client");
          const outFileName = `api-client.ts`;
          const outPath = path.join(outDirectory, outFileName);

          const t0 = Date.now(); // start timer

          return (
            renderApiClient({ definition, apis: definition.apis })
              // compile&emit
              .then(async (content) => {
                // TODO: add caching to avoid pointless slow compilations - but there is not file/cache to compare new content against
                const project = new Project({
                  compilerOptions: {
                    // let's support max 3 years old syntax level
                    target: ScriptTarget.ES2020,
                    module: ModuleKind.CommonJS,
                    declaration: true,
                    strict: true,
                    // these settings make emitting much faster (https://github.com/dsherret/ts-morph/issues/149)
                    isolatedModules: true,
                    noResolve: true,
                  },
                });
                // create virtual source file
                const sourceFile = project.createSourceFile(outPath, content, { overwrite: true });

                const diagnostics = sourceFile.getPreEmitDiagnostics();
                // no errors, we can emit files
                if (!hasTsErrors(diagnostics)) {
                  sourceFile.formatText();

                  return project.emit().then(() => {
                    // TODO: do we need to check after-emit diagnostics? this is truly an isolated module so maybe not?
                    logger.debug(`Source file compiled [${Date.now() - t0} ms]: ${outPath}`);
                  });
                }
                // has errors, no emit
                else {
                  printTsError(diagnostics);

                  throw `Error compiling API client source file: ${outPath}`;
                }
              })
          );
        }
        default:
          assertUnreachable(kind);
      }
    })
  );

  // --- utils

  function hasTsErrors(diagnostics: Diagnostic<ts.Diagnostic>[]) {
    return diagnostics.some((d) => d.getCategory() === DiagnosticCategory.Error);
  }

  function printTsError(diagnostics: Diagnostic<ts.Diagnostic>[]) {
    for (const diagnostic of diagnostics) {
      logger.debug(
        `  ${DiagnosticCategory[diagnostic.getCategory()]}:`,
        `${diagnostic.getSourceFile()?.getBaseName()}:${diagnostic.getLineNumber()}`,
        diagnostic.getMessageText()
      );
    }
  }
}
