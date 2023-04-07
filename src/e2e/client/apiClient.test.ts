import path from "path";

import request from "supertest";

import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { createApiTestSetup, loadBlueprint, loadPopulatorData } from "@src/e2e/api/setup";
import {
  ApiRequestInit,
  createClient,
} from "@src/e2e/client/__snapshots__/apiClient/client/api-client-entrypoint";
import { readConfig } from "@src/runtime/config";

// test are slow
jest.setTimeout(10000);

describe("api client lib", () => {
  const config = readConfig(path.join(__dirname, "../api/api.test.env"));

  const { getServer, setup, destroy } = createApiTestSetup(
    config,
    loadBlueprint(path.join(__dirname, "../api/api.model.gaudi")),
    loadPopulatorData(path.join(__dirname, "../api/api.data.json"))
  );

  /**
   * Request function used in API client for HTTP calls
   *
   * It uses `supertest` for making HTTP calls
   */
  async function testRequestFn(url: string, init: ApiRequestInit) {
    return (
      Promise.resolve()
        .then(() => {
          const httpClient = request(getServer());
          if (init.method === "GET") {
            return httpClient.get(url).set(init.headers ?? {});
          } else if (init.method === "POST") {
            return httpClient
              .post(url)
              .set(init.headers ?? {})
              .send(init.body);
          } else if (init.method === "PATCH") {
            return httpClient
              .patch(url)
              .set(init.headers ?? {})
              .send(init.body);
          } else if (init.method === "DELETE") {
            return httpClient.delete(url).set(init.headers ?? {});
          } else {
            assertUnreachable(init.method);
          }
        })
        // transform to struct required by API client
        .then((response) => {
          // superagent returns "{}" (empty object) as a body even if it's eg. plain text
          // we have no way of knowing wether we should use body or text property
          // so will presume that json response will contain "body" and all other "text"
          const isJson = (response.headers["content-type"] ?? "").indexOf("/json") != -1;

          return {
            status: response.status,
            data: isJson ? response.body : response.text,
            headers: { ...response.headers },
          };
        })
    );
  }

  describe("Org", () => {
    const client = createClient({
      requestFn: testRequestFn,
    });

    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    // --- regular endpoints

    it("get", async () => {
      const response = await client.api.org.get("org1");

      ensureEqual(response.kind, "success" as const); // type narrowing for simpler later code

      expect(response.status).toBe(200);
      expect(response.data).toMatchInlineSnapshot(`
        {
          "description": "Org 1 description",
          "id": 1,
          "name": "Org 1",
          "nameAndDesc": "Org 1: Org 1 description",
          "slug": "org1",
          "summary": "Org 1Org 1 description",
        }
      `);
    });

    it("list", async () => {
      const response = await client.api.org.list();

      ensureEqual(response.kind, "success" as const); // type narrowing for simpler later code

      expect(response.status).toBe(200);
      expect(response.data).toMatchInlineSnapshot(`
        [
          {
            "description": "Org 1 description",
            "id": 1,
            "name": "Org 1",
            "nameAndDesc": "Org 1: Org 1 description",
            "slug": "org1",
            "summary": "Org 1Org 1 description",
          },
          {
            "description": "Org 2 description",
            "id": 2,
            "name": "Org 2",
            "nameAndDesc": "Org 2: Org 2 description",
            "slug": "org2",
            "summary": "Org 2Org 2 description",
          },
          {
            "description": "Org 3 description",
            "id": 3,
            "name": "Org 3",
            "nameAndDesc": "Org 3: Org 3 description",
            "slug": "org3",
            "summary": "Org 3Org 3 description",
          },
          {
            "description": "Org 4 description",
            "id": 4,
            "name": "Org 4",
            "nameAndDesc": "Org 4: Org 4 description",
            "slug": "org4",
            "summary": "Org 4Org 4 description",
          },
        ]
      `);
    });

    it("list with paging", async () => {
      const response = await client.api.org.list({ page: 2, pageSize: 2 });

      ensureEqual(response.kind, "success" as const); // type narrowing for simpler later code

      expect(response.status).toBe(200);
      expect(response.data).toMatchInlineSnapshot(`
        [
          {
            "description": "Org 3 description",
            "id": 3,
            "name": "Org 3",
            "nameAndDesc": "Org 3: Org 3 description",
            "slug": "org3",
            "summary": "Org 3Org 3 description",
          },
          {
            "description": "Org 4 description",
            "id": 4,
            "name": "Org 4",
            "nameAndDesc": "Org 4: Org 4 description",
            "slug": "org4",
            "summary": "Org 4Org 4 description",
          },
        ]
      `);
    });

    it("create", async () => {
      const data = {
        name: "Org NEW",
        slug: "orgNEW",
        description: "Org NEW description",
      };
      const postResp = await client.api.org.create(data);

      ensureEqual(postResp.kind, "success" as const); // type narrowing for simpler later code

      expect(postResp.status).toBe(200);

      const getResp = await client.api.org.get("orgNEW");

      ensureEqual(getResp.kind, "success" as const); // type narrowing for simpler later code
      expect(getResp.status).toBe(200);
      expect(getResp.data).toMatchInlineSnapshot(`
        {
          "description": "Org NEW description",
          "id": 5,
          "name": "Org NEW",
          "nameAndDesc": "Org NEW: Org NEW description",
          "slug": "orgNEW",
          "summary": "Org NEWOrg NEW description",
        }
      `);

      // ensure `.get` result is the same as returned from `create` method
      expect(getResp.data).toEqual(postResp.data);
    });

    it("update", async () => {
      const data = { slug: "org2", name: "Org 2A", description: "Org 2A description" };

      const patchResp = await client.api.org.update("org2", data);

      ensureEqual(patchResp.kind, "success" as const); // type narrowing for simpler later code
      expect(patchResp.status).toBe(200);

      const getResp = await client.api.org.get("org2");

      ensureEqual(getResp.kind, "success" as const); // type narrowing for simpler later code
      expect(getResp.status).toBe(200);
      expect(getResp.data).toMatchInlineSnapshot(`
        {
          "description": "Org 2A description",
          "id": 2,
          "name": "Org 2A",
          "nameAndDesc": "Org 2A: Org 2A description",
          "slug": "org2",
          "summary": "Org 2AOrg 2A description",
        }
      `);

      // ensure `.get` result is the same as returned from `update` method
      expect(getResp.data).toEqual(patchResp.data);
    });

    it("delete", async () => {
      const deleteResp = await client.api.org.delete("org3");

      ensureEqual(deleteResp.kind, "success" as const); // type narrowing for simpler later code
      expect(deleteResp.status).toBe(200);

      // test that it's not there anymore
      const getResp = await client.api.org.get("org3");
      expect(getResp.status).toBe(404);
    });

    // --- custom endpoints

    it("custom get", async () => {
      const postResp = await client.api.org.customGet("org2");

      // custom endpoint return empty body so we can check only status
      expect(postResp.status).toBe(204);
    });

    it("custom create", async () => {
      const data = {
        name: "Org Custom NEW",
        slug: "orgCustomNEW",
        description: "Org custom NEW description",
      };
      const postResp = await client.api.org.customCreate(data);

      expect(postResp.status).toBe(204);

      // check via standard endpoint
      const getResp = await client.api.org.get("orgCustomNEW");

      ensureEqual(getResp.kind, "success" as const); // type narrowing for simpler later code
      expect(getResp.status).toBe(200);
      expect(getResp.data).toMatchInlineSnapshot(`
        {
          "description": "Org custom NEW description",
          "id": 6,
          "name": "Org Custom NEW",
          "nameAndDesc": "Org Custom NEW: Org custom NEW description",
          "slug": "orgCustomNEW",
          "summary": "Org Custom NEWOrg custom NEW description",
        }
      `);
    });

    it("custom update", async () => {
      const data = {
        slug: "org2",
        name: "Org custom 2A",
        description: "Org custom 2A description",
      };

      const patchResp = await client.api.org.customUpdate("org2", data);
      expect(patchResp.status).toBe(204);

      const getResp = await client.api.org.get("org2");

      ensureEqual(getResp.kind, "success" as const); // type narrowing for simpler later code
      expect(getResp.status).toBe(200);
      expect(getResp.data).toMatchInlineSnapshot(`
        {
          "description": "Org custom 2A description",
          "id": 2,
          "name": "Org custom 2A",
          "nameAndDesc": "Org custom 2A: Org custom 2A description",
          "slug": "org2",
          "summary": "Org custom 2AOrg custom 2A description",
        }
      `);
    });

    // TODO: fix delete actions
    it("custom delete", async () => {
      const patchResp = await client.api.org.customDelete("org4");
      expect(patchResp.status).toBe(204);

      // verify that it's not there anymore
      const getResp = await client.api.org.get("org4");
      expect(getResp.status).toBe(404);
    });

    it("custom list", async () => {
      const postResp = await client.api.org.customList();

      ensureEqual(postResp.kind, "success" as const); // type narrowing for simpler later code
      // custom endpoint return empty body so we can check only status
      expect(postResp.status).toBe(204);
    });

    // --- hook action

    it("custom one action", async () => {
      const data = { name: "Org Custom One", counter: 1 };
      const postResp = await client.api.org.customOneAction("org1", data);

      expect(postResp.status).toBe(204);
      // header should contain the same data sent we've sent
      expect(postResp.headers["gaudi-test-body"]).toBe(JSON.stringify(data));
    });

    it("custom many action", async () => {
      const data = { name: "Org Custom Many", counter: 1 };
      const postResp = await client.api.org.customManyAction(data);

      expect(postResp.status).toBe(204);
      // header should contain the same data sent we've sent
      expect(postResp.headers["gaudi-test-body"]).toBe(JSON.stringify(data));
    });

    // --- hook action that responds

    it("custom one endpoint - action responds", async () => {
      const data = { name: "Org Custom One", counter: 1 };
      const postResp = await client.api.org.customOneActionResponds("org1", data);

      ensureEqual(postResp.kind, "success" as const); // type narrowing for simpler later code
      expect(postResp.status).toBe(200);
      expect(postResp.data).toMatchInlineSnapshot(`
        {
          "counter": 1,
          "name": "Org Custom One",
        }
      `);
    });

    it("custom many endpoint - action responds", async () => {
      const data = { name: "Org Custom Many", counter: 1 };
      const postResp = await client.api.org.customManyActionResponds(data);

      ensureEqual(postResp.kind, "success" as const); // type narrowing for simpler later code
      expect(postResp.status).toBe(200);
      expect(postResp.data).toMatchInlineSnapshot(`
        {
          "counter": 1,
          "name": "Org Custom Many",
        }
      `);
    });

    // --- hook action with query

    it("custom one endpoint - action with query", async () => {
      const data = { name: "Org 1", orgId: 1 };
      const postResp = await client.api.org.customOneQueryAction("org1", data);

      ensureEqual(postResp.kind, "success" as const); // type narrowing for simpler later code
      expect(postResp.status).toBe(200);
      expect(postResp.data).toMatchInlineSnapshot(`
        {
          "inputName": "Org 1",
          "inputOrgId": 1,
          "orgById": [
            {
              "id": 1,
              "name": "Org 1",
            },
          ],
          "orgByName": [
            {
              "id": 1,
              "name": "Org 1",
            },
          ],
        }
      `);
    });

    it("custom endpoint - fetch action", async () => {
      const data = { name: "Fetch me org 1" };
      const postResp = await client.api.org.customFetchAction("org1", data);

      ensureEqual(postResp.kind, "success" as const); // type narrowing for simpler later code
      expect(postResp.status).toBe(200);
      expect(postResp.data).toMatchInlineSnapshot(`
        {
          "name": "Fetch me org 1",
          "repoSlug": "repo1",
        }
      `);
    });

    // --- hook error

    it("Hook throws specific HTTP error response", async () => {
      const data = { status: 451, message: "Unavailable For Legal Reasons" };

      const response = await client.api.org.hookErrorResponse(data);

      ensureEqual(response.kind, "error" as const); // type narrowing for simpler later code
      expect(response.status).toBe(data.status);
      expect(response.error).toMatchInlineSnapshot(`
        {
          "code": "ERROR_CODE_OTHER",
          "message": "Unavailable For Legal Reasons",
        }
      `);
    });

    it("Hook throws generic HTTP error response", async () => {
      const data = {
        message: "Custom error",
        status: 505,
      };

      const response = await client.api.org.hookErrorResponse(data);

      ensureEqual(response.kind, "error" as const); // type narrowing for simpler later code
      expect(response.status).toBe(505);
      expect(response.error).toMatchInlineSnapshot(`
        {
          "code": "ERROR_CODE_OTHER",
          "message": "Custom error",
        }
      `);
    });
  });
});
