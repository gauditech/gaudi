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
            // id: 1,
            name: "First",
            username: "first",
            password: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
          },
          {
            // id: 2,
            name: "Second",
            username: "second",
            password: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
          },
        ],
      },
      {
        model: "AuthUserAccessToken",
        data: [
          {
            authUser_id: 1,
            token: "6Jty8G-HtB9CmB9xqRkJ3Z9LY5_or7pACnAQ6dERc1U",
            expiryDate: `${Date.now() + 1 * 60 * 60 * 1000}`,
          },
          {
            authUser_id: 2,
            token: "FwExbO7sVwf95pI3F3qWSpkANE4aeoNiI0pogqiMcfQ",
            expiryDate: `${Date.now() + 1 * 60 * 60 * 1000}`,
          },
        ],
      },
      {
        model: "Operator",
        data: [
          {
            user_id: 1,
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
      .post("/auth_user/login")
      .send({ username: "first", password: "1234" });
    return loginResponse.body.token;
  }

  async function loginTestUser2() {
    const loginResponse = await request(getServer())
      .post("/auth_user/login")
      .send({ username: "second", password: "1234" });
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
        .post("/auth_user/login")
        .send({ username: "first", password: "1234" });
      expect(loginResponse.statusCode).toBe(200);

      const token = loginResponse.body.token;
      expect(token?.length).toBe(43);

      const listResponse2 = await request(getServer())
        .get("/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse2.statusCode).toBe(200);

      const logoutResponse = await request(getServer())
        .post("/auth_user/logout")
        .set("Authorization", "bearer " + token);
      expect(logoutResponse.statusCode).toBe(204);

      const listResponse3 = await request(getServer())
        .get("/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse3.statusCode).toBe(401);
    });

    it("Wrong Login password", async () => {
      const loginResponse = await request(getServer())
        .post("/auth_user/login")
        .send({ username: "first", password: "wrong password" });
      expect(loginResponse.statusCode).toBe(401);
    });

    it("Wrong Login username", async () => {
      const loginResponse = await request(getServer())
        .post("/auth_user/login")
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

    it("Return auth token in response", async () => {
      const authToken = "FwExbO7sVwf95pI3F3qWSpkANE4aeoNiI0pogqiMcfQ";

      const listResponse2 = await request(getServer())
        .post("/box/fetchAuthToken")
        // send token in header
        .set("Authorization", "bearer " + authToken)
        .send({});
      expect(listResponse2.statusCode).toBe(200);
      // expect the same token in response
      expect(listResponse2.body?.token).toBe(authToken);
    });
  });

  describe("user registration", () => {
    beforeAll(async () => {
      await setup();
    });
    afterAll(async () => {
      await destroy();
    });

    it("should register and login new user", async () => {
      const registerResponse = await request(getServer())
        .post("/auth_user/register")
        .send({
          name: "some name",
          username: "somename@example.com",
          clearPassword: "some password",
          userProfile: { displayName: "Profile Display Name" },
        });

      expect(registerResponse.statusCode).toBe(201);
      expect(registerResponse.body).toMatchSnapshot();

      // login is tested fully in another test, this just confirmation that login doesn't fail for new user
      const loginResponse = await request(getServer())
        .post("/auth_user/login")
        .send({ username: "somename@example.com", password: "some password" });
      expect(loginResponse.statusCode).toBe(200);
    });

    it("should fail when creating user with invalid parameters", async () => {
      const registerResponse = await request(getServer())
        .post("/auth_user/register")
        .send({ name: "", username: "", password: "" });

      expect(registerResponse.statusCode).toBe(400);
      expect(registerResponse.body?.code).toMatchInlineSnapshot(`"ERROR_CODE_VALIDATION"`);
    });

    it("should fail when creating user with existing username", async () => {
      const data = {
        name: "some name",
        username: "somename2@example.com",
        password: "some password",
        userProfile: { displayName: "Profile Display Name" },
      };

      await request(getServer()).post("/auth_user/register").send(data);

      const reregisterReponse = await request(getServer()).post("/auth_user/register").send(data);

      expect(reregisterReponse.statusCode).toBe(400);
      // TODO: match body instead of text once hooks are able to throw complex errors
      expect(reregisterReponse.text).toMatchInlineSnapshot(
        `"Username already exists: somename@example.com"`
      );
    });
  });
});
