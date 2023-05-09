import { kindFind } from "@src/common/kindFilter";
import { ensureExists } from "@src/common/utils";
import * as AST from "@src/compiler/ast/ast";
import { HookDef } from "@src/types/definition";

export function composeHook(hook: AST.Hook<boolean, boolean>): HookDef {
  const source = kindFind(hook.atoms, "source");
  const inline = kindFind(hook.atoms, "inline");
  if (source) {
    return {
      kind: "source",
      target: source.name.text,
      file: source.file.value,
      runtimeName: source.runtime!,
    };
  } else {
    ensureExists(inline, `Hook has no code`);
    return { kind: "inline", inline: inline.code.value };
  }
}
