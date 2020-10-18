import fs from "fs";
import Arcade from "../examples/arcade/definition";
import { setupDb } from "./dbSetup";
import { readDefinition } from "./parser";
const definition = readDefinition(Arcade.models);
// ok now we have definition, let's build something with it!
fs.writeFileSync(
  "examples/arcade/data.json",
  JSON.stringify(definition, null, 2)
);
