import path from "path";

import { buildApiClients } from "../../builder/builder";
import { compile } from "../../compiler/compiler";
import { compose } from "../../composer/composer";
import { parse } from "../../parser/parser";

const CLIENT_LIB_DIST_FOLDER = path.join(__dirname, "dist");

(async () => await setupClientLib())();

/**
 * Build API client lib files that is used in these tests
 */
async function setupClientLib() {
  const bp = `
  model Org {
    field name { type text }
    relation repos { from Repo, through org }
  }

  model Repo {
    reference org { to Org }
    field name { type text }
  }

  generate client {
    target js
    api entrypoint
  }

  entrypoint Org {
    target model Org

    get endpoint {}
    create endpoint {}
    update endpoint {}
    list endpoint {}
    delete endpoint {}

    custom endpoint {
      path "customOneFetch"
      method GET
      cardinality one
    }
    custom endpoint {
        path "customOneSubmit"
        method PATCH
        cardinality one
    }
    custom endpoint {
        path "customManyFetch"
        method GET
        cardinality many
    }
    custom endpoint {
        path "customManySubmit"
        method POST
        cardinality many
    }

    // repo entrypoints
    entrypoint Repo {
      target relation repos
  
      get endpoint {}
      create endpoint {}
      update endpoint {}
      list endpoint {}
      delete endpoint {}
  
      custom endpoint {
        path "customOneFetch"
        method GET
        cardinality one
      }
      custom endpoint {
          path "customOneSubmit"
          method PATCH
          cardinality one
      }
      custom endpoint {
          path "customManyFetch"
          method GET
          cardinality many
      }
      custom endpoint {
          path "customManySubmit"
          method POST
          cardinality many
      }
    }
  
  }
`;

  const definition = compose(compile(parse(bp)));

  // build and output client lib to `./data` folder
  return buildApiClients({ definition }, CLIENT_LIB_DIST_FOLDER);
}
