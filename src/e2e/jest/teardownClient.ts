import { teardownEmbeddedPg } from "./embeddedPg";

async function teardown() {
  teardownEmbeddedPg();
}

// current Jest TS setup doesn't work with ESM exports so we have to export it using CJS syntax
module.exports = teardown;
