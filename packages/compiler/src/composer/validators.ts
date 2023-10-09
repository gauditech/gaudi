import { composeExpression } from "./query";

import { Definition, ValidateExprDef, ValidatorDef } from "@compiler/types/definition";
import * as Spec from "@compiler/types/specification";

export function composeValidators(def: Definition, validators: Spec.Validator[]) {
  def.validators = validators.map((vspec) => defineValidator(vspec));
}

function defineValidator(vspec: Spec.Validator): ValidatorDef {
  const assert = composeExpression(vspec.assert, []);

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
