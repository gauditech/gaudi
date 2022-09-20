import fs from "fs";
import path from "path";

import { compile } from "../compiler/compiler";

import { parse } from "./parser";

describe("parser", () => {
  it("parses blueprints from test folder", () => {
    const extenstion = ".gaudi";
    const folder = "./src/parser/tests";
    const blueprints = fs.readdirSync(folder).filter((name) => name.endsWith(extenstion));

    blueprints.forEach((blueprintFilename) => {
      const blueprintPath = path.join(folder, blueprintFilename);
      const blueprint = fs.readFileSync(blueprintPath).toString();

      const specificationPath = blueprintPath.slice(0, -extenstion.length) + ".json";
      const specification = JSON.parse(fs.readFileSync(specificationPath).toString());

      expect(compile(parse(blueprint))).toMatchObject(specification);
    });
  });
});
