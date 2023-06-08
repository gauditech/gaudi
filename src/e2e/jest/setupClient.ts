import "../../common/setupAliases";

import { setupTests } from "../client/setupClientTests";

import { setupEmbeddedPg } from "./embeddedPg";

async function setup() {
  return Promise.all([setupTests(), setupEmbeddedPg()]);
}

module.exports = setup;
