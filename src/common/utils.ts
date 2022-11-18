import fs from "fs";
import path from "path";

export function ensureFind<T>(
  arr: T[],
  predicate: (value: T, index: number, obj: T[]) => unknown
): T {
  const r = arr.find(predicate);
  ensureExists(r);
  return r;
}

export function ensureUnique(items: string[]): void {
  if (items.length > new Set(items).size) {
    throw new Error(`Items not unique!`);
  }
}

export function ensureExists<I>(item: I | null | undefined): asserts item is I {
  if (item === null || item === undefined) {
    throw new Error(`Expected a value, found ${item}`);
  }
}

export function ensureEqual<T, Tx extends T>(a: T, b: Tx, message?: string): asserts a is Tx {
  if (a === b) return;
  throw new Error(message ?? "Not equal");
}

export function ensureNot<T, Tx extends T>(a: T, b: Tx): asserts a is Exclude<T, Tx> {
  if (a === b) throw new Error("Must not be equal!");
}

/** Concat all keys who's value is `true` using `delimiter` */
export function concatKeys(map: Record<string, boolean>, delimiter = " "): string {
  return Object.entries(map)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
    .join(delimiter);
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
