import path from "path";

import * as dotenv from "dotenv";
import request from "supertest";

import { createTestInstance, loadBlueprint } from "@runtime/e2e/api/setup";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);

describe("Single Cardinality Entrypoint", () => {
  dotenv.config({ path: path.join(__dirname, "api.test.env") });

  const runner = createTestInstance(
    loadBlueprint(path.join(__dirname, "singleCardinalityEntrypoint.gaudi")),
    [
      { model: "Address", data: [{ name: "Address 1" }] },
      { model: "User", data: [{ name: "First", address_id: 1 }] },
    ]
  );

  describe("cardinality one reference", () => {
    it("get", async () => {
      const server = await runner.setup();
      const getResponse = await request(server).get("/api/user/1/address");
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.body).toMatchSnapshot();
    });

    it("update", async () => {
      const data = { name: "Foo 2" };
      const server = await runner.setup();
      const patchResponse = await request(server).patch("/api/user/1/address").send(data);
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.body).toMatchSnapshot();
    });

    it("custom", async () => {
      const server = await runner.setup();
      const getResponse = await request(server).get("/api/user/1/address/custom");
      expect(getResponse.statusCode).toBe(204);
    });
  });

  describe("cardinality nullable reference", () => {
    it("fail to delete when not existing", async () => {
      const server = await runner.setup();
      const deleteResponse = await request(server).delete("/api/user/1/details");
      expect(deleteResponse.statusCode).toBe(404);
    });

    it("create and delete", async () => {
      const server = await runner.setup();

      const data = { text: "some text" };
      const postResponse = await request(server).post("/api/user/1/details").send(data);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.body).toMatchSnapshot();

      const getResponse1 = await request(server).get("/api/user/1");
      expect(getResponse1.statusCode).toBe(200);
      // Check if user.details is set from context
      expect(getResponse1.body.details_id).toBe(postResponse.body.id);

      const deleteResponse = await request(server).delete("/api/user/1/details");
      expect(deleteResponse.statusCode).toBe(204);

      const getResponse2 = await request(server).get("/api/user/1");
      expect(getResponse2.statusCode).toBe(200);
      // Check if user.details is unset
      expect(getResponse2.body.details_id).toBeNull();
    });
  });

  describe("cardinality nullable relation", () => {
    it("get", async () => {
      const server = await runner.setup();

      const getResponse = await request(server).get("/api/address/1/user");
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.body).toMatchSnapshot();
    });

    it("update", async () => {
      const server = await runner.setup();

      const data = { name: "Second" };
      const patchResponse = await request(server).patch("/api/address/1/user").send(data);
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.body).toMatchSnapshot();
    });

    it("custom", async () => {
      const server = await runner.setup();

      const getResponse = await request(server).get("/api/address/1/user/custom");
      expect(getResponse.statusCode).toBe(204);
    });

    it("delete and create", async () => {
      const server = await runner.setup();

      const deleteResponse = await request(server).delete("/api/address/1/user");
      expect(deleteResponse.statusCode).toBe(204);

      const data = { name: "Second" };
      const postResponse = await request(server).post("/api/address/1/user").send(data);
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.body).toMatchSnapshot();
    });

    it("fail to create when already existing", async () => {
      const data = { name: "Third" };
      const server = await runner.setup();
      const postResponse = await request(server).post("/api/address/1/user").send(data);
      expect(postResponse.statusCode).toBe(500); // FIXME response with better data
    });

    it("fail to delete when not existing", async () => {
      const server = await runner.setup();
      const delete1Response = await request(server).delete("/api/address/1/user");
      expect(delete1Response.statusCode).toBe(204);

      const delete2Response = await request(server).delete("/api/address/1/user");
      expect(delete2Response.statusCode).toBe(404);
    });
  });
});
