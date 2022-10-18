import fs from "fs";

import "./common/setupAliases";
// import definitionInput from "@examples/git/definition.json";
// import specificationInput from "@examples/git/specification.json";

import { setupEndpoints } from "./runtime/endpoints";

import { build, compile, compose, parse } from "./index";

const blueprintPath = "../examples/git/blueprint.gaudi";

const input = fs.readFileSync(blueprintPath).toString("utf-8");
const ast = parse(input);
const specification = compile(ast);
const definition = compose(specification);
// build(definition);

setupEndpoints(definition);
