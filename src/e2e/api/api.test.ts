import path from "path";

import _ from "lodash";
import request from "supertest";

import { createApiTestSetup, loadBlueprint, loadPopulatorData } from "@src/e2e/api/setup";
import { readConfig } from "@src/runtime/config";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);

describe("API endpoints", () => {
  const config = readConfig(path.join(__dirname, "api.test.env"));

  const { getServer, setup, destroy } = createApiTestSetup(
    config,
    loadBlueprint(path.join(__dirname, "api.model.gaudi")),
    loadPopulatorData(path.join(__dirname, "api.data.json"))
  );

  describe("Org", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    // --- regular endpoints

    it("get", async () => {
      const response = await request(getServer()).get("/api/org/org1");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("list with paging", async () => {
      const response = await request(getServer()).get("/api/org");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("list with non default paging", async () => {
      const response = await request(getServer()).get("/api/org?page=2&pageSize=2");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("create", async () => {
      const data = {
        name: "Org NEW",
        slug: "orgNEW",
        description: "Org NEW description",
      };
      const postResp = await request(getServer()).post("/api/org").send(data);

      expect(postResp.statusCode).toBe(200);
      const getResp = await request(getServer()).get("/api/org/orgNEW");

      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();

      // ensure `.get` result is the same as returned from `create` method
      expect(getResp.body).toEqual(postResp.body);
    });

    it("update", async () => {
      const data = { slug: "org2", name: "Org 2A", description: "Org 2A description" };

      const patchResp = await request(getServer()).patch("/api/org/org2").send(data);
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/api/org/org2");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();

      // ensure `.get` result is the same as returned from `update` method
      expect(getResp.body).toEqual(patchResp.body);
    });

    it("delete", async () => {
      const patchResp = await request(getServer()).delete("/api/org/org3");
      expect(patchResp.statusCode).toBe(204);

      const getResp = await request(getServer()).get("/api/org/org3");
      expect(getResp.statusCode).toBe(404);
    });

    // --- custom endpoints

    it("custom get", async () => {
      const postResp = await request(getServer()).get("/api/org/org2/customGet").send();

      // custom endpoint return empty body so we can check only status
      expect(postResp.statusCode).toBe(204);
    });

    it("custom create", async () => {
      const data = {
        newOrg: {
          name: "Org Custom NEW",
          slug: "orgCustomNEW",
          description: "Org custom NEW description",
        },
      };
      const postResp = await request(getServer()).post("/api/org/customCreate").send(data);

      expect(postResp.statusCode).toBe(204);

      // check via standard endpoint
      const getResp = await request(getServer()).get("/api/org/orgCustomNEW");

      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });

    it("custom update", async () => {
      const data = {
        newOrg: {
          slug: "org2",
          name: "Org custom 2A",
          description: "Org custom 2A description",
        },
      };

      const patchResp = await request(getServer()).patch("/api/org/org2/customUpdate").send(data);
      expect(patchResp.statusCode).toBe(204);

      const getResp = await request(getServer()).get("/api/org/org2");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });

    // TODO: fix delete actions
    it("custom delete", async () => {
      const patchResp = await request(getServer()).delete("/api/org/org4/customDelete");
      expect(patchResp.statusCode).toBe(204);

      const getResp = await request(getServer()).get("/api/org/org4");
      expect(getResp.statusCode).toBe(404);
    });

    it("custom list", async () => {
      const postResp = await request(getServer()).get("/api/org/customList").send();

      // custom endpoint return empty body so we can check only status
      expect(postResp.statusCode).toBe(204);
    });

    // --- hook action

    it("custom one action", async () => {
      const data = {
        name: "Org Custom One",
        counter: 1,
        customProp: "custom prop value",
      };
      const postResp = await request(getServer()).post("/api/org/org1/customOneAction").send(data);

      expect(postResp.statusCode).toBe(204);
      // header should contain the same data sent we've sent
      expect(postResp.get("Gaudi-Test-body")).toBe(JSON.stringify(data));
    });

    it("custom many action", async () => {
      const data = { name: "Org Custom Many", counter: 1 };
      const postResp = await request(getServer()).patch("/api/org/customManyAction").send(data);

      expect(postResp.statusCode).toBe(204);
      // header should contain the same data sent we've sent
      expect(postResp.get("Gaudi-Test-body")).toBe(JSON.stringify(data));
    });

    // --- hook action that responds

    it("custom one endpoint - action responds", async () => {
      const data = { name: "Org Custom One", counter: 1 };
      const postResp = await request(getServer())
        .post("/api/org/org1/customOneActionResponds")
        .send(data);

      expect(postResp.statusCode).toBe(200);
      expect(postResp.body).toMatchInlineSnapshot(`
        {
          "counter": 1,
          "name": "Org Custom One",
        }
      `);
    });

    it("custom many endpoint - action responds", async () => {
      const data = { name: "Org Custom Many", counter: 1 };
      const postResp = await request(getServer())
        .patch("/api/org/customManyActionResponds")
        .send(data);

      expect(postResp.statusCode).toBe(200);
      expect(postResp.body).toMatchInlineSnapshot(`
        {
          "counter": 1,
          "name": "Org Custom Many",
        }
      `);
    });

    it("custom many endpoint - respond action with static response", async () => {
      const postResp = await request(getServer())
        .patch("/api/org/customManyRespondActionStatic")
        .send();

      expect(postResp.statusCode).toBe(202); // default response code
      expect(postResp.body).toMatchInlineSnapshot(`"static response body"`);
    });

    it("custom many endpoint - respond action with simple response", async () => {
      const data = {
        body: "Org Custom Many Respond Simple",
      };
      const postResp = await request(getServer())
        .patch("/api/org/customManyRespondActionSimple")
        .send(data);

      expect(postResp.statusCode).toBe(200); // default response code
      expect(postResp.body).toMatchInlineSnapshot(`"Org Custom Many Respond Simple"`);
    });

    it("custom many endpoint - respond action with complex response", async () => {
      const data = {
        prop1: "Org Custom Many Respond prop1",
        prop2: 2,
        statusCode: 201,
        header1: "header 1",
        header2: "header 2",
      };
      const postResp = await request(getServer())
        .patch("/api/org/customManyRespondActionComplex")
        .send(data);

      expect(postResp.statusCode).toBe(201);
      expect(postResp.body).toMatchInlineSnapshot(`
        {
          "prop1": "Org Custom Many Respond prop1",
          "prop2": 2,
        }
      `);
      expect(postResp.get("header-1")).toBe(data.header1);
      expect(postResp.get("header-2")).toBe(data.header2);
      expect(postResp.headers["header-12"]).toBe(`${data.header1}, ${data.header2}`); // multiple header values
      expect(postResp.headers["header-3"]).toBe(undefined); // removed header
    });

    // --- hook action with query

    it("custom one endpoint - action with query", async () => {
      const data = { name: "Org 1", orgId: 1 };
      const postResp = await request(getServer())
        .post("/api/org/org1/customOneQueryAction")
        .send(data);

      expect(postResp.statusCode).toBe(200);
      expect(postResp.body).toMatchSnapshot();
    });

    it("custom endpoint - fetch action", async () => {
      const data = { name: "Fetch me org 1" };
      const postResp = await request(getServer())
        .post("/api/org/org1/customFetchAction")
        .send(data);

      expect(postResp.statusCode).toBe(200);
      expect(postResp.body).toMatchSnapshot();
    });

    // --- hook error

    it("Hook throws specific HTTP error response", async () => {
      const data = { status: 451, code: "UNAVAILABLE", message: "Unavailable For Legal Reasons" };

      const response = await request(getServer()).post("/api/org/hookErrorResponse").send(data);
      expect(response.statusCode).toBe(data.status);
      expect(response.text).toEqual(data.message);
    });

    it("Hook throws generic HTTP error response", async () => {
      const data = {
        message: "Custom error",
        status: 505,
      };

      const response = await request(getServer()).post("/api/org/hookErrorResponse").send(data);
      expect(response.statusCode).toBe(505);
      expect(response.text).toBe("Custom error");
    });
  });

  describe("Repo", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("get", async () => {
      const response = await request(getServer()).get("/api/org/org1/repos/1");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("list", async () => {
      const response = await request(getServer()).get("/api/org/org1/repos");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("create", async () => {
      const data = {
        name: "Repo 6",
        slug: "repo6",
        raw_description: "Repo 6 description",
        is_public: true,
      };
      const postResp = await request(getServer()).post("/api/org/org1/repos").send(data);
      expect(postResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/api/org/org1/repos/6");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });

    it("update", async () => {
      const data = { slug: "repo2", name: "Repo 2A", description: "Repo 2A description" };

      const patchResp = await request(getServer()).patch("/api/org/org1/repos/2").send(data);
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/api/org/org1/repos/2");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });

    it("delete", async () => {
      const patchResp = await request(getServer()).delete("/api/org/org1/repos/1");
      expect(patchResp.statusCode).toBe(204);

      const getResp = await request(getServer()).get("/api/org/org1/repos/1");
      expect(getResp.statusCode).toBe(404);
    });
  });

  describe("Issue", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("create", async () => {
      const data = {
        title: "Issue 1",
        c: {
          body: "Comment body",
        },
      };
      const postResp = await request(getServer()).post("/api/org/org1/repos/1/issues").send(data);
      expect(postResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/api/org/org1/repos/1/issues/1");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });
  });

  describe("PublicRepo", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("list", async () => {
      const response = await request(getServer()).get("/api/repo");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });
  });
});
