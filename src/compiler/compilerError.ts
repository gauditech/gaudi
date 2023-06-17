import _ from "lodash";

import { TokenData } from "./ast/ast";

export enum ErrorCode {
  ParserError,
  // Check form Errors
  MustContainAtom,
  EndpointMustContainAtom,
  CannotContainAtom,
  EndpointCannotContainAtom,
  DuplicateAtom,
  DuplicateModel,
  DuplicateRuntime,
  DuplicateDefaultRuntime,
  MustHaveDefaultRuntime,
  DuplicateAuthBlock,
  DuplicateEndpoint,
  NoRuntimeDefinedForHook,
  DuplicateModelAtom,
  DuplicateCustomEndpointPath,
  CustomEndpointPathClashesWithEnrtrypoint,
  DuplicateActionAtom,
  DuplicatePopulateSet,
  DuplicateHookArg,
  DuplicateGenerator,
  RespondsCanOnlyBeUsedInCustomEndpoint,
  QueryFromAliasWrongLength,
  LimitOrOffsetWithCardinalityModifier,
  OrderByWithOne,
  QueryMaxOneAggregate,
  ConfiguringNonCustomEndpoint,
  MoreThanOneRespondsInEndpoint,
  HookMustContainSourceOrInline,
  HookOnlyOneSourceOrInline,
  DuplicateSelectField,
  // Resolver Errors
  UnexpectedModelAtom,
  UnknownFunction,
  UnexpectedFunctionArgumentCount,
  CantResolveModel,
  CantResolveAuthModel,
  CantResolveModelAtom,
  CantResolveStructMember,
  ThroughReferenceHasIncorrectModel,
  ReferenceOnDeleteNotNullable,
  CircularModelMemberDetected,
  TypeHasNoMembers,
  CantFindNameInScope,
  CantResolveModelAtomWrongKind,
  CantResolveExpressionReference,
  SelectCantNest,
  SingleCardinalityEntrypointHasIdentify,
  UnsupportedEndpointByEntrypointCardinality,
  InvalidDefaultAction,
  NonDefaultModelActionRequiresAlias,
  NonUniquePathItem,
  UnsuportedTargetInCreateAction,
  UnsuportedTargetInUpdateAction,
  ActionBlockAlreadyHasPrimaryAction,
  ActionBlockDoesNotHavePrimaryAciton,
  PrimaryActionInWrongEntrypoint,
  PopulateIsMissingSetters,
  // Type Errors
  UnexpectedType,
  UnexpectedFieldType,
  VirtualInputType,
  ComputedType,
  NameAlreadyInScope,
  CollectionInsideArray,
}

