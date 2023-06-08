import fs from "fs";
import os from "os";
import path from "path";

import { config } from "dotenv";
import EmbeddedPostgres from "embedded-postgres";

import { parseConnectionString } from "@src/common/utils";

export async function setupEmbeddedPg() {
  const configPath = path.join(__dirname, "..", ".env");
  config({ path: configPath, debug: true });

  const embeddedPgEnabled = process.env.GAUDI_EMBEDDED_POSTGRESQL_ENABLED ?? false;

  if (!embeddedPgEnabled) {
    return;
  }

  const dbConn = parseConnectionString(process.env.GAUDI_DATABASE_URL);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaudi-jest-embpg-"));
  const port = dbConn.port ? parseInt(dbConn.port, 10) : undefined;
  const pg = new EmbeddedPostgres({
    database_dir: dir,
    user: dbConn.user,
    password: dbConn.password,
    port,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  dbConn.database && (await pg.createDatabase(dbConn.database));

  (globalThis as any).__EMBEDDED_POSTGRES_INSTANCE__ = pg;
}

export async function teardownEmbeddedPg() {
  if (!(globalThis as any).__EMBEDDED_POSTGRES_INSTANCE__) {
    return;
  }
  await (globalThis as any).__EMBEDDED_POSTGRES_INSTANCE__.stop();
  /**
   * Node is buggy and keeps blocking the process for 15+sec so we help it shutdown.
   */
  process.exit();
}
