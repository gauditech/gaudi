import fs from "fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hooks: any;

export async function importHooks() {
  const _hookStr = "data:text/javascript;base64," + fs.readFileSync("hook.js").toString("base64");
  hooks = await eval("import(_hookStr)");
}

export function getHook(name: string) {
  return hooks[name];
}
