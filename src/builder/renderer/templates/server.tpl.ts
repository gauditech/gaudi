import { source } from "common-tags";

export type BuildServerData = {
  serverPort: number;
};

export function render(data: BuildServerData): string {
  // prettier-ignore
  return source`
    const express = require("express");

    const app = express();
    const port = ${data.serverPort };

    app.get("/", (req, res) => res.send("Hello world!"));

    app.listen(port, () => {
      console.log(\`Example app listening on port \${port}\`);
    });
  `
}
