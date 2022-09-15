import { renderDbSchema, renderIndex, renderServer } from "@src/builder/builder";

import definition from "@examples/git/definition.json";

describe("builder", () => {
  describe("builder", () => {
    describe("build index", () => {
      it("renders index template correctly", async () => {
        expect(await renderIndex()).toEqual(INDEX_OUTPUT);
      });
    });

    const INDEX_OUTPUT = `
require('./server.js')
`;
  });

  describe("build server", () => {
    it("renders server template correctly", async () => {
      const serverData = { serverPort: 3000 };

      expect(await renderServer(serverData)).toEqual(SERVER_OUTPUT);
    });

    const SERVER_OUTPUT = `var express = require("express");

const app = express();
const port = 3001;

app.get("/", (req, res) => res.send("Hello world!"));

app.listen(port, () => {
  console.log(\`Example app listening on port \${port}\`);
});

`;
  });

  describe("build DB schema", () => {
    it("renders DB schema template correctly", async () => {
      expect(await renderDbSchema({ definition: definition as any })).toEqual(DB_SCHEMA_OUTPUT);
    });

    const DB_SCHEMA_OUTPUT = `
model org {
  id serial @id @unique
  name text
  slug text @unique
  description text
  optout text?
  
  repos repo[]
  
  }

model repo {
  id serial @id @unique
  name text
  slug text @unique
  description text
  org_id integer
  
  
  org org @relation(fields: [org_id], references: [id])

  }

`;
  });
});
