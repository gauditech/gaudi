import _ from "lodash";

import { TokenData } from "./ast/ast";

export enum ErrorCode {
  ParserError,
  // Check form Errors
  MustContainAtom,
  DuplicateAtom,
  DuplicateModel,
  DuplicateRuntime,
  DuplicateDefaultRuntime,
  MustHaveDefaultRuntime,
  DuplicateAuthBlock,
  NoRuntimeDefinedForHook,
  DuplicateModelAtom,
  DuplicateCustomEndpointPath,
  DuplicateActionAtom,
  DuplicatePopulateSet,
  DuplicateHookArg,
  DuplicateGenerator,
  RespondsCanOnlyBeUsedInCustomEndpoint,
  QueryFromAliasWrongLength,
  QueryMaxOneAggregate,
  ConfiguringNonCustomEndpoint,
  HookMustContainSourceOrInline,
  HookOnlyOneSourceOrInline,
  DuplicateSelectField,
  // Resolver Errors
  CantResolveModel,
  CantResolveAuthModel,
  CantResolveModelAtom,
  CantResolveStructMember,
  TypeHasNoMembers,
  CantFindNameInScope,
  CantResolveModelAtomWrongKind,
  CantResolveExpressionReference,
  SelectCantNest,
  InvalidDefaultAction,
  NonDefaultModelActionRequiresAlias,
  // Type Errors
  UnexpectedType,
  UnexpectedFieldType,
  VirtualInputType,
  NameAlreadyInScope,
}

function getErrorMessage(errorCode: ErrorCode, params?: Record<string, unknown>): string {
  switch (errorCode) {
    case ErrorCode.ParserError:
      return `${params?.message}`;
    case ErrorCode.MustContainAtom:
      return `'${params?.parent}' must contain a '${params?.atom}'`;
    case ErrorCode.DuplicateAtom:
      return `Duplicate '${params?.atom}' in a '${params?.parent}'`;
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
    case ErrorCode.NoRuntimeDefinedForHook:
      return `Hook with source can't be used without a runtime`;
    case ErrorCode.DuplicateModelAtom:
      return `Duplicate model member definition`;
    case ErrorCode.DuplicateCustomEndpointPath:
      return `Custom endpoints on the same HTTP method must have unique paths in one entrypoint`;
    case ErrorCode.DuplicateActionAtom:
      return `Field used multiple times in a single action`;
    case ErrorCode.DuplicatePopulateSet:
      return `Duplicate populate set field`;
    case ErrorCode.DuplicateHookArg:
      return `Duplicate hook argument`;
    case ErrorCode.DuplicateGenerator:
      return `Found duplicate generator "${params?.type}", targeting the same target "${params?.target}" and api "${params?.api}"`;
    case ErrorCode.RespondsCanOnlyBeUsedInCustomEndpoint:
      return `Actions with "responds" can only be used in custom endpoints`;
    case ErrorCode.QueryFromAliasWrongLength:
      return `Query from alias must have same length as definition`;
    case ErrorCode.QueryMaxOneAggregate:
      return `Query can't have more than one aggregate`;
    case ErrorCode.ConfiguringNonCustomEndpoint:
      return `Only custom endpoint can have method, cardinality and path configuration`;
    case ErrorCode.HookMustContainSourceOrInline:
      return `Hook must contain 'source' or 'inline' definition`;
    case ErrorCode.HookOnlyOneSourceOrInline:
      return `Hook can't have more than one 'source' or 'inline' definition`;
    case ErrorCode.DuplicateSelectField:
      return `Duplicate field in select`;
    case ErrorCode.CantResolveModel:
      return `Can't resolve model with this name`;
    case ErrorCode.CantResolveAuthModel:
      return `Can't resolve @auth model, is auth block used?`;
    case ErrorCode.CantResolveModelAtom:
      return `Can't resolve model member with this name`;
    case ErrorCode.CantResolveStructMember:
      return `Can't resolve member of primitive types`;
    case ErrorCode.TypeHasNoMembers:
      return `This type has no members`;
    case ErrorCode.CantFindNameInScope:
      return `This name does not exist in current scope`;
    case ErrorCode.CantResolveModelAtomWrongKind:
      return `Model member must be one of [${params?.expected}], but ${params?.atom} member was found`;
    case ErrorCode.CantResolveExpressionReference:
      return `Can't resolve expression reference`;
    case ErrorCode.SelectCantNest:
      return `Can't can't write nested select for this reference`;
    case ErrorCode.InvalidDefaultAction:
      return `When overriding default action it must match with current endpoint`;
    case ErrorCode.NonDefaultModelActionRequiresAlias:
      return `Non default "create" or "update" actions require alias`;
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
    case ErrorCode.NameAlreadyInScope:
      return `This name is already defined in current scope`;
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
