import { exec, execSync } from "child_process";
import fs from "fs";
import { Server } from "http";
import os from "os";
import path from "path";

import { render as renderDbSchemaTpl } from "@compiler/builder/renderer/templates/schema.prisma.tpl";
import { initLogger } from "@gaudi/compiler";
import { build, buildApiClients } from "@gaudi/compiler/dist/builder/builder";
import { dataToFieldDbnames, getRef } from "@gaudi/compiler/dist/common/refs";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import express, { Express, json } from "express";
import _ from "lodash";

import { compileFromString } from "@runtime/common/testUtils";
import { readConfig } from "@runtime/config";
import { setupDefinitionApis } from "@runtime/server/api";
import { AppContext, bindAppContext } from "@runtime/server/context";
import { DbConn, createDbConn, createSqlite } from "@runtime/server/dbConn";
import { useGaudi } from "@runtime/server/express";
import { bindAppContextHandler, errorHandler, requestLogger } from "@runtime/server/middleware";

const logger = initLogger("gaudi:test:e2e:setup");

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

type InstanceCommands = {
  setup: () => Promise<Server>;
  clean: () => Promise<void>;
};

let iterator = 1;
export function createTestInstance(blueprint: string, data: PopulatorData[]): InstanceCommands {
  const runner = new SQLiteTestRunner(Date.now().toString());
  const templatePromise = runner.prepareTemplate(blueprint, data);
  const setup = async () => {
    await templatePromise;
    return runner.createInstance((iterator++).toString());
  };
  const clean = () => runner.clean();
  return { setup, clean };
}

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

    logger.debug(`Setup API tests ("${schemaName}")`);

    // setup folders
    outputFolder = createOutputFolder(schemaName);
    logger.debug(`  created output folder ${outputFolder}`);
    const def = await buildDefinition(blueprint, outputFolder);
    logger.debug(`  created definition`);

    // setup DB
    await createDbSchema(context.dbConn, schemaName);
    logger.debug(`  created DB schema`);

    await initializeDb(
      context.config.dbConnUrl,
      schemaName,
      path.join(outputFolder, "db/schema.prisma")
    );
    logger.debug(`  initialized DB`);
    await populateDb(def, context.dbConn, data);
    logger.debug(`  populated DB`);

    // setup server
    server = await createAppServer(context, (app) => {
      bindAppContext(app, context);

      setupDefinitionApis(def, app);
    });
    logger.debug(`  created app server`);

    logger.debug(`API tests setup finished`);

    return {
      schemaName,
      outputFolder,
    };
  }

  /** Cleanup test exec env. Call after running tests. */
  async function destroyApiTest() {
    logger.debug(`Destroy API tests ("${schemaName}")`);

    if (server) {
      await closeAppServer(server);
      logger.debug(`  closed app server`);
    }
    await removeDbSchema(context.dbConn, schemaName);
    logger.debug(`  removed DB schema`);
    context.dbConn.destroy();
    logger.debug(`  closed DB conn`);
    removeOutputFolder(outputFolder);
    logger.debug(`  removed output folder`);

    logger.debug(`API tests destroy finished`);
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
let schemeCounter = 0;
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

async function initializeDb(dbConnUrl: string, schema: string, schemaPath: string) {
  const url = new URL(dbConnUrl);
  // append DB schema param
  url.searchParams.set("schema", schema);

  const prismaDbUrl = url.toString();

  await new Promise((resolve, reject) => {
    exec(
      `npx prisma db push --schema ${schemaPath}`,
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
        logger.debug(
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

export class SQLiteTestRunner {
  private instances: Server[];
  private rootPath: string;
  constructor(id: string) {
    this.rootPath = path.join(os.tmpdir(), `gaudi-e2e-${id}`);
    this.instances = [];
  }

  async prepareTemplate(blueprint: string, data: PopulatorData[]): Promise<void> {
    fs.rmSync(this.rootPath, { recursive: true, force: true });
    // create temporary directory
    fs.mkdirSync(this.rootPath);

    // compile gaudi into root directory
    const definition = compileFromString(blueprint);
    fs.writeFileSync(`${this.rootPath}/definition.json`, JSON.stringify(definition));
    // emit api clients
    await buildApiClients(definition, this.rootPath);
    // emit schema
    const schema = renderDbSchemaTpl({ definition, dbProvider: "sqlite" });
    const schemaPath = path.join(this.rootPath, "schema-sqlite.prisma");
    fs.writeFileSync(schemaPath, schema);
    // use prisma to create the structure
    const dbPath = path.join(this.rootPath, "db-template.sqlite");
    execSync(`npx prisma db push --schema ${schemaPath}`, {
      env: {
        ...process.env,
        GAUDI_DATABASE_URL: `file:${dbPath}`,
      },
    });
    // populate
    const dbConn = createSqlite(`sqlite://${dbPath}`);
    await populateDb(definition, dbConn, data);
    await dbConn.destroy();
  }

  async createInstance(id: string): Promise<Server> {
    // copy from template
    const templatePath = path.join(this.rootPath, `db-template.sqlite`);
    const instancePath = path.join(this.rootPath, `db-${id}.sqlite`);
    fs.copyFileSync(templatePath, instancePath);
    const app = express();
    const definitionPath = path.join(this.rootPath, "definition.json");
    const outputFolder = this.rootPath;
    const dbConnUrl = `sqlite://${instancePath}`;
    const gaudi = useGaudi({ definitionPath, outputFolder, dbConnUrl });
    app.use(gaudi);
    const server = app.listen();
    server.on("close", () => gaudi.emit("gaudi:cleanup"));
    this.instances.push(server);
    return server;
  }

  async clean() {
    await Promise.all(
      this.instances.map(
        (server) =>
          new Promise((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve(undefined)))
          )
      )
    );

    fs.rmSync(this.rootPath, { recursive: true, force: true });
  }
}
