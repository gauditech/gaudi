import path from "path";

import * as dotenv from "dotenv";
import _ from "lodash";
import request from "supertest";

import { createTestInstance, loadBlueprint } from "@runtime/e2e/api/setup";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);

dotenv.config({ path: path.join(__dirname, "api.test.env") });
const runner = createTestInstance(loadBlueprint(path.join(__dirname, "referenceInput.gaudi")), []);

describe("Reference Input", () => {
  afterAll(runner.clean());

  describe("Element and Extra", () => {
    it("create with a valid reference", async () => {
      const server = await runner.setup();

      const extraData = { extraData: { slug: "extra" } };
      const extraPostResponse = await request(server).post("/api/extra").send(extraData);
      expect(extraPostResponse.statusCode).toBe(200);

      const data = {
        name: "element",
        extra_extraData_slug: "extra",
        nullableExtra_extraData_slug: null,
      };
      const postResponse = await request(server).post("/api/element").send(data);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.body).toMatchSnapshot();
    });

    it("create with an invalid references", async () => {
      const server = await runner.setup();

      const data = {
        name: "element",
        extra_extraData_slug: "baz", // invalid
        // nullableExtra_extraData_slug <-- missing
      };
      const postResponse = await request(server).post("/api/element").send(data);
      expect(postResponse.statusCode).toBe(400);
      expect(postResponse.body).toMatchSnapshot();
    });

    it("validation error with non-nullable reference", async () => {
      const server = await runner.setup();

      const data = {
        name: "element",
        extra_extraData_slug: null, // this should fail
        nullableExtra_extraData_slug: null, // this should be allowed
      };
      const postResponse = await request(server).post("/api/element").send(data);
      expect(postResponse.statusCode).toBe(400);

      expect(postResponse.body).toMatchSnapshot();
    });

    it("identifies through nested path", async () => {
      const server = await runner.setup();

      const extraData = { extraData: { slug: "extraslug" } };
      const extraPostResponse = await request(server).post("/api/extra").send(extraData);
      expect(extraPostResponse.statusCode).toBe(200);
      const getResponse = await request(server).get("/api/extra/extraslug").send();
      expect(getResponse.statusCode).toBe(200);
    });
  });
});
