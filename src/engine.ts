import fs from "fs";

// import this file only with relative path because this file actually configures path aliasaes (eg @src, ...)
import "./common/setupAliases";

import { build, compile, compose, parse } from "./index";

const blueprintPath = process.env.GAUDI_IN || "";
const outputFolder = process.env.GAUDI_OUT || ".";

if (!fs.existsSync(blueprintPath)) {
  throw `Blueprint file not found: "${blueprintPath}"`;
}

const input = fs.readFileSync(blueprintPath).toString("utf-8");
const ast = parse(input);
const specification = compile(ast);
const definition = compose(specification);
build(definition, outputFolder);
