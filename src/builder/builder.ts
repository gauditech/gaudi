import fs from "fs";
import path from "path";

import { storeTemplateOutput } from "@src/builder/renderer/renderer";
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
  /* TODO

 - server (express)
 	* read env/config with defaults
 - model
 	* many-to-many relations
 - fieldset
 - entrypoint
 - action
*/

  setupFolder(config.outputFolder);
  setupFolder(config.gaudiFolder);

  await buildDefinition({ definition }, config.outputFolder);
  await buildDb({ definition, dbProvider: DB_PROVIDER }, config.gaudiFolder);
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
