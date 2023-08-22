import { Server } from "http";
import path from "path";

import { assertUnreachable, ensureEqual } from "@gaudi/compiler/dist/common/utils";
import * as dotenv from "dotenv";
import _ from "lodash";
import request from "supertest";

import { DATA } from "@runtime/e2e/api/auth.data";
import { createTestInstance, loadBlueprint } from "@runtime/e2e/api/setup";
import {
  ApiRequestInit,
  createClient,
} from "@runtime/e2e/client/__snapshots__/authClient/client/api-client";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(20000);

describe("auth client lib", () => {
  dotenv.config({ path: path.join(__dirname, "../api/api.test.env") });

  const runner = createTestInstance(
    loadBlueprint(path.join(__dirname, "../api/auth.model.gaudi")),
    DATA
  );

  async function loginOwner(server: Server): Promise<string> {
    const client = createClient({
      requestFn: makeTestRequestFn(server),
    });
    const resp = await client.api.auth.authUser.login({ username: "first", password: "1234" });

    // type narrowing for simpler later code
    ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

    // TODO: login returns any[] type and not any/unknown
    return (resp.data as any).token;
  }

  function makeTestRequestFn(server: Server) {
    /**
     * Request function used in API client for HTTP calls
     *
     * It uses `supertest` for making HTTP calls
     */
    return async function testRequestFn(url: string, init: ApiRequestInit) {
      return (
        Promise.resolve()
          .then(() => {
            const httpClient = request(server);
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
    };
  }

  describe("authentication", async () => {
    const server = await runner.setup();

    afterAll(runner.clean());

    function createNewClient(token?: string) {
      return createClient({
        requestFn: makeTestRequestFn(server),
        headers: {
          ...(token ? { Authorization: `bearer ${token}` } : {}),
        },
      });
    }

    it("authenticate user", async () => {
      const publicClient = createNewClient();

      // UNauthorized request
      const response1 = await publicClient.api.box.list();
      expect(response1.status).toBe(401);
      ensureEqual(response1.kind, "error"); // type narrowing
      expect(response1.error.code).toEqual("ERROR_CODE_UNAUTHENTICATED");

      // login
      const token = await loginOwner(server);
      expect(token?.length).toBeGreaterThan(0);

      // new authorized client
      const authClient = createNewClient(token);

      // authorized request
      const response2 = await authClient.api.box.list();
      expect(response2.status).toBe(200);

      // logout
      const response3 = await authClient.api.auth.authUser.logout();
      expect(response3.status).toBe(204);

      // UNauthorized request again
      const response4 = await authClient.api.box.list();
      expect(response4.status).toBe(401);
      ensureEqual(response4.kind, "error"); // type narrowing
      expect(response4.error.code).toEqual("ERROR_CODE_UNAUTHENTICATED");
    });
  });
});
