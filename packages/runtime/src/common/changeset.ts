import { shouldBeUnreachableCb } from "@gaudi/compiler/dist/common/utils";
import {
  ChangesetDef,
  Definition,
  FieldDef,
  TypedExprDef,
} from "@gaudi/compiler/dist/types/definition";
import _, { get, indexOf, isString, set, toInteger, toString } from "lodash";
import { match } from "ts-pattern";

import { executeArithmetics } from "./arithmetics";

import { executeHook } from "@runtime/hooks";
import { QueryExecutor } from "@runtime/query/exec";
import { RequestContext } from "@runtime/server/context";

type Changeset = Record<string, unknown>;

/**
 * Build result record from given action changeset rules and give context (source) inputs.
 */
export async function buildChangeset(
  def: Definition,
  qx: QueryExecutor,
  reqCtx: RequestContext,
  actionChangsetDefinition: ChangesetDef
): Promise<Changeset> {
  const changeset: Changeset = Object.assign({}, _.cloneDeep(reqCtx.get("@currentContext")));

  async function getSetterFromExpr(expr: TypedExprDef): Promise<unknown> {
    return match(expr)
      .with({ kind: "literal" }, ({ literal }) => formatFieldValue(literal.value, literal.kind))
      .with({ kind: "array" }, (arr) => Promise.all(arr.elements.map(_.unary(getSetterFromExpr))))
      .with({ kind: "alias-reference" }, (ref) => reqCtx.collect(ref.source, ref.path))
      .with({ kind: "function" }, (expr) => executeArithmetics(expr, _.unary(getSetterFromExpr)))
      .with({ kind: "identifier-path" }, (e) => {
        // reqCtx.collect("@currentContext", e.namePath)
        if (e.namePath[0] in changeset) {
          return _.get(changeset, e.namePath);
        } else {
          console.dir({ np: e.namePath, changeset, actionChangsetDefinition }, { depth: 10 });
          throw new Error("Changeset value doesn't exist. Bad order?");
        }
      })
      .with({ kind: "hook" }, async (hook) => {
        const chx = await buildChangeset(def, qx, reqCtx, hook.hook.args);
        return executeHook(def, hook.hook.hook, chx);
      })
      .otherwise(shouldBeUnreachableCb(`'${expr?.kind}' cannot be executed in server environment`));
  }

  for (const { name, setter, kind } of actionChangsetDefinition) {
    const finalName = kind === "reference-through" ? `${name}_id` : name;
    changeset[finalName] = await getSetterFromExpr(setter);
  }

  return changeset;
}

/**
 * Format unknown field value to one of mapping types.
 *
 * If `value` is `undefined`/`null`, it is returned as is.
 *
 * This function uses `lodash` to convert "string" and "integer".
 * For details see: https://lodash.com/docs
 *
 * Mappings:
 * - string - `string`, `_.toString()`
 * - integer - `number`, `_.toInteger()`
 * - boolean - `boolean`, see below
 *
 * Due to `lodash` lacking boolean converter, this fn does it manually following these rules:
 * - "true" - string "true", case insensitive ("true", "TRUE", "TruE", ...)
 * - true - real boolean true
 * - everything else is converted to `false`
 *
 * TODO: move to some utils directory if it's ok
 */
export function formatFieldValue(
  value: unknown,
  type: FieldDef["type"] | "null"
): string | number | boolean | undefined | null {
  if (_.isNil(value)) return value;

  if (type === "boolean") {
    if (isString(value)) {
      value = value.toLowerCase();
    }

    return indexOf(["true", true], value) != -1;
  } else if (type === "integer") {
    return toInteger(value);
  } else {
    return toString(value);
  }
}

// ----- transformations

export function getFieldsetProperty<T = unknown>(target: unknown, fieldsetAccess: string[]): T {
  return get(target, fieldsetAccessToPath(fieldsetAccess));
}
export function setFieldsetProperty(
  target: object,
  fieldsetAccess: string[],
  value: unknown
): unknown {
  set(target, fieldsetAccessToPath(fieldsetAccess), value);

  return target;
}

export function fieldsetAccessToPath(access: string[]): string {
  return access.join(".");
}
