import { Definition, ExecutionRuntimeDef } from "@src/types/definition";
import { ExecutionRuntimeSpec } from "@src/types/specification";

export function composeExecutionRuntimes(def: Definition, runtimes: ExecutionRuntimeSpec[]): void {
  def.runtimes = runtimes.map((p) => processRuntime(def, p));
}

function processRuntime(def: Definition, runtime: ExecutionRuntimeSpec): ExecutionRuntimeDef {
  const name = runtime.name;
  const sourcePath = runtime.sourcePath;

  return {
    name,
    // only "node" is currently available
    type: "node",
    sourcePath,
  };
}
