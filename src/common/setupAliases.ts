import path from "path";

import { addAliases } from "module-alias";

/**
 * NOTE: Make sure to keep aliases in sync with `tsconfig.json` and `jest.config.js`.
 */

addAliases({
  src: path.join(__dirname, ".."),
  examples: path.join(__dirname, "..", "..", "examples"),
});
