import path from "path";

import { addAliases } from "module-alias";

/**
 * NOTE: Make sure to keep aliases in sync with `tsconfig.json` and `jest.config.js`.
 */

addAliases({
  "@runtime": path.join(__dirname, "src"),
});
