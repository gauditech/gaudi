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
  NoRuntimeDefinedForHook,
  DuplicateModelAtom,
  DuplicateActionAtom,
  DuplicatePopulateSet,
  DuplicateHookArg,
  QueryFromAliasWrongLength,
  QueryMaxOneAggregate,
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
