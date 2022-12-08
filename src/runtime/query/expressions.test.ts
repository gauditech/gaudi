import { queryToString } from "./stringify";

import { compile, compose, parse } from "@src/index";

describe("Expressions to queries", () => {
  it("composes a complex expression", () => {
    const bp = `
    model Source {
      relation items { from Item, through source }
      query calc {
        from items
        filter {
          multiplier * (value + 1) / length(concat(textual, "tail")) > 100
        }
      }
    }
    model Item {
      reference source { to Source }
      field value { type integer }
      field multiplier { type integer }
      field textual { type text }
    }
    `;

    const def = compose(compile(parse(bp)));
    const source = def.models.find((m) => m.name === "Source");
    const calc = source?.queries[0];
    expect(calc).toMatchSnapshot();
    expect(queryToString(def, calc!)).toMatchSnapshot();
  });
});
