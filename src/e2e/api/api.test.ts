import fs from "fs";
import path from "path";

import _ from "lodash";
import request from "supertest";

import { PopulatorData, createApiTestSetup } from "@src/e2e/api/setup";
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

    it("get", async () => {
      const response = await request(getServer()).get("/org/org1");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("list", async () => {
      const response = await request(getServer()).get("/org");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("create", async () => {
      const data = {
        name: "Org NEW",
        slug: "orgNEW",
        description: "Org NEW description",
      };
      const postResp = await request(getServer()).post("/org").send(data);

      expect(postResp.statusCode).toBe(200);
      const getResp = await request(getServer()).get("/org/orgNEW");

      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();

      // ensure `.get` result is the same as returned from `create` method
      expect(getResp.body).toEqual(postResp.body);
    });

    it("update", async () => {
      const data = { slug: "org2", name: "Org 2A", description: "Org 2A description" };

      const patchResp = await request(getServer()).patch("/org/org2").send(data);
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org2");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();

      // ensure `.get` result is the same as returned from `update` method
      expect(getResp.body).toEqual(patchResp.body);
    });

    it("delete", async () => {
      const patchResp = await request(getServer()).delete("/org/org3");
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org3");
      expect(getResp.statusCode).toBe(404);
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
      const response = await request(getServer()).get("/org/org1/repos/1");

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchSnapshot();
    });

    it("list", async () => {
      const response = await request(getServer()).get("/org/org1/repos");

      expect(response.statusCode).toBe(200);
      expect(_.sortBy(response.body, "id")).toMatchSnapshot();
    });

    it("create", async () => {
      const data = {
        name: "Repo 6",
        slug: "repo6",
        description: "Repo 6 description",
        is_public: true,
      };
      const postResp = await request(getServer()).post("/org/org1/repos").send(data);
      expect(postResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org1/repos/6");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });

    it("update", async () => {
      const data = { slug: "repo2", name: "Repo 2A", description: "Repo 2A description" };

      const patchResp = await request(getServer()).patch("/org/org1/repos/2").send(data);
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org1/repos/2");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });

    it("delete", async () => {
      const patchResp = await request(getServer()).delete("/org/org1/repos/1");
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org1/repos/1");
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
        issue: {
          title: "Issue 1",
        },
        c: {
          body: "Comment body",
        },
      };
      const postResp = await request(getServer()).post("/org/org1/repos/1/issues").send(data);
      console.dir(postResp.body);
      expect(postResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org1/repos/1/issues/1");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toMatchSnapshot();
    });
  });
});

/** Load definition file and return it's content */
function loadBlueprint(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Blueprint file not found: "${filePath}"`);
  }
  return fs.readFileSync(filePath).toString("utf-8");
}

/** Load populator data rom JSON and parse it to object */
function loadPopulatorData(filePath: string): PopulatorData[] {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Populator data file not found: "${filePath}"`);
    }

    const fileContent = fs.readFileSync(filePath).toString("utf-8");
    return JSON.parse(fileContent);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Populator data is not valid: ${err.message}`);
    } else {
      throw err;
    }
  }
}
