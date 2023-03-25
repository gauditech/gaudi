import fs from "fs";
import path from "path";

import { DiagnosticCategory, ModuleKind, Project, ScriptTarget } from "ts-morph";

import { storeTemplateOutput } from "@src/builder/renderer/renderer";
import {
  BuildApiClientData,
  render as renderApiClientTpl,
} from "@src/builder/renderer/templates/api-client-browser.tpl";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@src/builder/renderer/templates/schema.prisma.tpl";
import { kindFilter } from "@src/common/patternFilter";
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
  await buildApiClients({ definition }, config.outputFolder);
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
  data: BuildApiClientData,
  outputFolder: string
): Promise<unknown> {
  const clientGenerators = kindFilter(data.definition.generators, "generator-client");

  return Promise.all(
    clientGenerators.map((g) => {
      const kind = g.target;
      switch (kind) {
        case "js": {
          // check if definition output folder exists
          if (g.output != null && !fs.existsSync(g.output)) {
            throw new Error(`Client generator output path does not exist: "${g.output}"`);
          }

          // TODO: define a fixed starting point for relative generator output folders (eg. blueprint location)
          const outFolder = g.output ?? path.join(outputFolder, "client");
          const outFile = path.join(outFolder, "api-client.ts");

          return (
            renderApiClient(data)
              .then((content) => {
                storeTemplateOutput(outFile, content);
              })
              // compile client TS file to JS and DTS files
              .then(async () => {
                const project = new Project({
                  compilerOptions: {
                    declaration: true,
                    target: ScriptTarget.ES5,
                    strict: true,
                  },
                });
                const sourceFile = project.addSourceFileAtPath(outFile);

                const diagnostics = sourceFile.getPreEmitDiagnostics();

                // no errors, we can emit files
                if (diagnostics.length === 0) {
                  console.log(`Compiled API client source file: ${outFile}`);
                  return project.emit();
                }
                // has errors, no emit
                else {
                  console.log(`Error compiling API client source file: ${outFile}`);

                  for (const diagnostic of diagnostics) {
                    console.log(
                      `  ${DiagnosticCategory[diagnostic.getCategory()]}:`,
                      `${diagnostic.getSourceFile()?.getBaseName()}:${diagnostic.getLineNumber()}`,
                      diagnostic.getMessageText()
                    );
                  }
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
