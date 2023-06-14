import fs from "fs";
import path from "path";

import { Diagnostic, DiagnosticCategory, ModuleKind, Project, ScriptTarget, ts } from "ts-morph";

import { storeTemplateOutput } from "@src/builder/renderer/renderer";
import {
  BuildApiClientData,
  render as renderApiClientTpl,
} from "@src/builder/renderer/templates/apiClient.tpl";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@src/builder/renderer/templates/schema.prisma.tpl";
import { kindFilter } from "@src/common/kindFilter";
import { assertUnreachable, saveOutputFile } from "@src/common/utils";
import { Definition } from "@src/types/definition";

const DB_PROVIDER = "postgresql";

export type BuilderConfig = {
  outputFolder: string;
  gaudiFolder: string;
};

export async function build(definition: Definition, config: BuilderConfig): Promise<void> {
  setupFolder(config.outputFolder);
  setupFolder(config.gaudiFolder);

  await buildDefinition({ definition }, config.outputFolder);
  await buildDb({ definition, dbProvider: DB_PROVIDER }, config.gaudiFolder);
  await buildApiClients(definition, config.outputFolder);
}

// -------------------- part builders

// ---------- Setup folders

/** Make sure folder exists */
function setupFolder(path: string) {
  // clear output folder
  if (!fs.existsSync(path)) {
    // (re)create output folder
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

async function buildDefinition(data: BuildDefinitionData, outputFolder: string) {
  const outFile = path.join(outputFolder, "definition.json");

  return renderDefinition(data).then((content) => storeTemplateOutput(outFile, content));
}

// ---------- DB

export async function renderDbSchema(data: BuildDbSchemaData): Promise<string> {
  return renderDbSchemaTpl(data);
}

async function buildDb(data: BuildDbSchemaData, outputFolder: string): Promise<unknown> {
  const outFile = path.join(outputFolder, "db/schema.prisma");

  return (
    // render DB schema
    renderDbSchema(data).then((content) => storeTemplateOutput(outFile, content))
  );
}

// ---------- API client

export async function renderApiClient(data: BuildApiClientData): Promise<string> {
  return renderApiClientTpl(data);
}

export async function buildApiClients(
  definition: Definition,
  outputFolder: string
): Promise<unknown> {
  const clientGenerators = kindFilter(definition.generators, "generator-client");

  return Promise.all(
    clientGenerators.map((g) => {
      const kind = g.target;
      switch (kind) {
        case "ts": {
          // TODO: define a fixed starting point for relative generator output folders (eg. blueprint location)
          const outFolder = g.output ?? path.join(outputFolder, "client");
          const outFileName = `api-client.ts`;
          const outPath = path.join(outFolder, outFileName);

          const t0 = Date.now(); // start timer

          return (
            renderApiClient({ definition, apis: definition.apis })
              // parse&save
              .then((content) => {
                // use TS compiler to check if content is valid
                const project = new Project({
                  // not sure if we need any specific compiler options here cause we're only verifying TS content
                });
                // create virtual source file
                const sourceFile = project.createSourceFile(outPath, content, {
                  overwrite: true,
                });

                const diagnostics = sourceFile.getPreEmitDiagnostics();
                // no errors, we can emit files
                if (!hasTsErrors(diagnostics)) {
                  sourceFile.formatText();

                  // manually saving output file is nearly instant while ts-morph's `sourceFile.save()` is slower than emitting JS?!
                  saveOutputFile(outPath, sourceFile.getFullText());

                  console.log(`Source file created [${Date.now() - t0} ms]: ${outPath}`);
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
          // TODO: define a fixed starting point for relative generator output folders (eg. blueprint location)
          const outFolder = g.output ?? path.join(outputFolder, "client");
          const outFileName = `api-client.ts`;
          const outPath = path.join(outFolder, outFileName);

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
                    console.log(`Source file compiled [${Date.now() - t0} ms]: ${outPath}`);
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
      console.log(
        `  ${DiagnosticCategory[diagnostic.getCategory()]}:`,
        `${diagnostic.getSourceFile()?.getBaseName()}:${diagnostic.getLineNumber()}`,
        diagnostic.getMessageText()
      );
    }
  }
}
