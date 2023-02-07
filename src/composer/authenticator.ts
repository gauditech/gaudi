import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { composeActionBlock } from "@src/composer/actions";
import { fieldsetFromActions } from "@src/composer/entrypoints";
import {
  AuthenticatorDef,
  AuthenticatorMethodDef,
  AuthenticatorNamedModelDef,
  CreateEndpointDef,
  Definition,
  ModelDef,
  TargetWithSelectDef,
} from "@src/types/definition";
import {
  ActionSpec,
  AuthenticatorBasicMethodSpec,
  AuthenticatorMethodSpec,
  AuthenticatorSpec,
} from "@src/types/specification";

/**
 * Compose only authenticator models.
 * This is needs to be composed separately together with other models.
 */
export function composeAuthenticatorModel(
  def: Definition,
  spec: AuthenticatorSpec | undefined
): void {
  if (spec == undefined) {
    return;
  }

  // hardcoded authenticator name - not exposed through blueprint cause we don't support multiple auth blocks yet
  const name = "Auth";
  const targetModel = composeTargetModel(def, spec.targetModelName);
  const accessTokenModel = composeTargetModel(def, spec.accessTokenModelName);
  const method = composeMethod(def, spec.method);

  def.authenticator = {
    name,
    targetModel,
    accessTokenModel,
    method,
  };
}

/**
 * Compose only authenticator entrypoints and actions.
 * Authenticator and all models should have already been composed by now.
 */
export function composeAuthenticatorEntrypoint(
  def: Definition,
  spec: AuthenticatorSpec | undefined
): void {
  if (def.authenticator == null || spec == null) return;

  const kind = def.authenticator.method.kind;
  if (kind === "basic") {
    def.authenticator.method.endpoints = createBasicMethodEndpoints(
      def,
      def.authenticator,
      spec.method
    );
  } else {
    assertUnreachable(kind);
  }
}

function composeTargetModel(def: Definition, modelName: string): AuthenticatorNamedModelDef {
  // get authenticator target model (injected in compiler)
  const model = getRef.model(def, modelName);

  return {
    name: modelName,
    refKey: model.refKey,
  };
}

function composeMethod(
  def: Definition,
  methodSpec: AuthenticatorMethodSpec
): AuthenticatorMethodDef {
  const kind = methodSpec.kind;
  if (kind === "basic") {
    return {
      kind,
    };
  } else {
    assertUnreachable(kind);
  }
}

function createBasicMethodEndpoints(
  def: Definition,
  authenticator: AuthenticatorDef,
  methodSpec: AuthenticatorBasicMethodSpec
) {
  const model: ModelDef = getRef.model(def, authenticator.targetModel.refKey);
  const target: TargetWithSelectDef = {
    refKey: "N/A",
    kind: "model",
    name: model.name,
    alias: "@auth",
    retType: model.name,
    namePath: [model.name],
    identifyWith: {
      refKey: `${model.name}.id`,
      name: "id",
      paramName: "id",
      type: "integer",
    },
    select: [],
  };

  // ensure custom actions are not aliased the same as target, that alias is reserved for main (default) action
  const sameAliasAction = methodSpec.eventActions.find((ea) =>
    ea.actions.find((a) => a.alias === target.alias)
  );

  // target's alias is reserved for default action
  ensureEqual(
    sameAliasAction,
    undefined,
    `Custom authenticator event action cannot have the same alias as the main target: ${target.alias}`
  );

  return {
    register: createEndpoint(
      def,
      target,
      methodSpec.eventActions.filter((ea) => ea.event === "register").flatMap((ea) => ea.actions)
    ),
  };
}

function createEndpoint(
  def: Definition,
  target: TargetWithSelectDef,
  actionSpecs: ActionSpec[]
): CreateEndpointDef {
  // default action is added by default and here (in auth entrypoint) it is used as placeholder
  // since all authenticator actions are default, they cannot yet(!) be expressed through blueprint
  // thus, runtime removes that default action, and executes it's own action before executing other 
  // custom event actions defined through blueprint
  const actions = composeActionBlock(def, actionSpecs, [target], "create");

  return {
    kind: "create",
    parentContext: [],
    target: _.omit(target, "identifyWith"),
    actions,
    fieldset: fieldsetFromActions(def, actions),
    response: [],
    authorize: undefined,
    authSelect: [],
  };
}
