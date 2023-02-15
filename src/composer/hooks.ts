import { assertUnreachable, ensureExists } from "@src/common/utils";
import { getInternalExecutionRuntimeName } from "@src/composer/executionRuntimes";
import { Definition, HookCodeDef } from "@src/types/definition";
import { HookCodeSpec } from "@src/types/specification";

export function composeHookCode(def: Definition, hookCode: HookCodeSpec): HookCodeDef {
  const codeSpec = hookCode;
  const kind = codeSpec.kind;
  if (kind === "source") {
    // default runtime must exist
    const defaultRuntimeName = getDefaultExecutionRuntimeName(def);
    ensureExists(defaultRuntimeName, `Default execution runtime cannot be empty`);

    // runtime name, if not given, default to the first runtime
    const runtimeName = codeSpec.runtimeName ?? defaultRuntimeName;

    ensureExists(
      def.runtimes.find((r) => r.name === runtimeName),
      `Execution runtime "${runtimeName}" not found`
    );

    return { ...codeSpec };
  } else if (kind === "inline") {
    return { ...codeSpec };
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
