import fs from "fs";
import path from "path";

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
const SERVER_PORT = 3001;
const DB_PROVIDER = "postgresql";
const DB_CONNECTION_URL = "postgresql://gaudi:gaudip@localhost:5432/gaudi";

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
  // buildPackage(
  //   {
  //     package: { name: APP_NAME, description: PACKAGE_DESCRIPTION, version: PACKAGE_VERSION },
  //   },
  //   outputFolder
  // );
  // buildIndex(outputFolder);
  await buildDefinition({ definition }, outputFolder);
  await buildDb(
    { definition, dbProvider: DB_PROVIDER, dbConnectionUrl: DB_CONNECTION_URL },
    outputFolder
  );
  // await buildServer(
  //   {
  //     serverPort: SERVER_PORT,
  //   },
  //   outputFolder
  // );
  // await buildServerCommon(outputFolder);
  // await buildServerEndpoints({ definition }, outputFolder);
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

// ---------- Package

export async function renderPackage(data: BuildPackageData): Promise<string> {
  return renderPackageTpl(data);
}

async function buildPackage(data: BuildPackageData, outputFolder: string) {
  const outFile = path.join(outputFolder, "package.json");

  return renderPackage(data).then((content) => storeTemplateOutput(outFile, content));
}

// ---------- Index

export async function renderIndex(): Promise<string> {
  return renderIndexTpl();
}

async function buildIndex(outputFolder: string) {
  const outFile = path.join(outputFolder, "index.js");

  return renderIndex().then((content) => storeTemplateOutput(outFile, content));
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

// ---------- Server

// --- Main

export async function renderServer(data: BuildServerData): Promise<string> {
  return renderServerTpl(data);
}

async function buildServer(data: BuildServerData, outputFolder: string): Promise<void> {
  return renderServer(data).then((content) => {
    storeTemplateOutput(path.join(outputFolder, "server/main.js"), content);
  });
}

// --- Common

export async function renderServerCommon(): Promise<string> {
  return renderServerCommonTpl();
}

async function buildServerCommon(outputFolder: string): Promise<void> {
  const outFile = path.join(outputFolder, "server/common.js");

  return renderServerCommon().then((content) => storeTemplateOutput(outFile, content));
}

// --- Endpoints

export async function renderServerEndpoints(data: RenderEndpointsData): Promise<string> {
  return renderEndpointsTpl(data);
}

async function buildServerEndpoints(
  data: RenderEndpointsData,
  outputFolder: string
): Promise<void> {
  const outFile = path.join(outputFolder, "server/endpoints.js");

  return renderServerEndpoints(data).then((content) => storeTemplateOutput(outFile, content));
}
