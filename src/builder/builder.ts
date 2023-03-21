import fs from "fs";
import path from "path";

import { DiagnosticCategory, Project, ScriptTarget } from "ts-morph";

import { storeTemplateOutput } from "@src/builder/renderer/renderer";
import {
  BuildApiClientData,
  render as renderApiClientTpl,
} from "@src/builder/renderer/templates/api-client-browser.tpl";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@src/builder/renderer/templates/schema.prisma.tpl";
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
  await buildApiClient({ definition }, config.outputFolder);
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

async function buildApiClient(data: BuildApiClientData, outputFolder: string): Promise<unknown> {
  const outFile = path.join(outputFolder, "client/api-client.ts");

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
            target: ScriptTarget.ES2015,
            strict: true,
          },
        });
        const sourceFile = project.addSourceFileAtPath(outFile);

        const diagnostics = sourceFile.getPreEmitDiagnostics();

        if (diagnostics.length === 0) {
          console.log(`Compiled API client source file: ${outFile}`);
          return project.emit();
        } else {
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
