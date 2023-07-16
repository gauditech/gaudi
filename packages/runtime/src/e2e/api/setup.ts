import { exec } from "child_process";
import fs from "fs";
import { Server } from "http";
import os from "os";
import path from "path";

import { build } from "@gaudi/compiler/dist/builder/builder";
import { dataToFieldDbnames, getRef } from "@gaudi/compiler/dist/common/refs";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import express, { Express, json } from "express";
import _ from "lodash";

import { compileFromString } from "@runtime/common/testUtils";
import { readConfig } from "@runtime/config";
import { setupDefinitionApis } from "@runtime/server/api";
import { AppContext, bindAppContext } from "@runtime/server/context";
import { DbConn, createDbConn } from "@runtime/server/dbConn";
import { bindAppContextHandler, errorHandler, requestLogger } from "@runtime/server/middleware";

export type PopulatorData = { model: string; data: Record<string, string | number | boolean>[] };

/** Load definition file and return it's content */
export function loadBlueprint(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Blueprint file not found: "${filePath}"`);
  }
  return fs.readFileSync(filePath).toString("utf-8");
}

/** Load populator data rom JSON and parse it to object */
export function loadPopulatorData(filePath: string): PopulatorData[] {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Populator data file not found: "${filePath}"`);
    }

    const fileContent = fs.readFileSync(filePath).toString("utf-8");
    return JSON.parse(fileContent);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Populator data is not valid: ${err.message}`);
    } else {
      throw err;
    }
  }
}

export type ApiTestSetupConfig = {
  schemaName: string;
  outputFolder: string;
};
export type ApiTestSetup = {
  getServer: () => Server | undefined;
  setup: () => Promise<ApiTestSetupConfig>;
  destroy: () => Promise<void>;
};

export function createApiTestSetup(blueprint: string, data: PopulatorData[]): ApiTestSetup {
  const config = readConfig();
  let server: Server | undefined;

  // test context
  let schemaName: string;
  let outputFolder: string;
  let context: AppContext;

  /** Setup test env for execution. Call before running tests. */
  async function setupApiTest(): Promise<ApiTestSetupConfig> {
    // setup app context
    schemaName = generateSchemaName();
    context = {
      config,
      dbConn: createDbConn(config.dbConnUrl, { schema: schemaName }),
    };

    console.info(`Setup API tests ("${schemaName}")`);

    // setup folders
    outputFolder = createOutputFolder(schemaName);
    console.info(`  created output folder ${outputFolder}`);
    const def = await buildDefinition(blueprint, outputFolder);
    console.info(`  created definition`);

    // setup DB
    await createDbSchema(context.dbConn, schemaName);
    console.info(`  created DB schema`);
    await initializeDb(
      context.config.dbConnUrl,
      schemaName,
      path.join(outputFolder, "db/schema.prisma")
    );
    console.info(`  initialized DB`);
    await populateDb(def, context.dbConn, data);
    console.info(`  populated DB`);

    // setup server
    server = await createAppServer(context, (app) => {
      bindAppContext(app, context);

      setupDefinitionApis(def, app);
    });
    console.info(`  created app server`);

    console.info(`API tests setup finished`);

    return {
      schemaName,
      outputFolder,
    };
  }

  /** Cleanup test exec env. Call after running tests. */
  async function destroyApiTest() {
    console.info(`Destroy API tests ("${schemaName}")`);

    if (server) {
      await closeAppServer(server);
      console.info(`  closed app server`);
    }
    await removeDbSchema(context.dbConn, schemaName);
    console.info(`  removed DB schema`);
    context.dbConn.destroy();
    console.info(`  closed DB conn`);
    removeOutputFolder(outputFolder);
    console.info(`  removed output folder`);

    console.info(`API tests destroy finished`);
  }

  return {
    getServer: () => {
      if (server == null) throw new Error("Test HTTP server not yet started");
      return server;
    },
    setup: setupApiTest,
    destroy: destroyApiTest,
  };
}

// ----- schema name

let schemeCounter = 0; // simple schema sequence
function generateSchemaName() {
  return `test-${process.pid}-${schemeCounter++}`;
}

// ----- folders

function createOutputFolder(name: string) {
  const folderPath = path.join(os.tmpdir(), `gaudi-${name}`); // TODO: get system tmp path and create subfolder

  // clear output folder
  if (!fs.existsSync(folderPath)) {
    // (re)create output folder
    fs.mkdirSync(folderPath, { recursive: true });
  }

  return folderPath;
}

function removeOutputFolder(path: string) {
  if (fs.existsSync(path)) {
    // (re)create output folder
    fs.rmSync(path, { recursive: true });
  }
}

// ----- gaudi definition

async function buildDefinition(blueprint: string, outputFolder: string) {
  const definition = compileFromString(blueprint);
  // use output folder for both regular output and gaudi for simpler testing
  await build(definition, { outputFolder, gaudiFolder: outputFolder });

  return definition;
}

// ----- DB

async function createDbSchema(dbConn: DbConn, schema: string) {
  await removeDbSchema(dbConn, schema);
  await dbConn.schema.createSchema(schema);
}

async function removeDbSchema(dbConn: DbConn, schema: string) {
  await dbConn.schema.dropSchemaIfExists(schema, true);
}

async function initializeDb(dbConnUrl: string, schema: string, definitionPath: string) {
  const url = new URL(dbConnUrl);
  // append DB schema param
  url.searchParams.set("schema", schema);

  const prismaDbUrl = url.toString();

  await new Promise((resolve, reject) => {
    exec(
      `npx prisma db push --schema ${definitionPath}`,
      {
        env: {
          ...process.env,
          GAUDI_DATABASE_URL: prismaDbUrl,
        },
      },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(null);
        }
      }
    );
  });
}

async function populateDb(def: Definition, dbConn: DbConn, data: PopulatorData[]) {
  for (const populatorData of data) {
    await insertBatchQuery(def, dbConn, populatorData.model, populatorData.data);
  }
}

async function insertBatchQuery(
  def: Definition,
  dbConn: DbConn,
  refKey: string,
  data: Record<string, string | number | boolean>[]
): Promise<number[]> {
  const model = getRef.model(def, refKey);
  const dbData = data.map((d) => dataToFieldDbnames(model, d));
  return dbConn.batchInsert(model.dbname, dbData).returning("id");
}

// ----- app server

async function createAppServer(
  ctx: AppContext,
  configure: (express: Express) => void
): Promise<Server> {
  // setup server
  const app = express();

  app.use(bindAppContextHandler(app, ctx));

  app.use(json());
  app.use(requestLogger);

  configure(app);

  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(() => {
        const serverAddress = server.address();
        console.log(
          `  server started on ${
            serverAddress == null || _.isString(serverAddress)
              ? serverAddress
              : `${serverAddress.address}:${serverAddress.port}`
          }`
        );

        resolve(server);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function closeAppServer(server: Server) {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      }
      resolve(undefined);
    });
  });
}