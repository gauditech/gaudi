import _ from "lodash";

import { getRef } from "@src/common/refs";
import { assertUnreachable, ensureEqual } from "@src/common/utils";
import { composeActionBlock } from "@src/composer/actions";
import { fieldsetFromActions } from "@src/composer/entrypoints";
import {
  ActionDef,
  AuthenticatorDef,
  AuthenticatorMethodDef,
  AuthenticatorNamedModelDef,
  CreateEndpointDef,
  Definition,
  FieldDef,
  FieldsetDef,
  FieldsetFieldDef,
  ModelDef,
  TargetWithSelectDef,
  UpdateEndpointDef,
} from "@src/types/definition";
import {
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
    kind: "model",
    refKey: model.name,
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

  return {
    register: createRegisterEndpoint(def, target, methodSpec),
    updatePassword: createUpdatePasswordEndpoint(def, target, methodSpec),
  };
}

function createRegisterEndpoint(
  def: Definition,
  target: TargetWithSelectDef,
  methodSpec: AuthenticatorBasicMethodSpec
) {
  const methodActionSpecs = methodSpec.eventActions
    .filter((ea) => ea.event === "register")
    .flatMap((ea) => ea.actions);

  // see auth method runtime for details on handling actions
  // skip creating default action - we hav emanual action in runtime endpoint
  const actions = composeActionBlock(def, methodActionSpecs, [target], "create", {}, false);

  // create fieldset
  const fieldset = fieldsetFromActions(def, actions);
  ensureEqual(fieldset.kind, "record" as const); // not sure what to do if main fieldset is "field"?

  // --- add fields for manual endpoint action
  const targetModel = getRef.model(def, target.name);
  targetModel.fields
    // sending ID is not allowed
    .filter((f) => f.name !== "id")
    .forEach((f) => {
      fieldset.record[f.name] = fieldsetFromField(f);
    });

  return composeCreateEndpoint(def, target, fieldset, actions);
}

function createUpdatePasswordEndpoint(
  def: Definition,
  target: TargetWithSelectDef,
  methodSpec: AuthenticatorBasicMethodSpec
) {
  const methodActionSpecs = methodSpec.eventActions
    .filter((ea) => ea.event === "update-password")
    .flatMap((ea) => ea.actions);

  // see auth method runtime for details on handling actions
  // skip creating default action - we hav emanual action in runtime endpoint
  const actions = composeActionBlock(def, methodActionSpecs, [target], "update", {}, false);

  // create fieldset
  const fieldset = fieldsetFromActions(def, actions);
  ensureEqual(fieldset.kind, "record" as const); // not sure what to do if main fieldset is "field"?

  // --- add fields for manual endpoint action
  // new password for update
  fieldset.record["password"] = fieldsetFromField(getRef.field(def, target.name, "password"));
  // current password for security
  // this field does not exist on model (aka. virtual field) which are not supported yet which is why we have to inject it manually
  fieldset.record["currentPassword"] = {
    ...fieldset.record["password"],
    // override validators since this only for checking, not writing
    validators: [],
  };

  return composeUpdateEndpoint(def, target, fieldset, actions);
}

function composeCreateEndpoint(
  def: Definition,
  target: TargetWithSelectDef,
  fieldset: FieldsetDef,
  actions: ActionDef[]
): CreateEndpointDef {
  return {
    kind: "create",
    parentContext: [],
    target: _.omit(target, "identifyWith"),
    actions,
    fieldset,
    response: [],
    authorize: undefined,
    authSelect: [],
  };
}

function composeUpdateEndpoint(
  def: Definition,
  target: TargetWithSelectDef,
  fieldset: FieldsetDef,
  actions: ActionDef[]
): UpdateEndpointDef {
  const model = getRef.model(def, target.refKey);
  const usernameField = getRef.field(def, model.name, "username");

  return {
    kind: "update",
    parentContext: [],
    target,
    actions,
    fieldset,
    response: [],
    authorize: undefined,
    authSelect: [
      // force "username" to be fetched in @auth dependency
      {
        refKey: usernameField.refKey,
        kind: "field",
        alias: usernameField.name,
        name: usernameField.name,
        namePath: [model.name, usernameField.name],
      },
    ],
  };
}

function fieldsetFromField(field: FieldDef): FieldsetFieldDef {
  return {
    kind: "field",
    type: field.type,
    nullable: field.nullable,
    required: true,
    validators: field.validators,
  };
}
