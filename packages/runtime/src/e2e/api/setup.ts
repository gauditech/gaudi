import { exec, execSync } from "child_process";
import fs from "fs";
import { Server } from "http";
import os from "os";
import path from "path";

import { initLogger } from "@gaudi/compiler";
import { build } from "@gaudi/compiler/dist/builder/builder";
import { dataToFieldDbnames, getRef } from "@gaudi/compiler/dist/common/refs";
import { Definition } from "@gaudi/compiler/dist/types/definition";
import express from "express";
import _ from "lodash";

import { compileFromString } from "@runtime/common/testUtils";
import { DbConn, createDbConn, createSqlite } from "@runtime/server/dbConn";
import { useGaudi } from "@runtime/server/express";

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

type InstanceCommands = {
  createServerInstance: () => Promise<Server>;
};

export function createTestInstance(blueprint: string, data: PopulatorData[]): InstanceCommands {
  // decide which database backend to run
  const runner = process.env.JEST_DATABASE_URL
    ? new PostgresTestRunner(process.env.JEST_DATABASE_URL)
    : new SQLiteTestRunner();

  // this will automatically clean up tests in a scope which invokes a `setup`
  afterAll(() => runner.cleanup());

  const templatePromise = runner.prepareTemplate(blueprint, data);
  const setup = async () => {
    await templatePromise;
    return runner.createServerInstance();
  };

  return { createServerInstance: setup };
}

async function initializeDb(dbConnUrl: string, schemaPath: string) {
  await new Promise((resolve, reject) => {
    exec(
      `npx prisma db push --schema ${schemaPath}`,
      {
        env: {
          ...process.env,
          GAUDI_DATABASE_URL: dbConnUrl,
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

abstract class TestRunner {
  protected templateId: string;
  protected instances: [string, Server][];
  protected rootPath: string;
  protected definition: Definition | null;
  constructor() {
    const id = `${Date.now()}-${_.random(Number.MAX_SAFE_INTEGER)}`;
    this.templateId = id;
    this.rootPath = path.join(os.tmpdir(), `gaudi-e2e-${id}`);
    this.instances = [];
    this.definition = null;
    logger.debug(`Using TestRunner implementation: ${this.constructor.name}`);
  }
  get schemaPath() {
    return path.join(this.rootPath, "schema.prisma");
  }
  abstract get dbProvider(): "postgresql" | "sqlite";
  async compileApp(blueprint: string) {
    this.definition = compileFromString(blueprint);
    await build(this.definition, {
      gaudiFolder: this.rootPath,
      outputFolder: this.rootPath,
      dbProvider: this.dbProvider,
    });
  }

  abstract prepareTemplate(_blueprint: string, _data: PopulatorData[]): Promise<void>;
  abstract createNewEnvironment(id: string): Promise<string>;

  async createServerInstance(): Promise<Server> {
    const id = _.random(Number.MAX_SAFE_INTEGER).toString();
    const dbConnUrl = await this.createNewEnvironment(id);
    // setup the server
    const app = express();
    const definitionPath = path.join(this.rootPath, "definition.json");
    const outputFolder = this.rootPath;
    const gaudi = useGaudi({ definitionPath, outputFolder, dbConnUrl });
    app.use(gaudi);
    const server = app.listen();
    // tell Gaudi to close the DB connections so process can gracefully exit
    server.on("close", () => gaudi.emit("gaudi:cleanup"));

    this.instances.push([id, server]);
    return server;
  }

  async cleanup() {
    await Promise.all(
      this.instances.map(
        ([_id, server]) =>
          new Promise((resolve, reject) =>
            server.close((err) => (err ? reject(err) : resolve(undefined)))
          )
      )
    );

    fs.rmSync(this.rootPath, { recursive: true, force: true });
  }
}

export class SQLiteTestRunner extends TestRunner {
  get dbProvider() {
    return "sqlite" as const;
  }
  async prepareTemplate(blueprint: string, data: PopulatorData[]): Promise<void> {
    await this.compileApp(blueprint);
    // use prisma to create the structure
    const dbPath = path.join(this.rootPath, "db-template.sqlite");
    execSync(`npx prisma db push --schema ${this.schemaPath}`, {
      env: {
        ...process.env,
        GAUDI_DATABASE_URL: `file:${dbPath}`,
      },
    });
    // populate
    const dbConn = createSqlite(`sqlite://${dbPath}`);
    await populateDb(this.definition!, dbConn, data);
    await dbConn.destroy();
  }

  async createNewEnvironment(id: string): Promise<string> {
    // copy from template
    const templatePath = path.join(this.rootPath, `db-template.sqlite`);
    const instancePath = path.join(this.rootPath, `db-${id}.sqlite`);
    fs.copyFileSync(templatePath, instancePath);
    return `sqlite://${instancePath}`;
  }
}

export class PostgresTestRunner extends TestRunner {
  private dbConnUrl: string;
  constructor(dbConnUrl: string) {
    super();
    // this.dbConnUrl = "postgresql://gaudi:gaudip@localhost:5432";
    this.dbConnUrl = dbConnUrl;
  }
  get templateConnUrl() {
    return `${this.dbConnUrl}/gaudi-e2e-template-${this.templateId}`;
  }
  get dbProvider() {
    return "postgresql" as const;
  }
  async prepareTemplate(blueprint: string, data: PopulatorData[]): Promise<void> {
    await this.compileApp(blueprint);
    await initializeDb(this.templateConnUrl, this.schemaPath);
    const dbConn = createDbConn(this.templateConnUrl);
    await populateDb(this.definition!, dbConn, data);
    await dbConn.destroy();
  }

  async createNewEnvironment(id: string): Promise<string> {
    const dbConn = createDbConn(this.templateConnUrl);
    await dbConn.raw(
      `CREATE DATABASE "gaudi-e2e-${this.templateId}-${id}" WITH TEMPLATE "gaudi-e2e-template-${this.templateId}"`
    );
    await dbConn.destroy();
    return `postgresql://gaudi:gaudip@localhost:5432/gaudi-e2e-${this.templateId}-${id}`;
  }

  async cleanup(): Promise<void> {
    await super.cleanup();
    const dbConn = createDbConn(`${this.dbConnUrl}/template1`);
    await Promise.all(
      this.instances.map(async ([id, _server]) => {
        await dbConn.raw(`DROP DATABASE "gaudi-e2e-${this.templateId}-${id}"`);
      })
    );
    await dbConn.raw(`DROP DATABASE "gaudi-e2e-template-${this.templateId}"`);
    await dbConn.destroy();
  }
}
