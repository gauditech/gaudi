export function ensureFind<T>(arr: T[], predicate: (value: T) => boolean /* FIXME */) {
  const r = arr.find(predicate);
  ensureExists(r);
  return r;
}

export function ensureUnique(items: string[]): void {
  if (items.length > new Set(items).size) {
    throw new Error(`Items not unique!`);
  }
}

export function ensureExists<I>(item: I | null | undefined): void {
  if (item === null || item === undefined) {
    throw new Error(`Expected a value, found ${item}`);
  }
}

/** Concat all keys who's value is `true` using `delimiter` */
export function concatKeys(map: Record<string, boolean>, delimiter = " "): string {
  return Object.keys(map).reduce((accum, className) => {
    if (map[className]) {
      accum += (accum ? " " : "") + className;
    }
    return accum;
  }, "");
}
