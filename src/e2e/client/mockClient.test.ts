import { ensureEqual } from "@src/common/utils";
import {
  ApiRequestFn as EntrypointApiRequestFn,
  ApiRequestInit as EntrypointApiRequestInit,
  createClient as createClientEntrypoint,
} from "@src/e2e/client/__snapshots__/mockClient/client/api-client-entrypoint";
import {
  ApiRequestFn as ModelApiRequestFn,
  ApiRequestInit as ModelApiRequestInit,
  createClient as createClientModel,
} from "@src/e2e/client/__snapshots__/mockClient/client/api-client-model";

// test are slow
jest.setTimeout(20000);

/** Test data type used for testing API call response types */
type TestData = {
  slug: string;
  name: string;
  description: string;
};
type RespData = Omit<TestData, "description">;

describe("mock client lib", () => {
  // common test data
  const testData: TestData = { slug: "slug1", name: "test name", description: "test description" };

  describe("entrypoint", () => {
    // ---------- 1st level API calls

    describe(`successfully call API 1st level`, () => {
      it("get", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.get("slug1");

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "test description",
            "name": "test name",
            "slug": "slug1",
          },
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData = resp.data;
      });

      it("update", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.update("slug1", testData);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1`, {
          headers: {},
          method: "PATCH",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "test description",
            "name": "test name",
            "slug": "slug1",
          },
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData = resp.data;
      });

      it("create", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.create(testData);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
          headers: {},
          method: "POST",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "test description",
            "name": "test name",
            "slug": "slug1",
          },
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData = resp.data;
      });

      it("list", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: [testData], headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.list();

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": [
            {
              "description": "test description",
              "name": "test name",
              "slug": "slug1",
            },
          ],
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData[] = resp.data;
      });

      it("delete", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.delete("slug1");

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1`, {
          headers: {},
          method: "DELETE",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: void = resp.data;
      });

      // ----- custom endpoints

      it("customOneFeth", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.customOneFetch("slug1");

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/customOneFetch`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customOneSubmit", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.customOneSubmit(
          "slug1",
          testData
        );

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/customOneSubmit`, {
          headers: {},
          method: "PATCH",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customManyFetch", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.customManyFetch();

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/customManyFetch`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customManySubmit", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org.customManySubmit(testData);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/customManySubmit`, {
          headers: {},
          method: "POST",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });
    });

    // ---------- 2nd level API calls

    describe(`successfully call API 2nd level"`, () => {
      it("get", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.get(1);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/1`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "test description",
            "name": "test name",
            "slug": "slug1",
          },
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData = resp.data;
      });

      it("update", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.update(1, testData);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/1`, {
          headers: {},
          method: "PATCH",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "test description",
            "name": "test name",
            "slug": "slug1",
          },
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData = resp.data;
      });

      it("create", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.create({ ...testData, virtProp: "smthng" });

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos`, {
          headers: {},
          method: "POST",
          body: {
            slug: "slug1",
            name: "test name",
            description: "test description",
            virtProp: "smthng",
          },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "test description",
            "name": "test name",
            "slug": "slug1",
          },
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData = resp.data;
      });

      it("list", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: [testData], headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.list();

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": [
            {
              "description": "test description",
              "name": "test name",
              "slug": "slug1",
            },
          ],
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: RespData[] = resp.data;
      });

      it("delete", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.delete(1);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/1`, {
          headers: {},
          method: "DELETE",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest: void = resp.data;
      });

      // ----- custom endpoints

      it("customOneFeth", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.customOneFetch(1);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/1/customOneFetch`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customOneSubmit", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.customOneSubmit(1, testData);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/1/customOneSubmit`, {
          headers: {},
          method: "PATCH",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customManyFetch", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.customManyFetch();

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/customManyFetch`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customManySubmit", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.customManySubmit(testData);

        // type narrowing for simpler later code
        ensureEqual(
          resp.kind,
          "success" as const,
          `API response is not "success" but "${resp.kind}`
        );

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/customManySubmit`, {
          headers: {},
          method: "POST",
          body: { slug: "slug1", name: "test name", description: "test description" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {},
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });
    });

    // ---------- error calls
    describe("error calls", () => {
      it("error without data", async () => {
        const requestFn = jest.fn(async () => ({
          status: 500,
          data: "Test server error message",
          headers: {},
        }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.get(1);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "error" as const, `API response is not "error" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos/1`, {
          headers: {},
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "error": {
            "code": "ERROR_CODE_OTHER",
            "message": "Test server error message",
          },
          "headers": {},
          "kind": "error",
          "status": 500,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest:
          | "ERROR_CODE_RESOURCE_NOT_FOUND"
          | "ERROR_CODE_SERVER_ERROR"
          | "ERROR_CODE_OTHER" = resp.error.code;
      });

      it("error with data", async () => {
        const requestFn = jest.fn(async () => ({
          status: 400,
          headers: {},
          data: {
            code: "ERROR_CODE_VALIDATION",
            message: "test error message",
            data: { value: "test error data" },
          },
        }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.create({ ...testData, virtProp: "smthng" });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "error" as const, `API response is not "error" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/slug1/repos`, {
          headers: {},
          method: "POST",
          body: {
            slug: "slug1",
            name: "test name",
            description: "test description",
            virtProp: "smthng",
          },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "error": {
            "code": "ERROR_CODE_VALIDATION",
            "data": {
              "value": "test error data",
            },
            "message": "test error message",
          },
          "headers": {},
          "kind": "error",
          "status": 400,
        }
      `);

        // test return type
        // @ts-expect-no-error
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const typeTest:
          | "ERROR_CODE_RESOURCE_NOT_FOUND"
          | "ERROR_CODE_SERVER_ERROR"
          | "ERROR_CODE_OTHER"
          | "ERROR_CODE_VALIDATION" = resp.error.code;
      });
    });
  });

  describe("model", () => {
    it("get", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
      const resp = await createTestModelClient(requestFn).api.org.get(1);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
          {
            "data": {
              "description": "test description",
              "name": "test name",
              "slug": "slug1",
            },
            "headers": {},
            "kind": "success",
            "status": 200,
          }
        `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: RespData = resp.data;
    });

    it("update", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
      const resp = await createTestModelClient(requestFn).api.org.update(1, testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1`, {
        headers: {},
        method: "PATCH",
        body: { slug: "slug1", name: "test name", description: "test description" },
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
          {
            "data": {
              "description": "test description",
              "name": "test name",
              "slug": "slug1",
            },
            "headers": {},
            "kind": "success",
            "status": 200,
          }
        `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: RespData = resp.data;
    });

    it("create", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
      const resp = await createTestModelClient(requestFn).api.org.create(testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
        headers: {},
        method: "POST",
        body: { slug: "slug1", name: "test name", description: "test description" },
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
          {
            "data": {
              "description": "test description",
              "name": "test name",
              "slug": "slug1",
            },
            "headers": {},
            "kind": "success",
            "status": 200,
          }
        `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: RespData = resp.data;
    });

    it("list", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: [testData], headers: {} }));
      const resp = await createTestModelClient(requestFn).api.org.list();

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
          {
            "data": [
              {
                "description": "test description",
                "name": "test name",
                "slug": "slug1",
              },
            ],
            "headers": {},
            "kind": "success",
            "status": 200,
          }
        `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: RespData[] = resp.data;
    });

    it("delete", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
      const resp = await createTestModelClient(requestFn).api.org.delete(1);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1`, {
        headers: {},
        method: "DELETE",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
          {
            "data": undefined,
            "headers": {},
            "kind": "success",
            "status": 200,
          }
        `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: void = resp.data;
    });
  });
});

/**
 * Create testing entrypoint client instance
 */
function createTestEntrypointClient(requestFn: EntrypointApiRequestFn) {
  return createClientEntrypoint({
    rootPath: "/rootPath", // test root path
    // request implementation fn that returns hardcoded values
    requestFn: async function (url: string, init: EntrypointApiRequestInit) {
      return await requestFn(url, init);
    },
  });
}

/**
 * Create testing model client instance
 */
function createTestModelClient(requestFn: ModelApiRequestFn) {
  return createClientModel({
    rootPath: "/rootPath", // test root path
    // request implementation fn that returns hardcoded values
    requestFn: async function (url: string, init: ModelApiRequestInit) {
      return await requestFn(url, init);
    },
  });
}
