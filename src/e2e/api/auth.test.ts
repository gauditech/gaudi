import path from "path";

import _ from "lodash";
import request from "supertest";

import { DATA } from "@src/e2e/api/auth.data";
import { createApiTestSetup, loadBlueprint } from "@src/e2e/api/setup";
import { readConfig } from "@src/runtime/config";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(60000);

describe("Auth", () => {
  const config = readConfig(path.join(__dirname, "api.test.env"));

  const { getServer, setup, destroy } = createApiTestSetup(
    config,
    loadBlueprint(path.join(__dirname, "auth.model.gaudi")),
    DATA
  );

  async function loginTestUser() {
    const loginResponse = await request(getServer())
      .post("/api/auth/auth_user/login")
      .send({ username: "first", password: "1234" });
    return loginResponse.body.token;
  }

  async function loginTestUser2() {
    const loginResponse = await request(getServer())
      .post("/api/auth/auth_user/login")
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
      const listResponse1 = await request(getServer()).get("/api/box");
      expect(listResponse1.statusCode).toBe(401);

      const loginResponse = await request(getServer())
        .post("/api/auth/auth_user/login")
        .send({ username: "first", password: "1234" });
      expect(loginResponse.statusCode).toBe(200);

      const token = loginResponse.body.token;
      expect(token?.length).toBe(43);

      const listResponse2 = await request(getServer())
        .get("/api/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse2.statusCode).toBe(200);

      const logoutResponse = await request(getServer())
        .post("/api/auth/auth_user/logout")
        .set("Authorization", "bearer " + token);
      expect(logoutResponse.statusCode).toBe(204);

      const listResponse3 = await request(getServer())
        .get("/api/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse3.statusCode).toBe(401);
    });

    it("Wrong Login password", async () => {
      const loginResponse = await request(getServer())
        .post("/api/auth/auth_user/login")
        .send({ username: "first", password: "wrong password" });
      expect(loginResponse.statusCode).toBe(401);
    });

    it("Wrong Login username", async () => {
      const loginResponse = await request(getServer())
        .post("/api/auth/auth_user/login")
        .send({ username: "wrong username", password: "1234" });
      expect(loginResponse.statusCode).toBe(401);
    });
    it("Success public", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/api/box/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Success private owned", async () => {
      const token = await loginTestUser();

      const getResponse = await request(getServer())
        .get("/api/box/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail private", async () => {
      const token = await loginTestUser2();
      const getResponse = await request(getServer())
        .get("/api/box/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(401);
    });

    it("Fail private no auth", async () => {
      const getResponse = await request(getServer()).get("/api/box/private");
      expect(getResponse.statusCode).toBe(401);
    });

    it("Success public > public", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/api/box/public/items/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail private > private", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/api/box/private/items/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(401);
    });

    it("Fail public > private", async () => {
      const token = await loginTestUser();
      const getResponse = await request(getServer())
        .get("/api/box/public/items/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(401);
    });

    it("Success private owned > public", async () => {
      const token = await loginTestUser();

      const getResponse = await request(getServer())
        .get("/api/box/private/items/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Success create box", async () => {
      const token = await loginTestUser2();

      const getResponse = await request(getServer())
        .post("/api/box")
        .set("Authorization", "bearer " + token)
        .send({ name: "new box", is_public: false });
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail create box not logged in", async () => {
      const getResponse = await request(getServer())
        .post("/api/box")
        .send({ name: "another box", is_public: false });
      expect(getResponse.statusCode).toBe(401);
    });

    it("Return auth token in response", async () => {
      const authToken = "FwExbO7sVwf95pI3F3qWSpkANE4aeoNiI0pogqiMcfQ";

      const listResponse2 = await request(getServer())
        .post("/api/box/fetchAuthToken")
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
        .post("/api/auth/auth_user/register")
        .send({
          authUser: {
            name: "some name",
            username: "somename@example.com",
            password: "some password",
            userProfile: { displayName: "Profile Display Name" },
          },
        });

      expect(registerResponse.statusCode).toBe(201);
      expect(registerResponse.body).toMatchSnapshot();

      // login is tested fully in another test, this just confirmation that login doesn't fail for new user
      const loginResponse = await request(getServer())
        .post("/api/auth/auth_user/login")
        .send({ username: "somename@example.com", password: "some password" });
      expect(loginResponse.statusCode).toBe(200);
    });

    it("should fail when creating user with invalid parameters", async () => {
      const registerResponse = await request(getServer())
        .post("/api/auth/auth_user/register")
        .send({ name: "", username: "", password: "" });

      expect(registerResponse.statusCode).toBe(400);
      expect(registerResponse.body?.code).toMatchInlineSnapshot(`"ERROR_CODE_VALIDATION"`);
    });

    it("should fail when creating user with existing username", async () => {
      const data = {
        authUser: {
          name: "some name",
          username: "somename@example.com",
          password: "some password",
          userProfile: { displayName: "Profile Display Name" },
        },
      };

      await request(getServer()).post("/api/auth/auth_user/register").send(data);

      const reregisterReponse = await request(getServer())
        .post("/api/auth/auth_user/register")
        .send(data);

      // FIXME this should be a validation error instead, but we don't handle unique constraints yet
      expect(reregisterReponse.statusCode).toBe(500);
    });
  });
});
