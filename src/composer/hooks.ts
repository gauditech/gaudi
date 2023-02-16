import { getExecutionRuntime } from "@src/common/refs";
import { assertUnreachable, ensureExists } from "@src/common/utils";
import { Definition, HookDef } from "@src/types/definition";
import { HookSpec } from "@src/types/specification";

export function composeHook(def: Definition, hookSpec: HookSpec): HookDef {
  // default runtime must exist
  const defaultRuntimeName = def.runtimes.filter((r) => r.default).shift()?.name;
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
