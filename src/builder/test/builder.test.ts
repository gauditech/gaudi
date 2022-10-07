import fs from "fs";
import path from "path";

import definition from "@examples/git/definition.json";

import {
  renderDbSchema,
  renderServerEndpoints,
  renderIndex,
  renderPackage,
  renderServer,
} from "@src/builder/builder";

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

  describe("build server", () => {
    it("renders server template correctly", async () => {
      const data = { serverPort: 3001 };

      expect(await renderServer(data)).toMatchSnapshot();
    });

    it("renders server get endpoints correctly", async () => {
      const data = {
        definition: {
          entrypoints: [
            {
              endpoints: [
                {
                  name: "get",
                  kind: "get",
                  identifyRefPath: ["Org.id"],
                  path: [
                    { type: "literal", value: "org" },
                    { type: "numeric", varname: "org_id" },
                  ],
                  actions: [
                    {
                      kind: "fetch one",
                      modelRef: "Org",
                      filter: {
                        kind: "binary",
                        operation: "is",
                        lhs: "Org.id",
                        rhs: { kind: "var ref", varname: "org_id" },
                      },
                      select: {
                        fieldRefs: ["Org.id", "Org.name"],
                        queries: [],
                        references: [],
                        relations: [],
                      },
                      varname: "var0",
                      onError: { statusCode: 404, body: { message: "Not found" } },
                    },
                    { kind: "respond", varname: "var0" },
                  ],
                },
              ],
            },
          ],
        } as any,
      };

      expect(await renderServerEndpoints(data as any)).toMatchSnapshot();
    });

    it("renders server list endpoints correctly", async () => {
      const data = {
        definition: {
          entrypoints: [
            {
              endpoints: [
                {
                  name: "list",
                  kind: "list",
                  path: [{ type: "literal", value: "org" }],
                  actions: [
                    {
                      kind: "fetch many",
                      modelRef: "Org",
                      filter: undefined,
                      select: {
                        fieldRefs: ["Org.id", "Org.name"],
                        queries: [],
                        references: [],
                        relations: [],
                      },
                      varname: "var0",
                    },
                    { kind: "respond", varname: "var0" },
                  ],
                },
              ],
            },
          ],
        },
      };

      expect(await renderServerEndpoints(data as any)).toMatchSnapshot();
    });
  });
});

// ---------- helpers

function readSnapshot(baseFilename: string): string {
  return fs.readFileSync(path.join(SNAPSHOT_FOLDER, `${baseFilename}.snapshot`)).toString();
}
