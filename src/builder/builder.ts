import fs from "fs";
import path from "path";

import { applyDbChanges } from "@src/builder/migrator/migrator";
import { storeTemplateOutput } from "@src/builder/renderer/renderer";
import { Definition } from "@src/types/definition";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@src/builder/renderer/templates/schema.prisma.tpl";
import {
  BuildPackageData,
  render as renderPackageTpl,
} from "@src/builder/renderer/templates/package.json.tpl";
import {
  BuildServerData,
  render as renderServerTpl,
} from "@src/builder/renderer/templates/server.tpl";
import { render as renderIndexTpl } from "@src/builder/renderer/templates/index.tpl";

// TODO: read from definition
const APP_NAME = "demoapp";
const PACKAGE_DESCRIPTION = "Demo app built by Gaudi";
const PACKAGE_VERSION = "0.0.1";
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
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.rmSync(OUTPUT_PATH, { recursive: true, force: true });
  }

  // (re)create output folder
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

// ---------- Package

export async function renderPackage(data: BuildPackageData): Promise<string> {
  return renderPackageTpl(data);
}

async function buildPackage(data: BuildPackageData) {
  return renderPackage(data).then((content) =>
    storeTemplateOutput(path.join(OUTPUT_PATH, "package.json"), content)
  );
}

// ---------- Index

export async function renderIndex(): Promise<string> {
  return renderIndexTpl();
}

async function buildIndex() {
  return renderIndex().then((content) =>
    storeTemplateOutput(path.join(OUTPUT_PATH, "index.js"), content)
  );
}

// ---------- DB

export async function renderDbSchema(data: BuildDbSchemaData): Promise<string> {
  return renderDbSchemaTpl(data);
}

async function buildDb(data: BuildDbSchemaData): Promise<void> {
  const schemaFile = path.join(DB_OUTPUT_PATH, "db/schema.prisma");

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

export async function renderServer(data: BuildServerData): Promise<string> {
  return renderServerTpl(data);
}

async function buildServer(data: BuildServerData): Promise<void> {
  return renderServer(data).then((content) => {
    storeTemplateOutput(path.join(OUTPUT_PATH, "server.js"), content);
  });
}
