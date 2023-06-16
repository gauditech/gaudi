import path from "path";

import _ from "lodash";
import request from "supertest";

import { createApiTestSetup, loadBlueprint } from "@src/e2e/api/setup";
import { readConfig } from "@src/runtime/config";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);

describe("Reference Input", () => {
  const config = readConfig(path.join(__dirname, "api.test.env"));

  const { getServer, setup, destroy } = createApiTestSetup(
    config,
    loadBlueprint(path.join(__dirname, "referenceInput.gaudi")),
    []
  );

  describe("Element and Extra", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("create with a valid reference", async () => {
      const extraData = { extraData: { slug: "extra" } };

      const extraPostResponse = await request(getServer()).post("/api/extra").send(extraData);
      expect(extraPostResponse.statusCode).toBe(200);

      const data = {
        name: "element",
        extra_extraData_slug: "extra",
        nullableExtra_extraData_slug: "extra",
      };

      const postResponse = await request(getServer()).post("/api/element").send(data);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.body).toMatchSnapshot();
    });

    it("create with an invalid references", async () => {
      const data = {
        name: "element",
        extra_extraData_slug: "baz", // invalid
        // nullableExtra_extraData_slug <-- missing
      };

      const postResponse = await request(getServer()).post("/api/element").send(data);
      expect(postResponse.statusCode).toBe(400);
      expect(postResponse.body).toMatchSnapshot();
    });

    it("validation error with non-nullable reference", async () => {
      const data = {
        name: "element",
        extra_extraData_slug: null, // this should fail
        nullableExtra_extraData_slug: null, // this should be allowed
      };

      const postResponse = await request(getServer()).post("/api/element").send(data);
      expect(postResponse.statusCode).toBe(400);

      expect(postResponse.body).toMatchSnapshot();
    });

    it("identifies through nested path", async () => {
      /**
       * The following is a copy of 'create with a valid reference' test case
       */
      const extraData = { extraData: { slug: "extraslug" } };

      const extraPostResponse = await request(getServer()).post("/api/extra").send(extraData);
      expect(extraPostResponse.statusCode).toBe(200);

      const getResponse = await request(getServer()).get("/api/extra/extraslug").send();
      expect(getResponse.statusCode).toBe(200);
    });
  });
});
