import fs from "fs";
import path from "path";
import { renderDbSchema, renderIndex, renderServer } from "@src/builder/builder";
import definition from "@examples/git/definition.json";

const SNAPSHOT_FOLDER = __dirname;

describe("builder", () => {
  describe("build index", () => {
    it("renders index template correctly", async () => {
      const snapshot = readSnapshot("index.js");

      expect(await renderIndex()).toEqual(snapshot);
    });
  });

  describe("build server", () => {
    it("renders server template correctly", async () => {
      const serverData = { serverPort: 3000 };
      const snapshot = readSnapshot("server.js");

      expect(await renderServer(serverData)).toEqual(snapshot);
    });
  });

  describe("build DB schema", () => {
    it("renders DB schema template correctly", async () => {
      const snapshot = readSnapshot("schema.prisma");

      expect(await renderDbSchema({ definition: definition as any })).toEqual(snapshot);
    });
  });
});

// ---------- helpers

function readSnapshot(baseFilename: string): string {
  return fs.readFileSync(path.join(SNAPSHOT_FOLDER, `${baseFilename}.snapshot`)).toString();
}
