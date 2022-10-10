import definition from "@examples/git/definition.json";

import {
  renderDbSchema,
  renderIndex,
  renderPackage,
  renderServer,
  renderServerEndpoints,
} from "@src/builder/builder";
import { RenderEndpointsData } from "@src/builder/renderer/templates/server/endpoints.tpl";

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

      expect(await renderPackage(data)).toMatchSnapshot();
    });
  });

  describe("build index", () => {
    it("renders index template correctly", async () => {
      expect(await renderIndex()).toMatchSnapshot();
    });
  });

  describe("build DB schema", () => {
    it("renders DB schema template correctly", async () => {
      const data = {
        definition: definition as any,
        dbProvider: "DB_PROVIDER",
        dbConnectionUrl: "DB_CONNECTION_URL",
      };

      expect(await renderDbSchema(data)).toMatchSnapshot();
    });
  });

  describe("build server", () => {
    it("renders server template correctly", async () => {
      const data = { serverPort: 3001 };

      expect(await renderServer(data)).toMatchSnapshot();
    });

    it("renders server get endpoints correctly", async () => {
      const data: RenderEndpointsData = {
        definition: {
          models: [],
          entrypoints: [
            {
              name: "Orgs",
              target: {
                alias: null,
                identifyWith: {
                  name: "slug",
                  refKey: "Org.slug",
                  type: "text",
                },
                kind: "model",
                name: "Org",
                refKey: "Org",
                type: "Org",
              },
              endpoints: [
                {
                  actions: [],
                  kind: "get",
                  response: {
                    fieldRefs: ["Org.id", "Org.name", "Org.slug"],
                    queries: [],
                    references: [],
                    relations: [],
                  },
                },
              ],
              entrypoints: [],
            },
          ],
        },
      };

      expect(await renderServerEndpoints(data)).toMatchSnapshot();
    });

    it("renders server list endpoints correctly", async () => {
      const data: RenderEndpointsData = {
        definition: {
          models: [],
          entrypoints: [
            {
              name: "Orgs",
              target: {
                alias: null,
                identifyWith: {
                  name: "slug",
                  refKey: "Org.slug",
                  type: "text",
                },
                kind: "model",
                name: "Org",
                refKey: "Org",
                type: "Org",
              },
              endpoints: [
                {
                  actions: [],
                  kind: "list",
                  response: {
                    fieldRefs: ["Org.id", "Org.name", "Org.slug"],
                    queries: [],
                    references: [],
                    relations: [],
                  },
                },
              ],
              entrypoints: [],
            },
          ],
        },
      };

      expect(await renderServerEndpoints(data)).toMatchSnapshot();
    });
  });
});
