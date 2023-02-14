import { assertUnreachable, ensureExists } from "@src/common/utils";
import { Definition, HookCodeDef } from "@src/types/definition";
import { HookCodeSpec } from "@src/types/specification";

export function composeHookCode(def: Definition, hookCode: HookCodeSpec): HookCodeDef {
  const codeSpec = hookCode;
  const kind = codeSpec.kind;
  if (kind === "source") {
    // TODO: read default runtime name from somewhere
    const runtimeName: string = codeSpec.runtimeName ?? "GAUDI_NODE";
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
