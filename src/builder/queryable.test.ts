import { compile, compose, parse } from "../index";

describe("queryable test suite", () => {
  describe("basic support", () => {
    it("root", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
    }

    view OrgView {
      from Org
    }
    `;

      const def = compose(compile(parse(bp)));
    });
    it("relation", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
    }

    view OrgRepoView {
      from Org.repos
    }
    `;

      const def = compose(compile(parse(bp)));
    });
  });
  describe("filtering", () => {
    it("basic filters", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
    }

    view OrgRepoView {
      from Org.repos
      filter is_public is true
    }
    `;

      const def = compose(compile(parse(bp)));
    });

    it("nested filters through reference", () => {
      const bp = `
    model Org {
      field is_public { type boolean }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
    }

    view RepoView {
      from Repo
      filter org.is_public is true
    }
    `;

      const def = compose(compile(parse(bp)));
    });
    it("nested filters through relation", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
    }

    view OrgView {
      from Org
      filter { true in repos.is_public }
    }
    `;

      const def = compose(compile(parse(bp)));
    });
  });
  describe("queries", () => {
    it("query", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
      query public_repos { from repos, filter { is_public is true } }
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
    }

    view OrgRepoView {
      from Org.public_repos
    }
    `;

      const def = compose(compile(parse(bp)));
    });
    it("chained queries", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
      query public_repos { from repos, filter { is_public is true } }
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
      relation issues { from Issue, through repo }
      query public_issues { from issues, filter { is_public is true } }
    }
    model Issue {
      reference repo { to Repo }
      field is_public { type boolean }
    }

    view OrgRepoIssueView {
      from Org.public_repos.public_issues
    }
    `;

      const def = compose(compile(parse(bp)));
    });

    it("deep query", () => {
      const bp = `
    model Org {
      relation repos { from Repo, through org }
      query public_repos { from repos, filter { is_public is true } }
      query public_issues { from public_repos.public_issues }
    }
    model Repo {
      reference org { to Org }
      field is_public { type boolean }
      relation issues { from Issue, through repo }
      query public_issues { from issues, filter { is_public is true } }
    }
    model Issue {
      reference repo { to Repo }
      field is_public { type boolean }
    }

    view OrgRepoIssueView {
      from Org.public_issues
    }
    `;

      const def = compose(compile(parse(bp)));
    });
  });
  describe("aggregates", () => {
    it("count on relation", () => {
      const bp = `
      model Org {
        relation repos { from Repo, through org }
        query public_repos_count {
          from repos
          filter { is_public is true }
          count
        }
      }
      model Repo {
        reference org { to Org }
      }
  
      view OrgRepoView {
        from Org.repos
      }
      `;

      const def = compose(compile(parse(bp)));
    });
    it("filtering by count", () => {
      const bp = `
      model Org {
        relation repos { from Repo, through org }
        query repos_count { from repos, count }
      }
      model Repo {
        reference org { to Org }
        field is_public { type boolean }
      }
  
      view OrgRepoView {
        from Org.repos as o.r
        filter { o.repos_count < 4 }
      }
      `;

      const def = compose(compile(parse(bp)));
    });
  });
  describe("ordering and limiting", () => {
    it("basic limit when selecting", () => {
      const bp = `
      model Org {
        relation repos { from Repo, through org }
        query five_most_recent_repos {
          from repos,
          order by id desc
          limit 5
        }
      }
      model Repo {
        reference org { to Org }
        field is_public { type boolean }
      }
  
      view ORGView {
        from Org
        select { id, five_most_recent_repos { id } }
      }
      `;

      const def = compose(compile(parse(bp)));
    });
    it("filtering by limit query", () => {
      const bp = `
        model Org {
          relation repos { from Repo, through org }
          query five_most_recent_repos {
            from repos,
            order by id desc
            limit 5
          }
        }
        model Repo {
          reference org { to Org }
          field is_public { type boolean }
        }
    
        view RecentRepoView {
          from Repo as r
          filter { r in r.org.five_most_recent_repos }
        }
        `;

      const def = compose(compile(parse(bp)));
    });
    it("limiting when ordering by aggregate", () => {
      const bp = `
        model Org {
          relation repos { from Repo, through org }
          query repos_with_most_issues {
            from repos,
            order by issue_count desc
            limit 5
          }
        }
        model Repo {
          reference org { to Org }
          field is_public { type boolean }
          relation issues { from Issue, through repo }
          query issue_count { from issues, count }
        }
        model Issue {
          reference repo { to Repo }
        }
    
        view RecentRepoView {
          from Repo as r
          filter { r in r.org.five_most_recent_repos }
        }
        `;

      const def = compose(compile(parse(bp)));
    });
    it("aggregates through limit query", () => {
      const bp = `
        model Org {
          relation repos { from Repo, through org }
          query five_most_recent_repos {
            from repos,
            order by id desc
            limit 5
          }
          query sum_of_issues_in_recent_repos {
            from five_most_recent_repos.issue_count,
            sum
          }
        }
        model Repo {
          reference org { to Org }
          field is_public { type boolean }
          relation issues { from Issue, through repo }
          query issue_count { from issues, count }
        }
        model Issue {
          reference repo { to Repo }
        }
    
        view RecentRepoView {
          from Repo as r
          filter { r in r.org.five_most_recent_repos }
        }
        `;

      const def = compose(compile(parse(bp)));
    });
  });
});
