import { pagingToQueryLimit } from "@src/runtime/common/utils";

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
});
