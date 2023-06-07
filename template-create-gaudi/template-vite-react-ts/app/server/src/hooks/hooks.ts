import slugifyImpl from "@sindresorhus/slugify";

export function slugify({ value }: { value: string }) {
  return value ? slugifyImpl(value) : "";
}
