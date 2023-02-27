import _ from "lodash";

import { queryFromParts } from "./build";
import { nameToSelectable, queryToString } from "./stringify";

import { compile, compose, parse } from "@src/index";

describe("Aggregates to queries", () => {
  it("composes a query with simple aggregate through relation", () => {
    const bp = `
    model Org {
      field name { type text }
      relation repos { from Repo, through org }
      query repo_count { from repos, count }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
    }
    `;

    const def = compose(compile(parse(bp)));
    const q = queryFromParts(
      def,
      "orgs",
      ["Org"],
      undefined,
      ["id", "name", "repo_count"].map((name) => nameToSelectable(def, ["Org", name]))
    );
    // console.log(queryToString(def, q));
    expect(queryToString(def, q)).toMatchSnapshot();
  });
  it("composes a query with simple aggregate through query", () => {
    const bp = `
    model Org {
      field name { type text }
      relation repos { from Repo, through org }
      query all_repos { from repos }
      query all_repos_nested { from all_repos }
      query repo_count { from all_repos_nested, count }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
    }
    `;

    const def = compose(compile(parse(bp)));
    const q = queryFromParts(
      def,
      "orgs",
      ["Org"],
      undefined,
      ["id", "name", "repo_count"].map((name) => nameToSelectable(def, ["Org", name]))
    );
    expect(queryToString(def, q)).toMatchSnapshot();
  });
  it("composes a query with simple aggregate that has joins in the aggregate subquery", () => {
    const bp = `
    model Org {
      field name { type text }
      relation repos { from Repo, through org }
      query total_issues { from repos.issues, count }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
      relation issues { from Issue, through repo }
    }
    model Issue {
      reference repo { to Repo }
      field name { type text }
    }
    `;
    const def = compose(compile(parse(bp)));
    const q = queryFromParts(
      def,
      "orgs",
      ["Org"],
      undefined,
      ["id", "name", "total_issues"].map((name) => nameToSelectable(def, ["Org", name]))
    );
    expect(queryToString(def, q)).toMatchSnapshot();
  });
  it("composes a query that filters by aggregate field to produce another aggregate", () => {
    const bp = `
    model Org {
      field name { type text }
      relation repos { from Repo, through org }
      query total_issues { from repos.issues, filter { comment_count > 0 }, count }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
      relation issues { from Issue, through repo }
    }
    model Issue {
      reference repo { to Repo }
      field name { type text }
      relation comments { from Comment, through issue }
      query comment_count { from comments, count }
    }
    model Comment {
      reference issue { to Issue }
      field name { type text }
    }
    `;
    const def = compose(compile(parse(bp)));
    const q = queryFromParts(
      def,
      "orgs",
      ["Org"],
      undefined,
      ["id", "name", "total_issues"].map((name) => nameToSelectable(def, ["Org", name]))
    );
    expect(queryToString(def, q)).toMatchSnapshot();
  });
});

describe("Expressions to queries", () => {
  it("composes a complex filter expression", () => {
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
    const calc = source!.queries[0]!;
    expect(calc).toMatchSnapshot();
    expect(queryToString(def, calc)).toMatchSnapshot();
  });
  it("composes a complex local computed expression", () => {
    const bp = `
    model Source {
      relation items { from Item, through source }
    }
    model Item {
      reference source { to Source }
      field value { type integer }
      field multiplier { type integer }
      field textual { type text }
      computed worthiness {
        multiplier * (value + 1) / length(concat(textual, "tail"))
      }
    }
    `;

    const def = compose(compile(parse(bp)));
    const item = def.models.find((m) => m.name === "Item");
    const worthiness = item!.computeds[0]!;
    expect(worthiness).toMatchSnapshot();
  });
  it("composes a correct wrapped query which contains local computed prop", () => {
    const bp = `
    model Source {
      relation items { from Item, through source }
      query calc {
        from items
        filter {
          worthiness > 100
        }
      }
      computed strength { 10 }
      query total_items {
        from items
        count
      }
    }
    model Item {
      reference source { to Source }
      field value { type integer }
      field multiplier { type integer }
      field textual { type text }
      computed worthiness {
        multiplier * (value + 1) / text_tail_len + source.strength + source_items
      }
      computed text_tail_len {
        length(concat(textual, "tail"))
      }
      computed source_items {
        source.total_items
      }
    }
    `;

    const def = compose(compile(parse(bp)));
    const source = def.models.find((m) => m.name === "Source");
    const calc = source!.queries[0]!;
    calc.select = ["id", "value", "multiplier", "textual", "worthiness", "text_tail_len"].map(
      (name) => nameToSelectable(def, [...calc.fromPath, name])
    );
    expect(calc).toMatchSnapshot();
    expect(queryToString(def, calc)).toMatchSnapshot();
  });
  it("composes a query that uses aggregate field in a filter expression", () => {
    const bp = `

    model Org {
      field name { type text }
      relation repos { from Repo, through org }
      query active_repos {
        from repos
        filter { issue_count > 0 }
      }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
      relation issues { from Issue, through repo }
      query issue_count { from issues, count }
    }
    model Issue {
      reference repo { to Repo }
    }
    `;
    const def = compose(compile(parse(bp)));
    const org = def.models.find((m) => m.name === "Org");
    const q = org!.queries[0]!;
    q.select = ["id", "issue_count"].map((name) => nameToSelectable(def, [...q.fromPath, name]));
    expect(queryToString(def, q)).toMatchSnapshot();
  });
});

describe("Expression functions to queries", () => {
  it("composes a query with expression functions", () => {
    const bp = `
    model Org {
      relation repos { from Repo, through org }
      query repo_fns {
        from repos
        filter {
          // test SQL functions
          length(name) is 4
          or concat(name, name) is "foofoo"
          or lower(name) is lower("FOO")
          or upper(name) is upper("BAR")
        }
      }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
    }
    `;
    const def = compose(compile(parse(bp)));
    const q = def.models[0].queries[0];
    expect(queryToString(def, q)).toMatchSnapshot();
  });
});
