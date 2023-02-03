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
      {
        model: "AuthUser",
        data: [
          {
            name: "First Operator",
            username: "first@example.com",
            password: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
          },
          {
            name: "Secodn Operator",
            username: "second@example.com",
            password: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
          },
        ],
      },
      {
        model: "Box",
        data: [
          { owner_id: 1, name: "public", is_public: true },
          { owner_id: 1, name: "private", is_public: false },
        ],
      },
      {
        model: "Item",
        data: [
          { box_id: 1, name: "public", is_public: true },
          { box_id: 1, name: "private", is_public: false },
          { box_id: 2, name: "public", is_public: true },
          { box_id: 2, name: "private", is_public: false },
        ],
      },
    ]
  );

  async function loginTestUser() {
    const loginResponse = await request(getServer())
      .post("/auth/login")
      .send({ username: "first@example.com", password: "1234" });
    return loginResponse.body.token;
  }

  async function loginTestUser2() {
    const loginResponse = await request(getServer())
      .post("/auth/login")
      .send({ username: "second@example.com", password: "1234" });
    return loginResponse.body.token;
  }

  describe("Login and Logout", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("Login and Logout successfully", async () => {
      const listResponse1 = await request(getServer()).get("/box");
      expect(listResponse1.statusCode).toBe(401);

      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "first@example.com", password: "1234" });
      expect(loginResponse.statusCode).toBe(200);
      const token = loginResponse.body.token;
      expect(token.length).toBe(43);

      const listResponse2 = await request(getServer())
        .get("/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse2.statusCode).toBe(200);

      const logoutResponse = await request(getServer())
        .post("/auth/logout")
        .set("Authorization", "bearer " + token);
      expect(logoutResponse.statusCode).toBe(204);

      const listResponse3 = await request(getServer())
        .get("/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse3.statusCode).toBe(401);
    });

    it("Wrong Login password", async () => {
      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "first@example.com", password: "wrong password" });
      expect(loginResponse.statusCode).toBe(401);
    });

    it("Wrong Login username", async () => {
      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "wrong username", password: "1234" });
      expect(loginResponse.statusCode).toBe(401);
    });
    it("Success public", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/box/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Success private owned", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/box/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail private", async () => {
      const token = await loginTestUser2();
      const getResponse = await request(getServer())
        .get("/box/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(401);
    });

    it("Fail private no auth", async () => {
      const getResponse = await request(getServer()).get("/box/private");
      expect(getResponse.statusCode).toBe(401);
    });

    it("Success public > public", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/box/public/items/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail private > private", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/box/private/items/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(401);
    });

    it("Fail public > private", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/box/public/items/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(401);
    });

    it("Success private owned > public", async () => {
      const token = await loginTestUser();

      const getResponse = await request(getServer())
        .get("/box/private/items/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Success create box", async () => {
      const token = await loginTestUser2();
      const getResponse = await request(getServer())
        .post("/box")
        .set("Authorization", "bearer " + token)
        .send({ name: "new box", is_public: false });
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail create box not logged in", async () => {
      const getResponse = await request(getServer())
        .post("/box")
        .send({ name: "another box", is_public: false });
      expect(getResponse.statusCode).toBe(401);
    });

    it("should register and login new user", async () => {
      const registerResponse = await request(getServer())
        .post("/auth/register")
        .send({ name: "some name", username: "somename@example.com", password: "some password" });
      expect(registerResponse.statusCode).toBe(201);
      expect(registerResponse.body).toMatchInlineSnapshot(`
        {
          "id": 3,
          "name": "some name",
          "username": "somename@example.com",
        }
      `);

      // login is tested fully in another test, this just confirmation that login works for new user
      const loginResponse = await request(getServer())
        .post("/auth/login")
        .send({ username: "somename@example.com", password: "some password" });
      expect(loginResponse.statusCode).toBe(200);
    });

    it("should fail when creating user with invalid parameters", async () => {
      const registerResponse = await request(getServer())
        .post("/auth/register")
        .send({ name: "", username: "", password: "" });

      expect(registerResponse.statusCode).toBe(400);
      expect(registerResponse.body).toMatchSnapshot();
    });

    it("should fail when creating user with existing username", async () => {
      const data = {
        name: "some name",
        username: "somename@example.com",
        password: "some password",
      };

      await request(getServer()).post("/auth/register").send(data);

      const reregisterReponse = await request(getServer()).post("/auth/register").send(data);

      expect(reregisterReponse.statusCode).toBe(400);
      expect(reregisterReponse.body).toMatchSnapshot();
    });
  });
});
