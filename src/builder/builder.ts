import fs from "fs";
import path from "path";

import { render } from "./render/renderer";

import { Definition } from "@src/types/definition";

// TODO: read from config
const SERVER_PORT = 3001;
const TEMPLATE_PATH = path.join(__dirname, "templates");
const OUTPUT_PATH = path.join(process.cwd(), "./dist/output");

export function build(definition: Definition): void {
  /* TODO

 - server (express)
 	* read env/config with defaults
 - model
 	* many-to-many relations
 - fieldset
 - entrypoint
 - action
*/

  prepareOutputFolder();
  buildIndex();
  buildDbSchema(definition);
  buildServer();
}

// ---------- part builders

function prepareOutputFolder() {
  // clear output folder
  if (!fs.existsSync(OUTPUT_PATH)) {
    fs.rmSync(OUTPUT_PATH, { recursive: true, force: true });
  }

  // (re)create output folder
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

function buildIndex() {
  render(path.join(TEMPLATE_PATH, "index.eta"), path.join(OUTPUT_PATH, "index.js"));
}

function buildDbSchema(definition: Definition) {
  render(
    path.join(TEMPLATE_PATH, "db/schema.prisma.eta"),
    path.join(OUTPUT_PATH, "db/schema.prisma"),
    {
      definition,
    }
  );
}

function buildServer() {
  const data = {
    serverPort: SERVER_PORT,
  };

  render(path.join(TEMPLATE_PATH, "server.eta"), path.join(OUTPUT_PATH, "server.js"), data);
}
