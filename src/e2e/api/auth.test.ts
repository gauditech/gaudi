import path from "path";

import _ from "lodash";
import request from "supertest";

import { createApiTestSetup, loadBlueprint } from "@src/e2e/api/setup";
import { readConfig } from "@src/runtime/config";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(10000);

describe("Auth", () => {
  const config = readConfig(path.join(__dirname, "api.test.env"));

  const { getServer, setup, destroy } = createApiTestSetup(
    config,
    loadBlueprint(path.join(__dirname, "auth.gaudi")),
    [
      { model: "Operator", data: [{ id: 1, name: "First" }] },
      {
        model: "Operator__AuthLocal",
        // password: 1234
        data: [
          {
            id: 1,
            base_id: 1,
            username: "first",
            password: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
          },
        ],
      },
    ]
  );

  describe("Login and Logout", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("Login and Logout successfully", async () => {
      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "first", password: "1234" });
      expect(loginResponse.statusCode).toBe(200);
      const token = loginResponse.body.token;
      expect(token ?? "").not.toBe("");

      const listResponse = await request(getServer()).get("/operator");
      expect(listResponse.statusCode).toBe(200);

      const logoutResponse = await request(getServer())
        .post("/auth/logout")
        .set("Authorization", "bearer " + token);
      expect(logoutResponse.statusCode).toBe(200);

      // check if token is deleted, second logout should fail
      const secondLogoutResponse = await request(getServer())
        .post("/auth/logout")
        .set("Authorization", "bearer " + token);
      expect(secondLogoutResponse.statusCode).toBe(401);
    });

    it("Wrong Login password", async () => {
      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "first", password: "wrong password" });
      expect(loginResponse.statusCode).toBe(401);
    });

    it("Wrong Login username", async () => {
      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "wrong username", password: "1234" });
      expect(loginResponse.statusCode).toBe(401);
    });
  });
});
