import * as fs from "fs";
import * as path from "path";

import { GaudiLexer } from "./lexer";
import { parser } from "./parser";

const folder = "./src/newparser/tests";
const blueprints = fs.readdirSync(folder);

describe("parser", () => {
  test.each(blueprints)("blueprint tests/%s", (blueprintFilename) => {
    const blueprintPath = path.join(folder, blueprintFilename);
    const blueprint = fs.readFileSync(blueprintPath).toString();

    const lexResult = GaudiLexer.tokenize(blueprint);
    parser.input = lexResult.tokens;
    const result = parser.definition();

    if (lexResult.errors.length > 0) {
      console.dir(lexResult.errors, { depth: 10 });
      throw `${lexResult.errors[0].message}`;
    } else if (parser.errors.length > 0) {
      console.dir(parser.errors, { depth: 10 });
      throw `${parser.errors[0].message}`;
    }

    console.dir(result, { depth: 10 });
  });
});
