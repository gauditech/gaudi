import { exec } from "child_process";
import fs from "fs";
import { Server } from "http";
import os from "os";
import path from "path";

import express, { Express, json } from "express";
import { chain } from "lodash";

import { build } from "@src/builder/builder";
import { dataToFieldDbnames, getRef } from "@src/common/refs";
import { compile } from "@src/compiler/compiler";
import { compose } from "@src/composer/composer";
import { parse } from "@src/parser/parser";
import { RuntimeConfig } from "@src/runtime/config";
import { initializeContext } from "@src/runtime/server/context";
import { DbConn, createDbConn } from "@src/runtime/server/dbConn";
import { buildEndpointConfig, registerServerEndpoint } from "@src/runtime/server/endpoints";
import { errorHandler } from "@src/runtime/server/middleware";
import { Definition } from "@src/types/definition";

export type PopulatorData = { model: string; data: Record<string, string | number | boolean>[] };

export function createApiTestSetup(
  config: RuntimeConfig,
  blueprint: string,
  data: PopulatorData[]
) {
  let server: Server | undefined;

  // setup app context
  const schema = generateSchemaName();
  const context = initializeContext({
    config,
    dbConn: createDbConn(config.dbConnUrl, { schema }),
  });

  /** Setup test env for execution. Call before running tests. */
  async function setupApiTest() {
    console.info(`Setup API tests ("${schema}")`);

    // setup folders
    const outputFolder = createOutputFolder(schema);
    console.info(`  created output folder ${outputFolder}`);
    const def = buildDefinition(blueprint, outputFolder);
    console.info(`  created definition`);

    // setup DB
    await createDbSchema(context.dbConn, schema);
    console.info(`  created DB schema`);
    await initializeDb(
      context.config.dbConnUrl,
      schema,
      path.join(outputFolder, "db/schema.prisma")
    );
    console.info(`  initialized DB`);
    await populateDb(def, context.dbConn, data);
    console.info(`  populated DB`);

    // setup server
    server = await createAppServer((app) => {
      buildEndpointConfig(def, def.entrypoints).forEach((epc) =>
        registerServerEndpoint(app, epc, "")
      );
    });
    console.info(`  created app server`);

    console.info(`API tests setup finished`);
  }

  /** Cleanup test exec env. Call after running tests. */
  async function destroyApiTest() {
    console.info(`Destroy API tests ("${schema}")`);

    if (server) {
      await closeAppServer(server);
      console.info(`  closed app server`);
    }
    await removeDbSchema(context.dbConn, schema);
    console.info(`  removed DB schema`);
    context.dbConn.destroy();
    console.info(`  closed DB conn`);
    removeOutputFolder(schema);
    console.info(`  removed output folder`);

    console.info(`API tests destroy finished`);
  }

  return {
    getServer: () => server,
    setup: setupApiTest,
    destroy: destroyApiTest,
  };
}

// ----- schema name

function generateSchemaName() {
  return "test"; //`test-${Date.now()}`; // TODO: use UUID or sequence
}

// ----- folders

function createOutputFolder(schema: string) {
  const folderPath = path.join(os.tmpdir(), `gaudi-${schema}`); // TODO: get system tmp path and create subfolder

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

function buildDefinition(blueprint: string, outputFolderPath: string) {
  const definition = compose(compile(parse(blueprint)));
  build(definition, outputFolderPath);

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
  await chain(data)
    .flatMap(({ model, data }) => {
      return data.map((row) => {
        return insertQuery(def, dbConn, model, row).then(() => {
          console.log("POPUATOR", JSON.stringify(row));
        });
      });
    })
    .reduce((prev, next) => prev.then(() => next), Promise.resolve())
    .value();
}

async function insertQuery(
  def: Definition,
  dbConn: DbConn,
  refKey: string,
  data: Record<string, string | number | boolean>
) {
  const { value: model } = getRef<"model">(def, refKey);
  await dbConn.insert(dataToFieldDbnames(model, data)).into(model.dbname).returning("id");
}

// ----- app server

async function createAppServer(configure: (express: Express) => void): Promise<Server> {
  // setup server
  const app = express();

  app.use(json());

  configure(app);

  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(() => {
        console.info("  closed app server");
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