function getErrorMessage(errorCode: ErrorCode, params?: Record<string, unknown>): string {
  switch (errorCode) {
    case ErrorCode.ParserError:
      return `${params?.message}`;
    case ErrorCode.MustContainAtom:
      return `"${params?.parent}" must contain a "${params?.atom}"`;
    case ErrorCode.EndpointMustContainAtom:
      return `Endpoint of type "${params?.type}" must contain a "${params?.atom}"`;
    case ErrorCode.CannotContainAtom:
      return `"${params?.parent}" cannot contain a "${params?.atom}"`;
    case ErrorCode.EndpointCannotContainAtom:
      return `Endpoint of type "${params?.type}" cannot contain a "${params?.atom}"`;
    case ErrorCode.DuplicateAtom:
      return `Duplicate "${params?.atom}" in a "${params?.parent}"`;
    case ErrorCode.DuplicateModel:
      return `Duplicate model definition`;
    case ErrorCode.DuplicateRuntime:
      return `Duplicate runtime definition`;
    case ErrorCode.DuplicateDefaultRuntime:
      return `Duplicate default runtime definition`;
    case ErrorCode.MustHaveDefaultRuntime:
      return `When using multiple runtimes one runtime must be set as default`;
    case ErrorCode.DuplicateAuthBlock:
      return `Can't have more than one auth block defined`;
    case ErrorCode.DuplicateEndpoint:
      return `Duplicate "${params?.type}" endpoint definition`;
    case ErrorCode.NoRuntimeDefinedForHook:
      return `Hook with source can't be used without a runtime`;
    case ErrorCode.DuplicateModelAtom:
      return `Duplicate model member definition`;
    case ErrorCode.DuplicateCustomEndpointPath:
      return `Custom endpoints on the same HTTP method must have unique paths in one entrypoint`;
    case ErrorCode.CustomEndpointPathClashesWithEnrtrypoint:
      return `Custom endpoint path clashes with entrypoint: "${params?.path}"`;
    case ErrorCode.DuplicateActionAtom:
      return `Field used multiple times in a single action`;
    case ErrorCode.DuplicatePopulateSet:
      return `Duplicate populate set field`;
    case ErrorCode.DuplicateHookArg:
      return `Duplicate hook argument`;
    case ErrorCode.DuplicateGenerator:
      return `Found duplicate generator "${params?.type}", targeting the same target "${params?.target}"`;
    case ErrorCode.RespondsCanOnlyBeUsedInCustomEndpoint:
      return `Actions with "responds" can only be used in "custom" endpoints`;
    case ErrorCode.QueryFromAliasWrongLength:
      return `Query from alias must have same length as definition`;
    case ErrorCode.LimitOrOffsetWithCardinalityModifier:
      return `Query can't have "${params?.limitOrOffset}" when using "${params?.cardinalityModifier}"`;
    case ErrorCode.OrderByWithOne:
      return `Query can't have "order by" when using "one"`;
    case ErrorCode.QueryMaxOneAggregate:
      return `Query can't have more than one aggregate`;
    case ErrorCode.ConfiguringNonCustomEndpoint:
      return `Only custom endpoint can have method, cardinality and path configuration`;
    case ErrorCode.MoreThanOneRespondsInEndpoint:
      return `At most one action in endpoint can have "responds" attribute`;
    case ErrorCode.HookMustContainSourceOrInline:
      return `Hook must contain "source" or "inline" definition`;
    case ErrorCode.HookOnlyOneSourceOrInline:
      return `Hook can't have more than one "source" or "inline" definition`;
    case ErrorCode.DuplicateSelectField:
      return `Duplicate field in select`;
    case ErrorCode.UnexpectedModelAtom:
      return (
        `Unexpected model atom:\n` +
        "expected:\n" +
        `${JSON.stringify(params?.expected)}\n` +
        "got:\n" +
        `${JSON.stringify(params?.atomKind)}`
      );
    case ErrorCode.UnknownFunction:
      return `Function with this name doesn't exist`;
    case ErrorCode.UnexpectedFunctionArgumentCount:
      return `Function "${params?.name}" expects ${params?.expected} arguments, but got ${params?.got}`;
    case ErrorCode.CantResolveModel:
      return `Can't resolve model with this name`;
    case ErrorCode.CantResolveAuthModel:
      return `Can't resolve @auth model, is auth block used?`;
    case ErrorCode.CantResolveModelAtom:
      return `Can't resolve model member with name: "${params?.name}"`;
    case ErrorCode.CantResolveStructMember:
      return `Can't resolve member of primitive types`;
    case ErrorCode.ThroughReferenceHasIncorrectModel:
      return `This reference has incorrect model`;
    case ErrorCode.ReferenceOnDeleteNotNullable:
      return `Reference cannot be set to null on delete because it's not nullable`;
    case ErrorCode.CircularModelMemberDetected:
      return `Circular model definition detected in model member definition`;
    case ErrorCode.TypeHasNoMembers:
      return `This type has no members`;
    case ErrorCode.CantFindNameInScope:
      return `Name "${params?.name}" does not exist in current scope`;
    case ErrorCode.CantResolveModelAtomWrongKind:
      return `Model member must be one of [${params?.expected}], but ${params?.atom} member was found`;
    case ErrorCode.CantResolveExpressionReference:
      return `Can't resolve expression reference`;
    case ErrorCode.SelectCantNest:
      return `Can't write nested select for this reference`;
    case ErrorCode.SingleCardinalityEntrypointHasIdentify:
      return `Single cardinality entrypoint can't have identify`;
    case ErrorCode.UnsupportedEndpointByEntrypointCardinality:
      return `"${params?.endpoint}" endpoint is not supported in ${params?.cardinality} cardinality entrypoint`;
    case ErrorCode.InvalidDefaultAction:
      return `When overriding default action, its kind must match with current endpoint kind. "${params?.action}" is not a valid default action override in "${params?.endpoint}" endpoint`;
    case ErrorCode.NonDefaultModelActionRequiresAlias:
      return `Non default "create" or "update" actions require alias`;
    case ErrorCode.NonUniquePathItem:
      return `All atoms in this path must be "unique"`;
    case ErrorCode.UnsuportedTargetInCreateAction:
      return `This target is not supported in a "create" action, "create" can have model, relation and a nullable reference as a target`;
    case ErrorCode.UnsuportedTargetInUpdateAction:
      return `This target is not supported in a "update" action`;
    case ErrorCode.ActionBlockAlreadyHasPrimaryAction:
      return `This action block has already defined primary action`;
    case ErrorCode.ActionBlockDoesNotHavePrimaryAciton:
      return `Can't find primary action in this action block`;
    case ErrorCode.PrimaryActionInWrongEntrypoint:
      return `Can't create "${params?.action}" primary action in "${params?.endpoint}" endpoint`;
    case ErrorCode.PopulateIsMissingSetters:
      return `Populate block is missing setters for members: ${JSON.stringify(params?.atoms)}`;
    case ErrorCode.UnexpectedType:
      return (
        `Unexpected type\n` +
        `expected:\n` +
        `${JSON.stringify(params?.expected)}\n` +
        `got:\n` +
        `${JSON.stringify(params?.got)}`
      );
    case ErrorCode.UnexpectedFieldType:
      return `Field type must be a non null primitive type`;
    case ErrorCode.VirtualInputType:
      return `Virtual input type must be a non null primitive type`;
    case ErrorCode.ComputedType:
      return `Computed field expression type must resolve to primitive, null or unknown. Current expression resolves to: "${params?.exprType}"`;
    case ErrorCode.NameAlreadyInScope:
      return `This name is already defined in current scope`;
    case ErrorCode.CollectionInsideArray:
      return `Array literal can't have a collection type as a argument: "${params?.type}"`;
  }
}

