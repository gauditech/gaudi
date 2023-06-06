import path from "path";

import _ from "lodash";
import request from "supertest";

import { createApiTestSetup, loadBlueprint } from "@src/e2e/api/setup";
import { readConfig } from "@src/runtime/config";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);

describe("Single Cardinality Entrypoint", () => {
  const config = readConfig(path.join(__dirname, "api.test.env"));

  const { getServer, setup, destroy } = createApiTestSetup(
    config,
    loadBlueprint(path.join(__dirname, "singleCardinalityEntrypoint.gaudi")),
    [
      { model: "Address", data: [{ name: "Address 1" }] },
      { model: "User", data: [{ name: "First", address_id: 1 }] },
    ]
  );

  beforeAll(async () => {
    await setup();
  });
  afterAll(async () => {
    await destroy();
  });

  describe("cardinality one", () => {
    it("get", async () => {
      const getResponse = await request(getServer()).get("/api/user/1/address");
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.body).toMatchSnapshot();
    });

    it("update", async () => {
      const data = { name: "Foo 2" };
      const patchResponse = await request(getServer()).patch("/api/user/1/address").send(data);
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.body).toMatchSnapshot();
    });

    it("custom", async () => {
      const getResponse = await request(getServer()).get("/api/user/1/address/custom");
      expect(getResponse.statusCode).toBe(204);
    });
  });

  describe("cardinality nullable", () => {
    it("get", async () => {
      const getResponse = await request(getServer()).get("/api/address/1/user");
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.body).toMatchSnapshot();
    });

    it("update", async () => {
      const data = { name: "Second" };
      const patchResponse = await request(getServer()).patch("/api/address/1/user").send(data);
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.body).toMatchSnapshot();
    });

    it("custom", async () => {
      const getResponse = await request(getServer()).get("/api/address/1/user/custom");
      expect(getResponse.statusCode).toBe(204);
    });

    it("delete and create", async () => {
      const deleteResponse = await request(getServer()).delete("/api/address/1/user");
      expect(deleteResponse.statusCode).toBe(204);

      const data = { name: "Second" };
      const postResponse = await request(getServer()).post("/api/address/1/user").send(data);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.body).toMatchSnapshot();
    });

    it("fail to create when already existing", async () => {
      const data = { name: "Third" };
      const postResponse = await request(getServer()).post("/api/address/1/user").send(data);
      expect(postResponse.statusCode).toBe(500); // FIXME response with better data
    });

    it("fail to delete when not existing", async () => {
      const delete1Response = await request(getServer()).delete("/api/address/1/user");
      expect(delete1Response.statusCode).toBe(204);
      const delete2Response = await request(getServer()).delete("/api/address/1/user");
      expect(delete2Response.statusCode).toBe(404);
    });
  });
});
