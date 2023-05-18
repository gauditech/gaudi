export type HookCode = HookInline | HookSource;
export type HookInline = { kind: "inline"; inline: string };
export type HookSource = { kind: "source"; target: string; file: string; runtimeName: string };
