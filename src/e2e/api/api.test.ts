import fs from "fs";
import path from "path";

import request from "supertest";

import { PopulatorData, createApiTestSetup } from "@src/e2e/api/setup";
import { readConfig } from "@src/runtime/config";

describe("API endpoints", () => {
  const config = readConfig();

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
      expect(response.body).toEqual({
        id: 1,
        name: "Org 1",
        slug: "org1",
        description: "Org 1 description",
      });
    });

    it("list", async () => {
      const response = await request(getServer()).get("/org");

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual([
        { id: 1, name: "Org 1", slug: "org1", description: "Org 1 description" },
        { id: 2, name: "Org 2", slug: "org2", description: "Org 2 description" },
      ]);
    });

    it("create", async () => {
      const data = {
        id: 3,
        name: "Org 3",
        slug: "org3",
        description: "Org 3 description",
      };
      const postResp = await request(getServer()).post("/org").send(data);

      expect(postResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org3");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toEqual(data);
    });

    it("update", async () => {
      const data = { id: 2, slug: "org2", name: "Org 2A", description: "Org 2A description" };

      const patchResp = await request(getServer()).patch("/org/org2").send(data);
      expect(patchResp.statusCode).toBe(200);

      const getResp = await request(getServer()).get("/org/org2");
      expect(getResp.statusCode).toBe(200);
      expect(getResp.body).toEqual(data);
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
