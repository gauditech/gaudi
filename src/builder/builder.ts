import fs from "fs";
import path from "path";

import { render } from "./render/renderer";

import { Definition } from "src/types/definition";

// TODO: read from config
const SERVER_PORT = 3001;
const TEMPLATE_PATH = path.join(__dirname, "templates");
const OUTPUT_PATH = path.join(process.cwd(), "./dist/output");

export function build(definition: Definition): void {
  /*

 - template renderer
 - server (express)
 	* read env/config with defaults
 	* index.js
 - includes file
 	* append any rendered file import
 - model
 	* build DB schema
 	* 
 - fieldset
 - entrypoint
 - action
*/

  prepareOutputFolder();
  buildIndex();
  buildServer();
}

// ---------- part builders

function prepareOutputFolder() {
  fs.mkdirSync(OUTPUT_PATH, { recursive: true });
}

function buildIndex() {
  render(path.join(TEMPLATE_PATH, "index.eta"), path.join(OUTPUT_PATH, "index.js"));
}

function buildServer() {
  const data = {
    serverPort: SERVER_PORT,
  };

  render(path.join(TEMPLATE_PATH, "server.eta"), path.join(OUTPUT_PATH, "server.js"), data);
}
