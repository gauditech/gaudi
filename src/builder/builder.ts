import fs from "fs";
import path from "path";

import { applyDbChanges } from "@src/builder/migrator/migrator";
import { storeTemplateOutput } from "@src/builder/renderer/renderer";
import { render as renderIndexTpl } from "@src/builder/renderer/templates/index.tpl";
import {
  BuildPackageData,
  render as renderPackageTpl,
} from "@src/builder/renderer/templates/package.json.tpl";
import {
  BuildDbSchemaData,
  render as renderDbSchemaTpl,
} from "@src/builder/renderer/templates/schema.prisma.tpl";
import { render as renderServerCommonTpl } from "@src/builder/renderer/templates/server/common.tpl";
import {
  RenderEndpointsData,
  render as renderEndpointsTpl,
} from "@src/builder/renderer/templates/server/endpoints.tpl";
import {
  BuildServerData,
  render as renderServerTpl,
} from "@src/builder/renderer/templates/server/server.tpl";
import { Definition } from "@src/types/definition";

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

  setupOutputFolder();
  buildPackage({
    package: { name: APP_NAME, description: PACKAGE_DESCRIPTION, version: PACKAGE_VERSION },
  });
  buildIndex();
  await buildDb({ definition, dbProvider: DB_PROVIDER, dbConnectionUrl: DB_CONNECTION_URL });
  await buildServer({
    serverPort: SERVER_PORT,
  });
  await buildServerCommon();
  await buildServerEndpoints({ definition });
}

// -------------------- part builders

// ---------- Output

function setupOutputFolder() {
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
  const outFile = path.join(OUTPUT_PATH, "package.json");

  return renderPackage(data).then((content) => storeTemplateOutput(outFile, content));
}

// ---------- Index

export async function renderIndex(): Promise<string> {
  return renderIndexTpl();
}

async function buildIndex() {
  const outFile = path.join(OUTPUT_PATH, "index.js");

  return renderIndex().then((content) => storeTemplateOutput(outFile, content));
}

// ---------- DB

export async function renderDbSchema(data: BuildDbSchemaData): Promise<string> {
  return renderDbSchemaTpl(data);
}

async function buildDb(data: BuildDbSchemaData): Promise<void> {
  const outFile = path.join(DB_OUTPUT_PATH, "db/schema.prisma");

  return (
    // render DB schema
    renderDbSchema(data)
      .then((content) => storeTemplateOutput(outFile, content))
      // apply DB schema
      .then(() => {
        applyDbChanges({ schema: outFile });
      })
  );
}

// ---------- Server

// --- Main

export async function renderServer(data: BuildServerData): Promise<string> {
  return renderServerTpl(data);
}

async function buildServer(data: BuildServerData): Promise<void> {
  return renderServer(data).then((content) => {
    storeTemplateOutput(path.join(OUTPUT_PATH, "server/main.js"), content);
  });
}

// --- Common

export async function renderServerCommon(): Promise<string> {
  return renderServerCommonTpl();
}

async function buildServerCommon(): Promise<void> {
  const outFile = path.join(OUTPUT_PATH, "server/common.js");

  return renderServerCommon().then((content) => storeTemplateOutput(outFile, content));
}

// --- Endpoints

export async function renderServerEndpoints(data: RenderEndpointsData): Promise<string> {
  return renderEndpointsTpl(data);
}

async function buildServerEndpoints(data: RenderEndpointsData): Promise<void> {
  const outFile = path.join(OUTPUT_PATH, "server/endpoints.js");

  return renderServerEndpoints(data).then((content) => storeTemplateOutput(outFile, content));
}
