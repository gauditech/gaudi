import fs from "fs";
import path from "path";

import { applyDbChanges } from "@src/builder/migration/migrator";
import { renderTemplate, storeTemplateOutput } from "@src/builder/render/renderer";
import { Definition } from "@src/types/definition";

// TODO: read from definition
const APP_NAME = "demoapp";
const PACKAGE_DESCRIPTION = "Demo app built by Gaudi";
const PACKAGE_VERSION = "0.0.1";
const TEMPLATE_PATH = path.join(__dirname, "templates");
const OUTPUT_PATH = path.join(process.cwd(), "./output");
const DB_OUTPUT_PATH = `${OUTPUT_PATH}/db`;
const SERVER_PORT = 3001;
const DB_PROVIDER = "postgresql";
const DB_CONNECTION_URL = "postgresql://gaudi:gaudip@localhost:5432/gaudi";

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
  buildPackage({
    package: { name: APP_NAME, description: PACKAGE_DESCRIPTION, version: PACKAGE_VERSION },
  });
  buildIndex();
  await buildDb({ definition, dbProvider: DB_PROVIDER, dbConnectionUrl: DB_CONNECTION_URL });
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

// ---------- Package

export type BuildPackageData = {
  package: {
    name: string;
    description: string;
    version: string;
  };
};

export async function renderPackage(data: BuildPackageData): Promise<string> {
  return renderTemplate(path.join(TEMPLATE_PATH, "package.json.eta"), data);
}

async function buildPackage(data: BuildPackageData) {
  return renderPackage(data).then((content) =>
    storeTemplateOutput(path.join(OUTPUT_PATH, "package.json"), content)
  );
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

export type BuildDbSchemaData = {
  definition: Definition;
  dbProvider: string;
  dbConnectionUrl: string;
};

export async function renderDbSchema(data: BuildDbSchemaData): Promise<string> {
  return renderTemplate(path.join(TEMPLATE_PATH, "db/schema.prisma.eta"), data);
}

async function buildDb(data: BuildDbSchemaData): Promise<void> {
  const schemaFile = path.join(DB_OUTPUT_PATH, "/schema.prisma");

  return (
    // render DB schema
    renderDbSchema(data)
      .then((content) => storeTemplateOutput(schemaFile, content))
      // apply DB schema
      .then(() => {
        applyDbChanges({ schema: schemaFile });
      })
  );
}

// ---------- Server

export type BuildServerData = {
  serverPort: number;
};

export async function renderServer(data: BuildServerData): Promise<string> {
  return renderTemplate(path.join(TEMPLATE_PATH, "server.eta"), data);
}

async function buildServer(data: BuildServerData): Promise<void> {
  return renderServer(data).then((content) => {
    storeTemplateOutput(path.join(OUTPUT_PATH, "server.js"), content);
  });
}
