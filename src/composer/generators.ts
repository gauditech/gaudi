import { assertUnreachable } from "@src/common/utils";
import { Definition, GeneratorDef } from "@src/types/definition";
import { Generator } from "@src/types/specification";

export function composeGenerators(def: Definition, generators: Generator[]): void {
  def.generators = generators.map((g) => composeGenerator(def, g));
}

function composeGenerator(def: Definition, generator: Generator): GeneratorDef {
  const kind = generator.kind;
  switch (kind) {
    case "generator-client": {
      // target
      const target = generator.target;
      if (target !== "js") {
        throw new Error(`Unsupported client generator target "${target}"`);
      }

      // api
      const api = generator.api;
      if (api !== "entrypoint" && api !== "model") {
        throw new Error(`Unsupported client generator api "${api}"`);
      }

      // output
      const output = generator.output;

      return {
        kind: "generator-client",
        target,
        api,
        output,
      };
    }
    default:
      assertUnreachable(kind);
  }
}
