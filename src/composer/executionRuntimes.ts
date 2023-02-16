import { ensureUnique } from "@src/common/utils";
import { Definition, ExecutionRuntimeDef } from "@src/types/definition";
import { ExecutionRuntimeSpec } from "@src/types/specification";

const EXECUTION_RUNTIME_GAUDI_INTERNAL = "$GAUDI_INTERNAL";

export function composeExecutionRuntimes(def: Definition, runtimes: ExecutionRuntimeSpec[]): void {
  def.runtimes = runtimes.map((p) => composeRuntime(def, p));

  // there must be one and only one default runtime
  // do this BEFORE injecting internal runtime
  processDefaultRuntime(def);

  // inject gaudi internal runtime
  def.runtimes.push(composeInternalExecutionRuntime(def));

  // check for duplicate names
  ensureUnique(
    def.runtimes.map((r) => r.name.toLowerCase()),
    "Execution runtime names must be unique"
  );
}

export function getInternalExecutionRuntimeName(): string {
  return EXECUTION_RUNTIME_GAUDI_INTERNAL;
}

function composeInternalExecutionRuntime(def: Definition): ExecutionRuntimeDef {
  return composeRuntime(def, {
    name: getInternalExecutionRuntimeName(),
    default: false,
    sourcePath: "./hook",
  });
}

function composeRuntime(def: Definition, runtime: ExecutionRuntimeSpec): ExecutionRuntimeDef {
  const name = runtime.name;
  const sourcePath = runtime.sourcePath;

  return {
    name,
    // only "node" type is currently available
    type: "node",
    default: !!runtime.default,
    sourcePath,
  };
}

/**
 * Make sure that there is one and only one default runtime.
 * Throw error otherwise.
 */
function processDefaultRuntime(def: Definition): void {
  const runtimeCount = def.runtimes.length;
  const defaultRuntimeCount = def.runtimes.filter((r) => r.default).length;

  // exactly 1 default - OK
  if (defaultRuntimeCount === 1) return;

  // exactly 0 defaults
  if (defaultRuntimeCount === 0) {
    // no runtimes at all - OK
    if (runtimeCount === 0) return;

    // if it's a single runtime - make it default by default
    if (runtimeCount === 1) {
      // update execution runtime's default prop
      def.runtimes[0].default = true;
      return;
    }
  }

  throw new Error("There can be only one default execution runtime");
}
