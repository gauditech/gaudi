import { Definition, ExecutionRuntimeDef } from "@src/types/definition";
import { ExecutionRuntime } from "@src/types/specification";

const EXECUTION_RUNTIME_GAUDI_INTERNAL = "@GAUDI_INTERNAL";

export function composeExecutionRuntimes(def: Definition, runtimes: ExecutionRuntime[]): void {
  def.runtimes = runtimes.map((p) => composeRuntime(p));

  // inject gaudi internal runtime
  def.runtimes.push(composeInternalExecutionRuntime());
}

export function getInternalExecutionRuntimeName(): string {
  return EXECUTION_RUNTIME_GAUDI_INTERNAL;
}

function composeInternalExecutionRuntime(): ExecutionRuntimeDef {
  return composeRuntime({
    name: getInternalExecutionRuntimeName(),
    sourcePath: "./internalExecutionRuntime",
  });
}

function composeRuntime({ name, sourcePath }: ExecutionRuntime): ExecutionRuntimeDef {
  return {
    name,
    // only "node" type is currently available
    type: "node",
    sourcePath,
  };
}
