import { Server } from "http";
import path from "path";

import { ensureEqual } from "@gaudi/compiler/dist/common/utils";
import * as dotenv from "dotenv";
import _ from "lodash";

import { DATA } from "@runtime/e2e/api/auth.data";
import { createTestInstance, loadBlueprint } from "@runtime/e2e/api/setup";
import { createClient } from "@runtime/e2e/client/__snapshots__/authClient/client/api-client";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(20000);

describe("auth client lib", () => {
  dotenv.config({ path: path.join(__dirname, "../api/api.test.env") });

  const runner = createTestInstance(
    loadBlueprint(path.join(__dirname, "../api/auth.model.gaudi")),
    DATA
  );

  function getServerURL(server: Server): string {
    const address = server.address();

    if (typeof address === "string" || address == null) {
      return address ?? "";
    }

    return `http://[${address.address}]:${address.port ?? 80}`;
  }

  async function loginOwner(server: Server): Promise<string> {
    const client = createClient({
      rootPath: getServerURL(server),
    });
    const resp = await client.api.auth.authUser.login({ username: "first", password: "1234" });

    // type narrowing for simpler later code
    ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

    // TODO: login returns any[] type and not any/unknown
    return (resp.data as any).token;
  }

  describe("authentication", () => {
    function createNewClient(server: Server, token?: string) {
      return createClient({
        rootPath: getServerURL(server),
        headers: {
          ...(token ? { Authorization: `bearer ${token}` } : {}),
        },
      });
    }

    it("authenticate user", async () => {
      const server = await runner.createServerInstance();

      const publicClient = createNewClient(server);

      // UNauthorized request
      const response1 = await publicClient.api.box.list();
      expect(response1.status).toBe(401);
      ensureEqual(response1.kind, "error"); // type narrowing
      expect(response1.error.code).toEqual("ERROR_CODE_UNAUTHENTICATED");

      // login
      const token = await loginOwner(server);
      expect(token?.length).toBeGreaterThan(0);

      // new authorized client
      const authClient = createNewClient(server, token);

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
