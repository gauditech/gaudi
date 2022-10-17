import {
  renderDbSchema,
  renderIndex,
  renderPackage,
  renderServer,
  renderServerEndpoints,
} from "@src/builder/builder";
import { RenderEndpointsData } from "@src/builder/renderer/templates/server/endpoints.tpl";
import definition from "@src/composer/tests/data/definition.json";
import { compile, compose, parse } from "@src/index";

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
      const bp = `
      model Org {
        field slug { type text, unique }
      }
      entrypoint Orgs {
        target model Org
        identify with slug
        response { id, name, slug }
      }
      `;
      const definition = compose(compile(parse(bp)));
      const data: RenderEndpointsData = {
        definition,
      };

      expect(await renderServerEndpoints(data)).toMatchSnapshot();
    });

    it("renders server list endpoints correctly", async () => {
      const bp = `
      model Org {
        field slug { type text, unique }
      }
      entrypoint Orgs {
        target model Org
        identify with slug
        response { id, name, slug }
      }
      `;
      const definition = compose(compile(parse(bp)));
      const data: RenderEndpointsData = {
        definition,
      };

      expect(await renderServerEndpoints(data)).toMatchSnapshot();
    });
  });
});
