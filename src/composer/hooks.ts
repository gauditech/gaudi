import { getExecutionRuntime } from "@src/common/refs";
import { assertUnreachable, ensureExists } from "@src/common/utils";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { Definition, HookDef } from "@src/types/definition";
import { HookSpec } from "@src/types/specification";

export function composeHook(def: Definition, hookSpec: HookSpec): HookDef {
  const specRuntimeName = hookSpec.runtimeName;

  // default runtime must exist
  const defaultRuntimeName = def.runtimes.filter((r) => r.default).shift()?.name;
  // allow empty default when targeting internal runtime
  if (defaultRuntimeName == null && specRuntimeName !== getInternalExecutionRuntimeName()) {
    ensureExists(defaultRuntimeName, `Default execution runtime is missing`);
  }

  // runtime name, if not given, default to the first runtime
  const runtimeName = specRuntimeName ?? defaultRuntimeName;
  ensureExists(runtimeName, `Execution runtime is empty`);

  // make sure it exists
  getExecutionRuntime(def, runtimeName);

  const kind = hookSpec.code.kind;
  if (kind === "source") {
    return { ...hookSpec.code, runtimeName };
  } else if (kind === "inline") {
    return { ...hookSpec.code };
  } else {
    assertUnreachable(kind);
  }
}
