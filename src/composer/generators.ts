import { assertUnreachable } from "@src/common/utils";
import { Definition, GeneratorDef } from "@src/types/definition";
import { GeneratorSpec } from "@src/types/specification";

export function composeGenerators(def: Definition, generators: GeneratorSpec[]): void {
  def.generators = generators.map((g) => composeGenerator(def, g));

  checkDuplicateGenerators(def.generators)
}

function composeGenerator(def: Definition, generator: GeneratorSpec): GeneratorDef {
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

function checkDuplicateGenerators(generators:GeneratorDef[]): void {
  const generatorTag : string[]=[]

  generators.forEach((g)=> {
    const tag = `${g.kind}-${g.target}-${g.api}`
    if (generatorTag.includes(tag)) {
      throw new Error(`Found duplicate generator "${g.kind}", targeting the same target "${g.target}" and api "${g.api}"`)
    }

    generatorTag.push(tag)
  })
}