import { renderDbSchema } from "@src/builder/builder";
import definition from "@src/composer/tests/data/definition.json";
import { compileFromString } from "@src/index";
import { Definition } from "@src/types/definition";

describe("builder", () => {
  describe("DB schema", () => {
    it("renders model", async () => {
      const data = {
        // undefined values cannot be defined in JSON so we need to define atuhenticator here to satisfy interface
        definition: { ...definition, authenticator: undefined } as Definition,
        dbProvider: "DB_PROVIDER",
        dbConnectionUrl: "DB_CONNECTION_URL",
      };

      expect(await renderDbSchema(data)).toMatchSnapshot();
    });

    it("renders references", async () => {
      const bp = `
      model ParentItem {
        reference itemNoAction { to ReferencedItem1 }
        reference itemCascade { to ReferencedItem2, on delete cascade }
        reference itemSetNull { to ReferencedItem3, nullable, on delete set null }
      }
      model ReferencedItem1 {
        relation parent { from ParentItem, through itemNoAction }
      }
      model ReferencedItem2 {
        relation parent { from ParentItem, through itemCascade }
      }
      model ReferencedItem3 {
        relation parent { from ParentItem, through itemSetNull }
      }
      `;

      const def = compileFromString(bp);

      const data = {
        // undefined values cannot be defined in JSON so we need to define atuhenticator here to satisfy interface
        definition: def,
        dbProvider: "DB_PROVIDER",
        dbConnectionUrl: "DB_CONNECTION_URL",
      };

      expect(await renderDbSchema(data)).toMatchSnapshot();
    });
  });
});