export class CompilerError extends Error {
  errorPosition: TokenData;
  errorCode: ErrorCode;
  params?: Record<string, unknown>;

  constructor(errorPosition: TokenData, errorCode: ErrorCode, params?: Record<string, unknown>) {
    super(getErrorMessage(errorCode, params));
    this.errorPosition = errorPosition;
    this.errorCode = errorCode;
    this.params = params;
  }
}

export function compilerErrorsToString(
  filename: string,
  source: string,
  errors: CompilerError[]
): string {
  if (errors.length === 0) return "";

  const lineIndecies = [0];

  for (let i = 0; i < source.length; i++) {
    if (source.charAt(i) === "\n") {
      lineIndecies.push(i + 1);
    }
  }

  let output = "";

  errors.forEach((error) => {
    const start = error.errorPosition.start;
    const end = error.errorPosition.end;
    const lineStart = _.findLast(lineIndecies, (i) => i < start) ?? 0;
    const lineEnd = _.find(lineIndecies, (i) => i > end) ?? source.length;

    const line = lineIndecies.indexOf(lineStart) + 1;
    const column = start - lineStart + 1;
    const length = end - start;

    output += `${filename}:${line}:${column} - ${error.message}\n`;
    output += source.substring(lineStart, lineEnd);
    output += " ".repeat(column - 1) + "~".repeat(length + 1);
    output += "\n";
  });

  return output;
}
