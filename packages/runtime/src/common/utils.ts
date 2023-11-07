import flat from "flat";
import _ from "lodash";

/** Calculate query limit/offset from page/pageSize. */
export function pagingToQueryLimit(
  page: number | undefined,
  pageSize: number | undefined,
  defaultOffset: number | undefined,
  defaultLimit: number | undefined
): { limit: number | undefined; offset: number | undefined } {
  let limit = defaultLimit;
  if (pageSize != null) {
    // make sure it's >= 0, if it's negative, default to 0
    limit = Math.max(pageSize, 0);
  }

  let offset = defaultOffset;
  if (page != null && limit != null) {
    // "page" is 1-based, offset is 0-based
    // make sure it's >= 0
    offset = Math.max(page - 1, 0) * limit;
  }

  return { limit, offset };
}

/** Collect deeply-nested structures into a flat array. */
export function collect(values: any, path: string[]): unknown[] {
  if (_.isEmpty(path)) {
    return values;
  }
  const [name, ...rest] = path;
  if (_.isArray(values)) {
    return _.compact(values.flatMap((v) => collect(_.get(v, name), rest)));
  } else {
    return collect(_.get(values, name), rest);
  }
}

/**
 * Flattens a nested object/record.
 * Keys are created recursively, using __ as delimiter.
 * */
export function flatten(record: Record<string, any>): Record<string, unknown> {
  return flat.flatten(_.omit(record, "_server"), { delimiter: "__" });
}
