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
  DuplicateActionAtom,
  DuplicatePopulateSet,
  DuplicateHookArg,
  QueryFromAliasWrongLength,
  QueryMaxOneAggregate,
  ConfiguringNonCustomEndpoint,
  HookMustContainSourceOrInline,
  HookOnlyOneSourceOrInline,
  DuplicateSelectField,
  // Resolver Errors
  CantResolveModel,
  CantResolveModelAtom,
  CantResolveExpressionReference,
  SelectCantNest,
  // Type Errors
  UnexpectedType,
  UnexpectedFieldType,
  VirtualInputType,
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
      return `When using multiple runtimes one runtime must be set default`;
    case ErrorCode.DuplicateAuthBlock:
      return `Can't have more than one auth block defined`;
    case ErrorCode.NoRuntimeDefinedForHook:
      return `Hook with source can't be used without a runtime`;
    case ErrorCode.DuplicateModelAtom:
      return `Duplicate model member definition`;
    case ErrorCode.DuplicateActionAtom:
      return `Field used twice in single action`;
    case ErrorCode.DuplicatePopulateSet:
      return `Duplicate populate set field`;
    case ErrorCode.DuplicateHookArg:
      return `Duplicate hook argument`;
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
    case ErrorCode.CantResolveModelAtom:
      return `Can't resolve model member with this name`;
    case ErrorCode.CantResolveExpressionReference:
      return `Can't resolve expression reference`;
    case ErrorCode.SelectCantNest:
      return `Can't can't write nested select for this reference`;
    case ErrorCode.UnexpectedType:
      return `Unexpected type`;
    case ErrorCode.UnexpectedFieldType:
      return `Field type must be a non null primitive type`;
    case ErrorCode.VirtualInputType:
      return `Virtual input type must be a non null primitive type`;
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
