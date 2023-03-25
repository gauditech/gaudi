import { ensureEqual } from "@src/common/utils";
import { ApiRequestFn, ApiRequestInit, createClient } from "@src/e2e/client/dist/client/api-client";

/** Test data type used for testing API call response types */
type TestData = {
  name: string;
};

describe("client lib", () => {
  // common test data
  const testData: TestData = { name: "asdf" };

  // ---------- 1st level API calls

  describe(`successfully call to API 1st level`, () => {
    it("get", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData }));
      const resp = await createTestClient(requestFn).api.org.get(1);

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
            "name": "asdf",
          },
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData = resp.data;
    });

    it("update", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData }));
      const resp = await createTestClient(requestFn).api.org.update(1, testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1`, {
        headers: {},
        method: "PATCH",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "name": "asdf",
          },
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData = resp.data;
    });

    it("create", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData }));
      const resp = await createTestClient(requestFn).api.org.create(testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
        headers: {},
        method: "POST",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "name": "asdf",
          },
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData = resp.data;
    });

    it("list", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: [testData] }));
      const resp = await createTestClient(requestFn).api.org.list();

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
              "name": "asdf",
            },
          ],
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData[] = resp.data;
    });

    it("delete", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.delete(1);

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
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customOneFetch(1);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1/customOneFetch`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "kind": "success",
          "status": 200,
        }
      `);

      // no return type checking since we don't know return type of custom endpoints
    });

    it("customOneSubmit", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customOneSubmit(1, testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1/customOneSubmit`, {
        headers: {},
        method: "PATCH",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "kind": "success",
          "status": 200,
        }
      `);

      // no return type checking since we don't know return type of custom endpoints
    });

    it("customManyFetch", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customManyFetch();

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/customManyFetch`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "kind": "success",
          "status": 200,
        }
      `);

      // no return type checking since we don't know return type of custom endpoints
    });

    it("customManySubmit", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customManySubmit(testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/customManySubmit`, {
        headers: {},
        method: "POST",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
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
      const requestFn = jest.fn(async () => ({ status: 200, data: testData }));
      const resp = await createTestClient(requestFn).api.org(1).repo.get(1);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1/repo/1`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "name": "asdf",
          },
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData = resp.data;
    });

    it("update", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData }));
      const resp = await createTestClient(requestFn).api.org.update(1, testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1`, {
        headers: {},
        method: "PATCH",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "name": "asdf",
          },
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData = resp.data;
    });

    it("create", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: testData }));
      const resp = await createTestClient(requestFn).api.org.create(testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // rest request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
        headers: {},
        method: "POST",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": {
            "name": "asdf",
          },
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData = resp.data;
    });

    it("list", async () => {
      const requestFn = jest.fn(async () => ({ status: 200, data: [testData] }));
      const resp = await createTestClient(requestFn).api.org.list();

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
              "name": "asdf",
            },
          ],
          "kind": "success",
          "status": 200,
        }
      `);

      // test return type
      // @ts-expect-no-error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const typeTest: TestData[] = resp.data;
    });

    it("delete", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.delete(1);

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
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customOneFetch(1);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1/customOneFetch`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "kind": "success",
          "status": 200,
        }
      `);

      // no return type checking since we don't know return type of custom endpoints
    });

    it("customOneSubmit", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customOneSubmit(1, testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1/customOneSubmit`, {
        headers: {},
        method: "PATCH",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "kind": "success",
          "status": 200,
        }
      `);

      // no return type checking since we don't know return type of custom endpoints
    });

    it("customManyFetch", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customManyFetch();

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/customManyFetch`, {
        headers: {},
        method: "GET",
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "kind": "success",
          "status": 200,
        }
      `);

      // no return type checking since we don't know return type of custom endpoints
    });

    it("customManySubmit", async () => {
      const requestFn = jest.fn(async () => ({ status: 200 }));
      const resp = await createTestClient(requestFn).api.org.customManySubmit(testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "success" as const, `API response is not "success" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/customManySubmit`, {
        headers: {},
        method: "POST",
        body: '{"name":"asdf"}',
      });

      // test response
      expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
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
      }));
      const resp = await createTestClient(requestFn).api.org.get(1);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "error" as const, `API response is not "error" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org/1`, {
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
        data: {
          code: "ERROR_CODE_VALIDATION",
          message: "test error message",
          data: { value: "test error data" },
        },
      }));
      const resp = await createTestClient(requestFn).api.org.create(testData);

      // type narrowing for simpler later code
      ensureEqual(resp.kind, "error" as const, `API response is not "error" but "${resp.kind}`);

      // test request
      expect(requestFn).toHaveBeenCalledWith(`/rootPath/org`, {
        headers: {},
        method: "POST",
        body: '{"name":"asdf"}',
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

/**
 * Create testing API client instance
 */
function createTestClient(requestFn: ApiRequestFn) {
  return createClient({
    rootPath: "/rootPath", // test root path
    // request implementation fn that returns hardcoded values
    requestFn: async function (url: string, init: ApiRequestInit) {
      return await requestFn(url, init);
    },
  });
}
