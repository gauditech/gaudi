import { pagingToQueryLimit } from "@runtime/common/utils";
import { flattenTree } from "@runtime/server/vars";

describe("runtime common utils", () => {
  describe("paging", () => {
    describe("without defaults", () => {
      it("first page", () => {
        const result = pagingToQueryLimit(1, 10, undefined, undefined);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 10,
            "offset": 0,
          }
        `);
      });

      it("next page", () => {
        const result = pagingToQueryLimit(2, 10, undefined, undefined);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 10,
            "offset": 10,
          }
        `);
      });

      it("zero/negative page", () => {
        const result = pagingToQueryLimit(0, 10, undefined, undefined);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 10,
            "offset": 0,
          }
        `);
      });

      it("negative page size", () => {
        const result = pagingToQueryLimit(1, -10, undefined, undefined);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 0,
            "offset": 0,
          }
        `);
      });

      it("empty page", () => {
        const result = pagingToQueryLimit(undefined, 10, undefined, undefined);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 10,
            "offset": undefined,
          }
        `);
      });

      it("empty page size", () => {
        const result = pagingToQueryLimit(1, undefined, undefined, undefined);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": undefined,
            "offset": undefined,
          }
        `);
      });
    });

    describe("with defaults", () => {
      it("page and size given", () => {
        const result = pagingToQueryLimit(1, 10, 3, 30);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 10,
            "offset": 0,
          }
        `);
      });

      it("size empty", () => {
        const result = pagingToQueryLimit(1, undefined, 20, 20);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 20,
            "offset": 0,
          }
        `);
      });

      it("page and size empty", () => {
        const result = pagingToQueryLimit(undefined, undefined, 20, 20);

        expect(result).toMatchInlineSnapshot(`
          {
            "limit": 20,
            "offset": 20,
          }
        `);
      });
    });
  });
  describe("flattenTree", () => {
    it("works as expected", () => {
      const ctx = {
        obj: {
          nestedObj: {
            foo: 1,
          },
          key: "string",
          arr: [1, 2, "three", true, null, undefined, { foo: "bar" }, ["x", "y"]],
        },
        val: new Date(2222, 2, 2, 2, 2, 2, 2).toISOString(),
      };
      expect(flattenTree(ctx, [])).toMatchInlineSnapshot(`
        [
          [
            "obj__nestedObj__foo",
            1,
          ],
          [
            "obj__key",
            "string",
          ],
          [
            "obj__arr__0",
            1,
          ],
          [
            "obj__arr__1",
            2,
          ],
          [
            "obj__arr__2",
            "three",
          ],
          [
            "obj__arr__3",
            true,
          ],
          [
            "obj__arr__4",
            null,
          ],
          [
            "obj__arr__5",
            undefined,
          ],
          [
            "obj__arr__6__foo",
            "bar",
          ],
          [
            "obj__arr__7__0",
            "x",
          ],
          [
            "obj__arr__7__1",
            "y",
          ],
          [
            "val",
            "2222-03-02T01:02:02.002Z",
          ],
        ]
      `);
    });
  });
});
