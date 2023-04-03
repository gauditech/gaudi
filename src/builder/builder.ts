import fs from "fs";
import path from "path";

import { DiagnosticCategory, Project, ScriptTarget } from "ts-morph";

import { buildEntrypoints } from "@src/builder/admin";
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
import { assertUnreachable } from "@src/common/utils";
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
        case "js": {
          let entrypoints;
          switch (g.api) {
            case "entrypoint":
              entrypoints = definition.entrypoints;
              break;
            case "model":
              entrypoints = buildEntrypoints(definition);
              break;
            default:
              assertUnreachable(g.api);
          }

          // TODO: define a fixed starting point for relative generator output folders (eg. blueprint location)
          const outFolder = g.output ?? path.join(outputFolder, "client");
          const outFileName = `api-client-${g.api}.ts`;
          const outPath = path.join(outFolder, outFileName);

          return (
            renderApiClient({ definition, entrypoints })
              .then((content) => {
                return storeTemplateOutput(outPath, content);
              })
              // compile client TS file to JS and DTS files
              .then(async (templateChanged) => {
                if (templateChanged) {
                  const project = new Project({
                    compilerOptions: {
                      declaration: true,
                      target: ScriptTarget.ES5,
                      strict: true,
                      // these settings make emitting much faster (https://github.com/dsherret/ts-morph/issues/149)
                      isolatedModules: true,
                      noResolve: true,
                    },
                  });
                  const sourceFile = project.addSourceFileAtPath(outPath);

                  const diagnostics = sourceFile.getPreEmitDiagnostics();

                  // no errors, we can emit files
                  if (diagnostics.length === 0) {
                    console.log(`Compiling API client source file: "${outFileName}"`);
                    const t0 = Date.now();
                    sourceFile.formatText();

                    return project.emit().then(() => {
                      console.log(`Source file compiled [${Date.now() - t0} ms]`);
                    });
                  }
                  // has errors, no emit
                  else {
                    console.log(`Error compiling API client source file: ${outPath}`);

                    for (const diagnostic of diagnostics) {
                      console.log(
                        `  ${DiagnosticCategory[diagnostic.getCategory()]}:`,
                        `${diagnostic
                          .getSourceFile()
                          ?.getBaseName()}:${diagnostic.getLineNumber()}`,
                        diagnostic.getMessageText()
                      );
                    }
                  }
                } else {
                  console.log(`API client not changed. Building skipped for: "${outFileName}".`);
                }
              })
          );
        }
        default:
          assertUnreachable(kind);
      }
    })
  );
}
