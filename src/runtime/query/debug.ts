import { QueryDef, SelectFieldItem } from "@src/types/definition";

export function debugQuery(q: QueryDef): void {
  const from = q.fromPath.join(".");
  const fields = q.select
    .filter((s): s is SelectFieldItem => s.kind === "field")
    .map((s) => {
      return debugField(s);
    });
  console.debug(`Querying ${from}: selecting ${fields.join(", ")}`);
}

function debugField(s: SelectFieldItem): string {
  const np = s.namePath.join(".");
  const rk = s.refKey;
  if (s.name === s.alias) {
    return `${np} (${rk})`;
  } else {
    return `${np} as ${s.alias} (${rk})`;
  }
}
