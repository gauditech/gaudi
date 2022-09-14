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
