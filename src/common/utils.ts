import fs from "fs";
import path from "path";

import _ from "lodash";

export function ensureFind<T>(
  arr: T[],
  predicate: (value: T, index: number, obj: T[]) => unknown
): T {
  const r = arr.find(predicate);
  ensureExists(r);
  return r;
}

export function ensureUnique(items: string[], message?: string): void {
  if (items.length > new Set(items).size) {
    throw new Error(message ?? `Items not unique!`);
  }
}

export function ensureExists<I>(item: I | null | undefined, message?: string): asserts item is I {
  if (item === null || item === undefined) {
    throw new Error(message ?? `Expected a value, found ${item}`);
  }
}

export function ensureEmpty<I>(item: I | null | undefined, message?: string): asserts item is I {
  if (item !== null && item !== undefined) {
    throw new Error(message ?? `Value is not empty, found ${item}`);
  }
}

export function ensureEqual<T, Tx extends T>(a: T, b: Tx, message?: string): asserts a is Tx {
  if (a === b) return;
  throw new Error(message ?? "Not equal");
}

export function ensureNot<T, Tx extends T>(
  a: T,
  b: Tx,
  message?: string
): asserts a is Exclude<T, Tx> {
  if (a === b) throw new Error(message ?? "Must not be equal!");
}

export function ensureThrow(cb: () => unknown, message?: string): void {
  try {
    cb();
  } catch (e) {
    return;
  }
  throw new Error(message ?? `Expected a callback to throw`);
}

export function safeInvoke<T>(
  cb: () => T
): { kind: "error"; error: unknown } | { kind: "success"; result: T } {
  try {
    return { kind: "success", result: cb() };
  } catch (error) {
    return { kind: "error", error };
  }
}

export type ItemResolverErrorItem = { name: string; error: any };
export type ItemResolverResolvedItem<R> = { name: string; result: R };
export type ItemResolverResult<R> =
  | { kind: "success"; result: ItemResolverResolvedItem<R>[] }
  | { kind: "error"; errors: ItemResolverErrorItem[] };

/**
 * Call resolver function for each member of array, store result or retry again if resolving fails.
 *
 * Resolver tries to resolve unresolved items repeatedly until nothing new has been resolved in an entire cycle.
 *
 * TODO: preserve original item order
 * TODO: allow some errors to break this process without trying
 */
export function resolveItems<T, R>(
  /** List of items to resolve */
  items: T[],
  /** Each item must have a name so this function returns one for each item. */
  nameFn: (item: T) => string,
  /** Function that resolves item. */
  resolverFn: (item: T) => R
): ItemResolverResult<R> {
  let errorItems: ItemResolverErrorItem[] = [];
  let resolvedItems: ItemResolverResolvedItem<R>[] = [];

  let itemCount = items.length;
  let shouldRetry = true;
  while (shouldRetry) {
    shouldRetry = false;
    for (const item of items) {
      // item name
      const itemName = nameFn(item);
      // skip already resolved items
      if (resolvedItems.some((i) => i.name === itemName)) {
        continue;
      }

      // resolve item
      const result = safeInvoke<R>(() => resolverFn(item));

      // errors
      if (result.kind === "error") {
        errorItems = _.uniqBy([...errorItems, { name: itemName, error: result.error }], "name");
        shouldRetry = true;
      }
      // success
      else {
        resolvedItems = _.uniqBy(
          [...resolvedItems, { name: itemName, result: result.result }],
          "name"
        );
      }
    }

    if (shouldRetry && resolvedItems.length === itemCount) {
      const unresolvedItems = _.differenceBy(errorItems, resolvedItems, "name");

      // we had an iteration in which nothing was resolved, and there are still unresolved setters
      return {
        kind: "error",
        errors: unresolvedItems,
      };
    }
    itemCount = resolvedItems.length;
  }

  return {
    kind: "success",
    result: resolvedItems,
  };
}

/** Concat all keys who's value is `true` using `delimiter` */
export function concatKeys(map: Record<string, boolean>, delimiter = " "): string {
  return Object.entries(map)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
    .join(delimiter);
}

/** Take an array, remove empty items, concatenate and flatten others into a single array. */
export function compactArr<T>(...parts: (T | T[] | undefined | null)[]): T[] {
  return parts.filter((part): part is T[] => part != null).flat();
}

function isLetter(char: string) {
  return (
    (char.length === 1 && char.toUpperCase() != char.toLowerCase()) || char.codePointAt(0)! > 127
  );
}

function isUppercase(char: string) {
  return char === char.toUpperCase();
}

export function nameInitials(input: string): string {
  const [_, acc] = input.split("").reduce(
    (acc, char): [boolean, string[]] => {
      if (!isLetter(char)) {
        return [true, acc[1]];
      }
      if (acc[0]) {
        acc[1].push(char);
        return [false, acc[1]];
      } else {
        if (isUppercase(char)) acc[1].push(char);
        return [false, acc[1]];
      }
    },
    [true, []] as [boolean, string[]]
  );
  return acc.join("").toLowerCase();
}

/** Function that ensures exhaustivness of conditional statements. */
export function assertUnreachable(_: never): never {
  throw new Error("Unreachable code detected");
}

/**
 * Save file to target path.
 *
 * If any of directories on the path are missing, create them.
 *
 * Check existing file's content and avoid saving if content has not changed. This avoids triggering any possible watches.
 */
export function saveOutputFile(destination: string, content: string): void {
  // create folder(s) if they don't exist
  const dir = path.dirname(destination);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let contentChanged = true;
  if (fs.existsSync(destination)) {
    const existingContent = fs.readFileSync(destination, { encoding: "utf-8" });
    contentChanged = content != existingContent;
  }

  // write file
  if (contentChanged) {
    fs.writeFileSync(destination, content, { encoding: "utf-8" });
  }
}
