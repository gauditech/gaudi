/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const os = require("os");

const EmbeddedPostgres = require("embedded-postgres");

module.exports = async function () {
  const dir = fs.mkdtempSync(os.tmpdir());
  const pg = new EmbeddedPostgres({
    database_dir: dir,
    user: "gaudi",
    password: "gaudip",
    port: 5433,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gaudi");
  // eslint-disable-next-line no-undef
  globalThis.__EMBEDDED_POSTGRES_INSTANCE__ = pg;
};
