import "../../common/setupAliases";

import { setupEmbeddedPg } from "./embeddedPg";

async function setup() {
  await setupEmbeddedPg();
}

// current Jest TS setup doesn't work with ESM exports so we have to export it using CJS syntax
module.exports = setup;
