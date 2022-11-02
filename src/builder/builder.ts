import fs from "fs";
import path from "path";

import { storeTemplateOutput } from "@src/builder/renderer/renderer";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@src/builder/renderer/templates/schema.prisma.tpl";
import { Definition } from "@src/types/definition";

const DB_PROVIDER = "postgresql";

export async function build(definition: Definition, outputFolder: string): Promise<void> {
  /* TODO

 - server (express)
 	* read env/config with defaults
 - model
 	* many-to-many relations
 - fieldset
 - entrypoint
 - action
*/

  setupOutputFolder(outputFolder);
  await buildDefinition({ definition }, outputFolder);
  await buildDb({ definition, dbProvider: DB_PROVIDER }, outputFolder);
}

// -------------------- part builders

// ---------- Setup output

function setupOutputFolder(outputFolder: string) {
  // clear output folder
  if (!fs.existsSync(outputFolder)) {
    // (re)create output folder
    fs.mkdirSync(outputFolder, { recursive: true });
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
