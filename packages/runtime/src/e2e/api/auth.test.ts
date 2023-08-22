import { Server } from "http";
import path from "path";

import * as dotenv from "dotenv";
import request from "supertest";

import { DATA } from "@runtime/e2e/api/auth.data";
import { createTestInstance, loadBlueprint } from "@runtime/e2e/api/setup";

// these tests last longer than default 5s timeout so this seems to help
jest.setTimeout(60000);

describe("Auth", () => {
  dotenv.config({ path: path.join(__dirname, "api.test.env") });
  const runner = createTestInstance(loadBlueprint(path.join(__dirname, "auth.model.gaudi")), DATA);

  async function loginOwner(server: Server) {
    const loginResponse = await request(server)
      .post("/api/auth/auth_user/login")
      .send({ username: "first", password: "1234" });
    return loginResponse.body.token;
  }

  async function loginAnotherUser(server: Server) {
    const loginResponse = await request(server)
      .post("/api/auth/auth_user/login")
      .send({ username: "second", password: "1234" });
    return loginResponse.body.token;
  }

  describe("Login and Logout", () => {
    it("Login and Logout successfully", async () => {
      const server = await runner.setup();

      const listResponse1 = await request(server).get("/api/box");
      expect(listResponse1.statusCode).toBe(401);

      const loginResponse = await request(server)
        .post("/api/auth/auth_user/login")
        .send({ username: "first", password: "1234" });
      expect(loginResponse.statusCode).toBe(200);

      const token = loginResponse.body.token;
      expect(token?.length).toBe(43);

      const listResponse2 = await request(server)
        .get("/api/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse2.statusCode).toBe(200);

      const logoutResponse = await request(server)
        .post("/api/auth/auth_user/logout")
        .set("Authorization", "bearer " + token);
      expect(logoutResponse.statusCode).toBe(204);

      const listResponse3 = await request(server)
        .get("/api/box")
        .set("Authorization", "bearer " + token);
      expect(listResponse3.statusCode).toBe(401);
    });

    it("Wrong Login password", async () => {
      const server = await runner.setup();

      const loginResponse = await request(server)
        .post("/api/auth/auth_user/login")
        .send({ username: "first", password: "wrong password" });
      expect(loginResponse.statusCode).toBe(401);
    });

    it("Wrong Login username", async () => {
      const server = await runner.setup();

      const loginResponse = await request(server)
        .post("/api/auth/auth_user/login")
        .send({ username: "wrong username", password: "1234" });
      // TODO: fix in plugin to return 401
      expect(loginResponse.statusCode).toBe(500);
    });

    it("Return auth token in response", async () => {
      const server = await runner.setup();

      const authToken = "FwExbO7sVwf95pI3F3qWSpkANE4aeoNiI0pogqiMcfQ";
      const listResponse2 = await request(server)
        .post("/api/box/fetchAuthToken")
        // send token in header
        .set("Authorization", "bearer " + authToken)
        .send({});
      expect(listResponse2.statusCode).toBe(200);
      // expect the same token in response
      expect(listResponse2.body?.token).toBe(authToken);
    });
  });

  describe("Authorize rules in endpoints", () => {
    it("Success public", async () => {
      const server = await runner.setup();
      const token = await loginOwner(server);

      const getResponse = await request(server)
        .get("/api/box/public")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Success private owned", async () => {
      const server = await runner.setup();
      const token = await loginOwner(server);

      const getResponse = await request(server)
        .get("/api/box/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail private", async () => {
      const server = await runner.setup();
      const token = await loginAnotherUser(server);

      const getResponse = await request(server)
        .get("/api/box/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(403);
    });

    it("Fail private no auth", async () => {
      const server = await runner.setup();

      const getResponse = await request(server).get("/api/box/private");
      expect(getResponse.statusCode).toBe(401);
    });

    it("Success create box", async () => {
      const server = await runner.setup();
      const token = await loginAnotherUser(server);

      const getResponse = await request(server)
        .post("/api/box")
        .set("Authorization", "bearer " + token)
        .send({ name: "new box", is_public: false });
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail create box not logged in", async () => {
      const server = await runner.setup();

      const getResponse = await request(server)
        .post("/api/box")
        .send({ name: "another box", is_public: false });
      expect(getResponse.statusCode).toBe(401);
    });
  });

  describe("Authorize rules inheritance from entrypoints", () => {
    /**
     * Only items from public boxes (regardless of ownership) can be requested.
     * `list` additionally expects ownership.
     */

    it("Fail private box > get public owned", async () => {
      const server = await runner.setup();
      const token = await loginOwner(server);

      const getResponse = await request(server)
        .get("/api/box/private/items/public2")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(403);
    });

    it("Success public box > get private", async () => {
      const server = await runner.setup();
      const token = await loginAnotherUser(server);

      const getResponse = await request(server)
        .get("/api/box/public/items/private")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Success public box > list owned", async () => {
      const server = await runner.setup();
      const token = await loginOwner(server);

      const getResponse = await request(server)
        .get("/api/box/public/items/")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(200);
    });

    it("Fail public box > list", async () => {
      const server = await runner.setup();
      const token = await loginAnotherUser(server);

      const getResponse = await request(server)
        .get("/api/box/public/items/")
        .set("Authorization", "bearer " + token);
      expect(getResponse.statusCode).toBe(403);
    });

    it("Fail public box > list not logged in returns 401", async () => {
      const server = await runner.setup();

      const getResponse = await request(server).get("/api/box/public/items/");
      expect(getResponse.statusCode).toBe(401);
    });
  });

  describe("user registration", () => {
    it("should register and login new user", async () => {
      const server = await runner.setup();

      const registerResponse = await request(server)
        .post("/api/auth/auth_user/register")
        .send({
          password: "some password",
          authUser: {
            name: "some name",
            username: "somename@example.com",
            userProfile: { displayName: "Profile Display Name" },
          },
        });

      expect(registerResponse.statusCode).toBe(201);
      expect(registerResponse.body).toMatchSnapshot();

      // login is tested fully in another test, this just confirmation that login doesn't fail for new user
      const loginResponse = await request(server)
        .post("/api/auth/auth_user/login")
        .send({ username: "somename@example.com", password: "some password" });
      expect(loginResponse.statusCode).toBe(200);
    });

    it("should fail when creating user with invalid parameters", async () => {
      const server = await runner.setup();

      const registerResponse = await request(server)
        .post("/api/auth/auth_user/register")
        .send({ name: "", username: "", password: "" });

      expect(registerResponse.statusCode).toBe(400);
      expect(registerResponse.body?.code).toMatchInlineSnapshot(`"ERROR_CODE_VALIDATION"`);
    });

    it("should fail when creating user with existing username", async () => {
      const server = await runner.setup();

      const data = {
        password: "some password",
        authUser: {
          name: "some name",
          username: "somename@example.com",
          userProfile: { displayName: "Profile Display Name" },
        },
      };
      await request(server).post("/api/auth/auth_user/register").send(data);

      const reregisterReponse = await request(server)
        .post("/api/auth/auth_user/register")
        .send(data);

      // FIXME this should be a validation error instead, but we don't handle unique constraints yet
      expect(reregisterReponse.statusCode).toBe(500);
    });
  });
});
