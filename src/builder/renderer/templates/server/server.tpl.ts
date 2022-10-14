import { source } from "common-tags";

export type BuildServerData = {
  serverPort: number;
};

export function render(data: BuildServerData): string {
  // prettier-ignore
  return source`
    const express = require("express");
    const { requestLogger, errorLogger, errorResponder } = require("./common.js");
    const { setupEndpoints } = require("./endpoints.js");

    const app = express();
    const port = ${data.serverPort};

    setupEndpoints(app);

    app.use(requestLogger)
    app.use(errorLogger)
    app.use(errorResponder)

    app.listen(port, () => {
      console.log(\`Example app listening on port \${port}\`);
    });

  `
}
