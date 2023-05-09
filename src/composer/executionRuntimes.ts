import _ from "lodash";

import { kindFilter, kindFind } from "@src/common/kindFilter";
import { ensureUnique } from "@src/common/utils";
import * as AST from "@src/compiler/ast/ast";
import { Definition, ExecutionRuntimeDef } from "@src/types/definition";

const EXECUTION_RUNTIME_GAUDI_INTERNAL = "@GAUDI_INTERNAL";

export function composeExecutionRuntimes(def: Definition, projectASTs: AST.ProjectASTs): void {
  const globalAtoms = _.concat(...Object.values(projectASTs.plugins), projectASTs.document);
  const runtimes = kindFilter(globalAtoms, "runtime");

  def.runtimes = runtimes.map((r) => composeRuntime(r));

  // there must be one and only one default runtime
  // do this BEFORE injecting internal runtime
  processDefaultRuntime(def);

  // inject gaudi internal runtime
  def.runtimes.push(composeInternalExecutionRuntime());

  // check for duplicate names
  ensureUnique(
    def.runtimes.map((r) => r.name.toLowerCase()),
    "Execution runtime names must be unique"
  );
}

export function getInternalExecutionRuntimeName(): string {
  return EXECUTION_RUNTIME_GAUDI_INTERNAL;
}

function composeInternalExecutionRuntime(): ExecutionRuntimeDef {
  return {
    name: getInternalExecutionRuntimeName(),
    type: "node",
    default: false,
    sourcePath: "./internalExecutionRuntime",
  };
}

function composeRuntime(runtime: AST.Runtime): ExecutionRuntimeDef {
  const name = runtime.name.text;
  const sourcePath = kindFind(runtime.atoms, "sourcePath")!.path.value;

  return {
    name,
    // only "node" type is currently available
    type: "node",
    default: !!kindFind(runtime.atoms, "default"),
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
