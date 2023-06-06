/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const os = require("os");
const path = require("path");

const dotenv = require("dotenv");
const EmbeddedPostgres = require("embedded-postgres");
const { parse } = require("pg-connection-string");

module.exports = async function () {
  // FIXME each test loads it's own .env file but we have to make a decision sooner than that
  // Alternatively, each test suite can start it's own database ?
  const configPath = path.join(__dirname, "..", "api", "api.test.env");
  dotenv.config({ path: configPath, debug: true });

  const embeddedPgEnabled = process.env.GAUDI_EMBEDDED_POSTGRES_ENABLED ?? false;

  if (!embeddedPgEnabled) {
    return;
  }

  const url = getDbConnUrl();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaudi-jest-embpg-"));
  const pg = new EmbeddedPostgres({
    database_dir: dir,
    user: url.user ?? "gaudi",
    password: url.password ?? "gaudip",
    port: url.port ?? 5433,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(url.database);
  // eslint-disable-next-line no-undef
  globalThis.__EMBEDDED_POSTGRES_INSTANCE__ = pg;
};

function getDbConnUrl() {
  if (process.env.GAUDI_DATABASE_URL) {
    return parse(process.env.GAUDI_DATABASE_URL);
  } else {
    throw new Error(`Please set GAUDI_DATABASE_URL environment variable`);
  }
}
