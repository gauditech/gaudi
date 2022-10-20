import { buildOpenAPI } from "./openAPI";

import { compile, compose, parse } from "@src/index";

describe("openAPI", () => {
  it("build spec", () => {
    const bp = `
    model Org {
      field slug { type text, unique }
      relation repos { from Repo, through org }
    }
    model Repo {
      reference org { to Org }
      field name { type text }
    }
    entrypoint Orgs {
      target model Org
      identify with slug

      list endpoint {}
      get endpoint {}
      create endpoint {}

      entrypoint Repos {
        target relation repos
        response { id, name }

        get endpoint {}
        create endpoint {}
      }
    }
    `;

    const def = compose(compile(parse(bp)));

    const openAPI = {
      info: {
        title: "Title",
        version: "1.0.0",
      },
      openapi: "3.0.3",
      paths: {
        "/org": {
          parameters: [],
          get: {
            responses: {
              200: {
                description: "Successfull response",
                content: {
                  "application/json": {
                    schema: {
                      items: {
                        properties: {
                          id: { type: "integer" },
                          slug: { type: "string" },
                        },
                        type: "object",
                      },
                      type: "array",
                    },
                  },
                },
              },
            },
          },
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    properties: {
                      slug: { type: "string" },
                    },
                    required: ["slug"],
                    type: "object",
                  },
                },
              },
            },
            responses: {
              200: {
                description: "Successfull response",
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        id: { type: "integer" },
                        slug: { type: "string" },
                      },
                      type: "object",
                    },
                  },
                },
              },
            },
          },
        },
        "/org/{org_slug}": {
          parameters: [
            {
              in: "path",
              name: "org_slug",
              required: true,
              schema: { type: "string" },
            },
          ],
          get: {
            responses: {
              200: {
                description: "Successfull response",
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        id: { type: "integer" },
                        slug: { type: "string" },
                      },
                      type: "object",
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(buildOpenAPI(def)).toEqual(openAPI);
  });
});
