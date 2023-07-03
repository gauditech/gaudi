import { match } from "ts-pattern";

import { composeExpression } from "./query";

import { Definition, ValidateExprDef, ValidatorDef } from "@src/types/definition";
import * as Spec from "@src/types/specification";

export function composeValidators(def: Definition, validators: Spec.Validator[]) {
  def.validators = validators.map((vspec) => defineValidator(vspec));
}

function defineValidator(vspec: Spec.Validator): ValidatorDef {
  const assert = match<Spec.Validator["assert"], ValidatorDef["assert"]>(vspec.assert)
    .with({ kind: "expr" }, ({ expr }) => ({ kind: "expr", expr: composeExpression(expr, []) }))
    .with({ kind: "hook" }, ({ hook }) => ({
      kind: "hook",
      hook: {
        args: hook.args.map(({ name, expr }) => ({ name, expr: composeExpression(expr, []) })),
        hook: hook.code,
      },
    }))
    .exhaustive();
  return {
    name: vspec.name,
    args: vspec.args,
    assert,
    error: vspec.error,
  };
}

export function composeValidate(vspecs: Spec.ValidateExpr): ValidateExprDef {
  if (vspecs.kind === "call") {
    return {
      kind: "call",
      validator: vspecs.validator,
      args: vspecs.args.map((arg) => composeExpression(arg, [])),
    };
  }

  return {
    kind: vspecs.kind,
    exprs: vspecs.exprs.map((expr) => composeValidate(expr)),
  };
}
