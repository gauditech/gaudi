import { ensureEqual } from "@gaudi/compiler/dist/common/utils";

import {
  ApiRequestParametersType,
  ApiResponseErrorCodeType,
  ApiResponseErrorDataType,
  ApiResponseErrorType,
  ApiResponseSuccessDataType,
  ApiResponseSuccessType,
  ApiRequestFn as EntrypointApiRequestFn,
  ApiRequestInit as EntrypointApiRequestInit,
  PaginatedListResponse,
  createClient,
} from "@runtime/e2e/client/__snapshots__/mockClient/client/api-client";

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

    describe(`1st level API`, () => {
      it("get", async () => {
        const requestFn = jest.fn(async () => ({
          status: 200,
          data: testData,
          headers: {
            "Gaudi-Test": "Response Foo Bar",
          },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.get("slug1", {
          headers: { "Gaudi-Test": "Request Foo Bar" },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
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
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
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
        const requestFn = jest.fn(async () => ({
          status: 200,
          data: testData,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.update("slug1", testData, {
          headers: { "Gaudi-Test": "Request Foo Bar" },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
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
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
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
        const requestFn = jest.fn(async () => ({
          status: 200,
          data: testData,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.create(testData, {
          headers: {
            "Gaudi-Test": "Request Foo Bar",
          },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
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
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
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
        const requestFn = jest.fn(async () => ({
          status: 200,
          data: [testData],
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.list({
          headers: {
            "Gaudi-Test": "Request Foo Bar",
          },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
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
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
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
        const requestFn = jest.fn(async () => ({
          status: 200,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.delete("slug1", {
          headers: { "Gaudi-Test": "Request Foo Bar" },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
          method: "DELETE",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
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

      it("customOneFetch", async () => {
        const requestFn = jest.fn(async () => ({
          status: 200,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.customOneFetch("slug1", {
          headers: { "Gaudi-Test": "Request Foo Bar" },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/customOneFetch`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customOneSubmit", async () => {
        const requestFn = jest.fn(async () => ({
          status: 200,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.customOneSubmit(
          "slug1",
          // custom endpoint fieldset
          {
            extraProp: "prop value",
          },
          {
            headers: { "Gaudi-Test": "Request Foo Bar" },
          }
        );

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/customOneSubmit`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
          method: "PATCH",
          body: {
            extraProp: "prop value",
          },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customManyFetch", async () => {
        const requestFn = jest.fn(async () => ({
          status: 200,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.customManyFetch({
          headers: {
            "Gaudi-Test": "Request Foo Bar",
          },
        });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/customManyFetch`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
          method: "GET",
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });

      it("customManySubmit", async () => {
        const requestFn = jest.fn(async () => ({
          status: 200,
          headers: { "Gaudi-Test": "Response Foo Bar" },
        }));
        const resp = await createTestEntrypointClient(requestFn, {
          "Gaudi-Test-Default": "Default Foo Bar",
        }).api.org.customManySubmit(
          // custom endpoint fieldset
          { extraProp: "prop value" },
          {
            headers: {
              "Gaudi-Test": "Request Foo Bar",
            },
          }
        );

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/customManySubmit`, {
          headers: { "Gaudi-Test-Default": "Default Foo Bar", "Gaudi-Test": "Request Foo Bar" },
          method: "POST",
          body: { extraProp: "prop value" },
        });

        // test response
        expect(resp).toMatchInlineSnapshot(`
        {
          "data": undefined,
          "headers": {
            "Gaudi-Test": "Response Foo Bar",
          },
          "kind": "success",
          "status": 200,
        }
      `);

        // no return type checking since we don't know return type of custom endpoints
      });
    });

    // ---------- 2nd level API calls

    describe(`2nd level API`, () => {
      it("get", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.get(1);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1`, {
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
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1`, {
          headers: {},
          method: "PATCH",
          body: {
            slug: "slug1",
            name: "test name",
            description: "test description",
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

      it("create", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.create({ ...testData, virtProp: "smthng", owner_id: null });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos`, {
          headers: {},
          method: "POST",
          body: {
            slug: "slug1",
            name: "test name",
            description: "test description",
            virtProp: "smthng",
            owner_id: null,
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

      it("list with paging", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: [testData], headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.list();

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos`, {
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
        const typeTest: PaginatedListResponse<RespData> = resp.data;
      });

      it("delete", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn).api.org("slug1").repos.delete(1);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1`, {
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

      it("customOneFetch", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos.customOneFetch(1);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1/customOneFetch`, {
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
          .repos.customOneSubmit(1);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1/customOneSubmit`, {
          headers: {},
          method: "PATCH",
          body: undefined,
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
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/customManyFetch`, {
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
          .repos.customManySubmit();

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/customManySubmit`, {
          headers: {},
          method: "POST",
          body: undefined,
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

    // ---------- 3rd level cardinality one API

    describe(`3rd level cardinality one API`, () => {
      it("get", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, data: testData, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos(1)
          .owner.get();

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1/owner`, {
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
          .repos(1)
          .owner.update(testData);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1/owner`, {
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
          .repos(1)
          .owner.create(testData);

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // rest request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1/owner`, {
          headers: {},
          method: "POST",
          body: {
            slug: "slug1",
            name: "test name",
            description: "test description",
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

      it("delete", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos(1)
          .owner.delete();

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1/owner`, {
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

      it("customOneFetch", async () => {
        const requestFn = jest.fn(async () => ({ status: 200, headers: {} }));
        const resp = await createTestEntrypointClient(requestFn)
          .api.org("slug1")
          .repos(1)
          .owner.customOneFetch();

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(
          `/rootPath/api/org/slug1/repos/1/owner/customOneFetch`,
          {
            headers: {},
            method: "GET",
          }
        );

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
          .repos(1)
          .owner.customOneSubmit();

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "success", `API response is not "success" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(
          `/rootPath/api/org/slug1/repos/1/owner/customOneSubmit`,
          {
            headers: {},
            method: "PATCH",
            body: undefined,
          }
        );

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
        ensureEqual(resp.kind, "error", `API response is not "error" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos/1`, {
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
          .repos.create({ ...testData, virtProp: "smthng", owner_id: null });

        // type narrowing for simpler later code
        ensureEqual(resp.kind, "error", `API response is not "error" but "${resp.kind}`);

        // test request
        expect(requestFn).toHaveBeenCalledWith(`/rootPath/api/org/slug1/repos`, {
          headers: {},
          method: "POST",
          body: {
            slug: "slug1",
            name: "test name",
            description: "test description",
            virtProp: "smthng",
            owner_id: null,
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

  describe("API helper types", () => {
    it("get types ", async () => {
      const client = createClient();

      // test request type
      assert<
        Equal<
          ApiRequestParametersType<typeof client.api.org.get>,
          [id: string, options?: Partial<EntrypointApiRequestInit>]
        >
      >(true);

      // test response type
      assert<
        Equal<
          ApiResponseSuccessType<typeof client.api.org.get>,
          {
            kind: "success";
            status: number;
            headers: { [name: string]: string };
            data: {
              id: number;
              slug: string;
              name: string;
            };
          }
        >
      >(true);

      // test response data type
      assert<
        Equal<
          ApiResponseSuccessDataType<typeof client.api.org.get>,
          {
            id: number;
            slug: string;
            name: string;
          }
        >
      >(true);

      // ----- test errors

      type ErrorCode =
        | "ERROR_CODE_OTHER"
        | "ERROR_CODE_RESOURCE_NOT_FOUND"
        | "ERROR_CODE_SERVER_ERROR";

      // test error type
      assert<
        Equal<
          ApiResponseErrorType<typeof client.api.org.get>,
          {
            kind: "error";
            status: number;
            headers: { [name: string]: string };
            error: {
              code: ErrorCode;
              message: string;
              data?: unknown;
            };
          }
        >
      >(true);

      // test error data type
      assert<
        Equal<
          ApiResponseErrorDataType<typeof client.api.org.get>,
          {
            code: ErrorCode;
            message: string;
            data?: unknown;
          }
        >
      >(true);

      // test error code type
      assert<Equal<ApiResponseErrorCodeType<typeof client.api.org.get>, ErrorCode>>(true);
    });

    // TODO: add types for other API endpoints
  });
});

/**
 * Create testing entrypoint client instance
 */
function createTestEntrypointClient(
  requestFn: EntrypointApiRequestFn,
  defaultHeaders?: Record<string, string>
) {
  return createClient({
    rootPath: "/rootPath", // test root path
    // request implementation fn that returns hardcoded values
    requestFn: async function (url: string, init: EntrypointApiRequestInit) {
      return await requestFn(url, init);
    },
    headers: defaultHeaders,
  });
}

// ----- utils

/** Meta type that resolves to `true` if two types are equal, `false` otherwise */
type Equal<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

/** Assertion function that throws compile error if generic type and function parameter do not match */
function assert<T extends true | false>(_: T) {
  // no-op, this throws compile time error
}
