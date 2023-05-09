import { ensureEqual, nameInitials, resolveItems } from "./utils.js";

describe("nameInitials", () => {
  it("succeeds for camelCase examples", () => {
    expect(nameInitials("myFirstWord")).toBe("mfw");
    expect(nameInitials("MYWord")).toBe("myw");
  });

  it("succeeds for snake_case examples", () => {
    expect(nameInitials("my_first_word")).toBe("mfw");
  });

  it("succeeds for advanced examples", () => {
    expect(nameInitials("M.Y.12word")).toBe("myw");
    expect(nameInitials("_M__y1woR!d")).toBe("mywrd");
  });
});

describe("item resolver", () => {
  it("resolves successful items", () => {
    const items = [1, 2, 3, 4, 5];
    const result = resolveItems(
      items,
      (item) => `n${item}`,
      (item) => {
        return `v${item}`;
      }
    );

    const resultKind = result.kind;
    const resolved = result.kind === "success" ? result.result : undefined;

    expect(resultKind).toBe("success");
    expect(resolved).toMatchInlineSnapshot(`
      [
        {
          "name": "n1",
          "result": "v1",
        },
        {
          "name": "n2",
          "result": "v2",
        },
        {
          "name": "n3",
          "result": "v3",
        },
        {
          "name": "n4",
          "result": "v4",
        },
        {
          "name": "n5",
          "result": "v5",
        },
      ]
    `);
  });

  it("resolves items even if they fail at first", () => {
    let resolveTryCounter = 0;
    const items = [1, 2, 3, 4, 5];
    // list of errors - if item is found here it will fail but it will be removed form this arr
    // item fails for each occurence in this arr
    const errorItems = [2, 4, 2]; // item "2" will fail 2 times
    const result = resolveItems(
      items,
      (item) => `n${item}`,
      (item) => {
        resolveTryCounter++;

        const errorIdx = errorItems.indexOf(item);
        if (errorIdx != -1 && item % 2 === 0) {
          errorItems.splice(errorIdx, 1);
          throw "No even numbers allowed";
        }
        return `v${item}`;
      }
    );

    const resultKind = result.kind;
    const resolved = result.kind === "success" ? result.result : undefined;

    expect(resolveTryCounter).toBe(8); // 1. round 5, 2. round 2, 3. round 1
    expect(resultKind).toBe("success");
    expect(resolved).toMatchInlineSnapshot(`
      [
        {
          "name": "n1",
          "result": "v1",
        },
        {
          "name": "n3",
          "result": "v3",
        },
        {
          "name": "n5",
          "result": "v5",
        },
        {
          "name": "n4",
          "result": "v4",
        },
        {
          "name": "n2",
          "result": "v2",
        },
      ]
    `);
  });

  it("fails after some items always fail", () => {
    const items = [1, 2, 3, 4, 5];
    const result = resolveItems(
      items,
      (item) => `n${item}`,
      (item) => {
        if (item % 2 === 0) throw "No even numbers allowed";
        return `v${item}`;
      }
    );

    const resultKind = result.kind;
    const errors = result.kind === "error" ? result.errors : undefined;

    expect(resultKind).toBe("error");
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "error": "No even numbers allowed",
          "name": "n2",
        },
        {
          "error": "No even numbers allowed",
          "name": "n4",
        },
      ]
    `);
  });

  it("fails after item fails couple of time", () => {
    const items = [1, 2, 3, 4, 5];
    // list of errors - if item is found here it will fail but it will be removed form this arr
    const errorItems = [2, 4, 2, 2]; // item "2" will fail 3 times and this will cause resolver error
    const result = resolveItems(
      items,
      (item) => `n${item}`,
      (item) => {
        const errorIdx = errorItems.indexOf(item);
        if (errorIdx != -1 && item % 2 === 0) {
          errorItems.splice(errorIdx, 1);
          throw "No even numbers allowed";
        }
        return `v${item}`;
      }
    );

    const resultKind = result.kind;
    const errors = result.kind === "error" ? result.errors : undefined;

    expect(resultKind).toBe("error");
    expect(errors).toMatchInlineSnapshot(`
      [
        {
          "error": "No even numbers allowed",
          "name": "n2",
        },
      ]
    `);
  });
});
