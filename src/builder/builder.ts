import fs from "fs";
import path from "path";

import { render, renderTemplate, storeTemplateOutput } from "./render/renderer";

import { Definition } from "@src/types/definition";

// TODO: read from config
const SERVER_PORT = 3001;
const TEMPLATE_PATH = path.join(__dirname, "templates");
const OUTPUT_PATH = path.join(process.cwd(), "./dist/output");

export async function build(definition: Definition): Promise<void> {
  /* TODO

 - server (express)
 	* read env/config with defaults
 - model
 	* many-to-many relations
 - fieldset
 - entrypoint
 - action
*/

  prepareOutputFolder();
  buildIndex();
  await buildDbSchema({ definition });
  await buildServer({
    serverPort: SERVER_PORT,
  });
}

// -------------------- part builders

// ---------- Output

function prepareOutputFolder() {
  // clear output folder
  if (!fs.existsSync(OUTPUT_PATH)) {
    fs.rmSync(OUTPUT_PATH, { recursive: true, force: true });
  }

  // (re)create output folder
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

// ---------- Index

export async function renderIndex(): Promise<string> {
  return renderTemplate(path.join(TEMPLATE_PATH, "index.eta"));
}

async function buildIndex() {
  return renderIndex().then((content) =>
    storeTemplateOutput(path.join(OUTPUT_PATH, "index.js"), content)
  );
}

// ---------- DB

export type BuildDbSchemaData = { definition: Definition };

export async function renderDbSchema(data: BuildDbSchemaData): Promise<string> {
  return renderTemplate(path.join(TEMPLATE_PATH, "db/schema.prisma.eta"), data);
}

async function buildDbSchema(data: BuildDbSchemaData): Promise<void> {
  return renderDbSchema(data).then((content) =>
    storeTemplateOutput(path.join(OUTPUT_PATH, "db/schema.prisma"), content)
  );
}

// ---------- Server

export type BuildServerData = {
  serverPort: number;
};

export async function renderServer(data: BuildServerData): Promise<string> {
  return renderTemplate(path.join(OUTPUT_PATH, "server.js"), data);
}

async function buildServer(data: BuildServerData): Promise<void> {
  return renderServer(data).then((content) => {
    storeTemplateOutput(path.join(OUTPUT_PATH, "server.js"), content);
  });
}
