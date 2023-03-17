import { renderDbSchema } from "@src/builder/builder";
import definition from "@src/composer/tests/data/definition.json";
import { Definition } from "@src/types/definition";

describe("builder", () => {
  describe("build DB schema", () => {
    it("renders DB schema template correctly", async () => {
      const data = {
        // undefined values cannot be defined in JSON so we need to define atuhenticator here to satisfy interface
        definition: { ...definition, authenticator: undefined } as Definition,
        dbProvider: "DB_PROVIDER",
        dbConnectionUrl: "DB_CONNECTION_URL",
      };

      expect(await renderDbSchema(data)).toMatchSnapshot();
    });
  });
});
