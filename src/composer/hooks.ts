import { getExecutionRuntime } from "@src/common/refs";
import { assertUnreachable, ensureExists } from "@src/common/utils";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { Definition, HookDef } from "@src/types/definition";
import { HookSpec } from "@src/types/specification";

export function composeHook(def: Definition, hookSpec: HookSpec): HookDef {
  // default runtime must exist
  const defaultRuntimeName = getDefaultExecutionRuntimeName(def);
  ensureExists(defaultRuntimeName, `Default execution runtime cannot be empty`);

  // runtime name, if not given, default to the first runtime
  const runtime = getExecutionRuntime(def, hookSpec.runtimeName ?? defaultRuntimeName);

  const kind = hookSpec.code.kind;
  if (kind === "source") {
    return { runtime, code: { ...hookSpec.code } };
  } else if (kind === "inline") {
    return { runtime, code: { ...hookSpec.code } };
  } else {
    assertUnreachable(kind);
  }
}

function getDefaultExecutionRuntimeName(def: Definition): string | undefined {
  // currently, runtime name defaults to the first one (if any)
  const defaultRuntimeName = def.runtimes
    // internal runtime cannot be default
    .filter((r) => r.name !== getInternalExecutionRuntimeName())
    // TODO: use "default" property once it is added
    .slice(0, 1)
    .shift()?.name;

  return defaultRuntimeName;
}
