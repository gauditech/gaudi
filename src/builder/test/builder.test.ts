import fs from "fs";
import path from "path";

import definition from "@examples/git/definition.json";

import { renderDbSchema, renderIndex, renderPackage, renderServer } from "@src/builder/builder";

const SNAPSHOT_FOLDER = __dirname;

describe("builder", () => {
  describe("build package", () => {
    it("renders package template correctly", async () => {
      const data = {
        package: {
          name: "test",
          description: "Test description",
          version: "0.0.1",
        },
      };
      const snapshot = readSnapshot("package.json");

      expect(await renderPackage(data)).toEqual(snapshot);
    });
  });

  describe("build index", () => {
    it("renders index template correctly", async () => {
      const snapshot = readSnapshot("index.js");

      expect(await renderIndex()).toEqual(snapshot);
    });
  });

  describe("build server", () => {
    it("renders server template correctly", async () => {
      const data = { serverPort: 3001 };
      const snapshot = readSnapshot("server.js");

      expect(await renderServer(data)).toEqual(snapshot);
    });
  });

  describe("build DB schema", () => {
    it("renders DB schema template correctly", async () => {
      const data = {
        definition: definition as any,
        dbProvider: "DB_PROVIDER",
        dbConnectionUrl: "DB_CONNECTION_URL",
      };
      const snapshot = readSnapshot("schema.prisma");

      expect(await renderDbSchema(data)).toEqual(snapshot);
    });
  });
});

// ---------- helpers

function readSnapshot(baseFilename: string): string {
  return fs.readFileSync(path.join(SNAPSHOT_FOLDER, `${baseFilename}.snapshot`)).toString();
}
