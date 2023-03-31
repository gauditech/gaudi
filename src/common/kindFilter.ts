type Kind = string | number | symbol | boolean | undefined | null;

export type FilteredByKind<T extends { kind: Kind }, kind = T["kind"]> = kind extends T["kind"]
  ? Exclude<{ [K in keyof T]: K extends "kind" ? kind : T[K] }, { kind: never }>
  : never;

export type RejectedByKind<T extends { kind: Kind }, kind = T["kind"]> = Exclude<
  FilteredByKind<T>,
  { kind: kind }
>;

export function kindFilter<i extends { kind: Kind }, const k extends i["kind"]>(
  input: i[],
  ...kinds: k[]
): FilteredByKind<i, k>[] {
  return input.filter((i) => {
    for (const kind of kinds) {
      if (kind === i.kind) return true;
    }
    return false;
  }) as FilteredByKind<i, k>[];
}

export function kindReject<i extends { kind: Kind }, const k extends i["kind"]>(
  input: i[],
  ...kinds: k[]
): RejectedByKind<i, k>[] {
  return input.filter((i) => {
    for (const kind of kinds) {
      if (kind !== i.kind) return true;
    }
    return false;
  }) as RejectedByKind<i, k>[];
}

export function kindFind<i extends { kind: Kind }, const k extends i["kind"]>(
  input: i[],
  ...kinds: k[]
): FilteredByKind<i, k> | undefined {
  return input.find((i) => {
    for (const kind of kinds) {
      if (kind === i.kind) return true;
    }
    return false;
  }) as FilteredByKind<i, k> | undefined;
}
