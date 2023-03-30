type Kind = string | number | symbol | boolean | undefined | null;

export function kindFilter<i extends { kind: Kind }, const k extends i["kind"]>(
  input: i[],
  ...kinds: k[]
): Extract<i, { kind: k }>[] {
  return input.filter((i) => {
    for (const kind of kinds) {
      if (kind === i.kind) return true;
    }
    return false;
  }) as Extract<i, { kind: k }>[];
}

export function kindFind<i extends { kind: Kind }, const k extends i["kind"]>(
  input: i[],
  ...kinds: k[]
): Extract<i, { kind: k }> | undefined {
  return input.find((i) => {
    for (const kind of kinds) {
      if (kind === i.kind) return true;
    }
    return false;
  }) as Extract<i, { kind: k }> | undefined;
}
