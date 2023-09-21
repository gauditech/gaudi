import _ from "lodash";
import { match } from "ts-pattern";

import {
  Action,
  Api,
  Computed,
  Endpoint,
  Entrypoint,
  Expr,
  ExtraInput,
  Field,
  Hook,
  IdentifierRef,
  Model,
  ModelActionAtom,
  OrderBy,
  Populate,
  Populator,
  Position,
  ProjectASTs,
  Query,
  QueryAtom,
  Ref,
  Reference,
  Relation,
  Select,
  TokenData,
  Unique,
  ValidateExpr,
  Validator,
} from "../ast/ast";

export function findIdentifierFromPosition(
  identifiers: SourceRef[],
  position: Position,
  filename: string
): SourceRef | undefined {
  for (const id of identifiers) {
    if (id.token.filename !== filename) continue;
    const { start, end } = id.token;
    if (start.line > position.line) return undefined;
    if (start.line === position.line && start.column > position.column) return undefined;
    if (end.line < position.line) continue;
    if (end.line === position.line && end.column < position.column) continue;
    return id;
  }
  return undefined;
}

// TODO: add refs for runtime and validators

export type SourceRef = { ref: Ref; isDefinition: boolean; token: TokenData };
type FuzzySourceRef = IdentifierRef | undefined;

export function getIdentifiers(projectASTs: ProjectASTs): SourceRef[] {
  const globals = _.concat(...projectASTs.plugins, ...projectASTs.documents.values());

  const fuzzySourceRefs = globals.flatMap((global) =>
    match(global)
      .with({ kind: "validator" }, getIdentifiersValidator)
      .with({ kind: "model" }, getIdentifiersModel)
      .with({ kind: "api" }, getIdentifiersApi)
      .with({ kind: "populator" }, getIdentifiersPopulator)
      .with({ kind: "runtime" }, () => [])
      .with({ kind: "authenticator" }, () => [])
      .with({ kind: "generator" }, () => [])
      .exhaustive()
  );
  return _.compact(
    fuzzySourceRefs.map((ref) => {
      if (!ref?.ref) return undefined;
      return { ref: ref.ref, isDefinition: ref.isDefinition, token: ref.token };
    })
  );
}

function getIdentifiersValidator({ name, atoms }: Validator): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "arg" }, ({ name }) => name)
      .with({ kind: "assert" }, ({ expr }) => getIdentifiersExpr(expr))
      .with({ kind: "assertHook" }, ({ hook }) => getIdentifiersHook(hook))
      .with({ kind: "error" }, () => [])
      .exhaustive()
  );
  return [name, ...atomIdentifiers];
}

function getIdentifiersValidateExpr(expr: ValidateExpr): FuzzySourceRef[] {
  return match(expr)
    .with({ kind: "group" }, ({ expr }) => getIdentifiersValidateExpr(expr))
    .with({ kind: "binary" }, ({ lhs, rhs }) => [
      ...getIdentifiersValidateExpr(lhs),
      ...getIdentifiersValidateExpr(rhs),
    ])
    .with({ kind: "validator" }, ({ validator, args }) => [
      validator,
      ...args.flatMap(getIdentifiersExpr),
    ])
    .exhaustive();
}

function getIdentifiersModel({ name, atoms }: Model): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "field" }, getIdentifiersField)
      .with({ kind: "reference" }, getIdentifiersReference)
      .with({ kind: "relation" }, getIdentifiersRelation)
      .with({ kind: "query" }, getIdentifiersModelQuery)
      .with({ kind: "computed" }, getIdentifiersComputed)
      .with({ kind: "hook" }, getIdentifiersHook)
      .with({ kind: "unique" }, getIdentifiersUnique)
      .exhaustive()
  );
  return [name, ...atomIdentifiers];
}

function getIdentifiersField({ name, atoms }: Field): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "validate" }, ({ expr }) => getIdentifiersValidateExpr(expr))
      .otherwise(() => [])
  );
  return [name, ...atomIdentifiers];
}

function getIdentifiersReference({ name, atoms }: Reference): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "to" }, ({ identifier }) => [identifier])
      .otherwise(() => [])
  );
  return [name, ...atomIdentifiers];
}

function getIdentifiersRelation({ name, atoms }: Relation): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "from" }, ({ identifier }) => identifier)
      .with({ kind: "through" }, ({ identifier }) => identifier)
      .otherwise(() => [])
  );
  return [name, ...atomIdentifiers];
}

function getIdentifiersModelQuery({ name, atoms }: Query): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) => getIdentifiersQueryAtom(atom));
  return [name, ...atomIdentifiers];
}

function getIdentifiersComputed({ name, expr }: Computed): FuzzySourceRef[] {
  return [name, ...getIdentifiersExpr(expr)];
}

function getIdentifiersUnique({ fields }: Unique): FuzzySourceRef[] {
  return fields;
}

function getIdentifiersApi({ atoms }: Api): FuzzySourceRef[] {
  return atoms.flatMap(getIdentifiersEntrypoint);
}

function getIdentifiersEntrypoint({ target, as, atoms }: Entrypoint): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "response" }, ({ select }) => getIdentifiersSelect(select))
      .with({ kind: "authorize" }, ({ expr }) => getIdentifiersExpr(expr))
      .with({ kind: "identify" }, ({ atoms }) =>
        atoms.flatMap(({ identifierPath }) => identifierPath)
      )
      .with({ kind: "endpoint" }, getIdentifiersEndpoint)
      .with({ kind: "entrypoint" }, getIdentifiersEntrypoint)
      .otherwise(() => [])
  );
  return [target, as?.identifier, ...atomIdentifiers];
}

function getIdentifiersEndpoint({ atoms }: Endpoint): FuzzySourceRef[] {
  return atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "extraInputs" }, ({ extraInputs }) =>
        extraInputs.flatMap(getIdentifiersExtraInput)
      )
      .with({ kind: "action" }, ({ actions }) => actions.flatMap(getIdentifiersAction))
      .with({ kind: "authorize" }, ({ expr }) => getIdentifiersExpr(expr))
      .with({ kind: "orderBy" }, ({ orderBy }) => getIdentifiersOrderBy(orderBy))
      .with({ kind: "filter" }, ({ expr }) => getIdentifiersExpr(expr))
      .otherwise(() => [])
  );
}

function getIdentifiersExtraInput({ name, atoms }: ExtraInput): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "validate" }, ({ expr }) => getIdentifiersValidateExpr(expr))
      .otherwise(() => [])
  );
  return [name, ...atomIdentifiers];
}

function getIdentifiersAction(action: Action): FuzzySourceRef[] {
  return match(action)
    .with({ kind: "create" }, { kind: "update" }, ({ target, as, atoms }) => {
      const atomIdentifiers = atoms.flatMap(getIdentifiersModelActionAtom);
      return [...(target ?? []), as?.identifier, ...atomIdentifiers];
    })
    .with({ kind: "delete" }, ({ target }) => target ?? [])
    .with({ kind: "execute" }, ({ name, atoms }) => {
      const atomIdentifiers = atoms.flatMap((atom) =>
        match(atom)
          .with({ kind: "hook" }, (hook) => getIdentifiersHook(hook))
          .with({ kind: "responds" }, () => [])
          .exhaustive()
      );
      return [name, ...atomIdentifiers];
    })
    .with({ kind: "queryAction" }, ({ name, atoms }) => {
      const atomIdentifiers = atoms.flatMap((atom) =>
        match(atom)
          .with({ kind: "update" }, ({ atoms }) => atoms.flatMap(getIdentifiersModelActionAtom))
          .with({ kind: "delete" }, () => [])
          .with({ kind: "select" }, ({ select }) => getIdentifiersSelect(select))
          .otherwise(getIdentifiersQueryAtom)
      );
      return [name, ...atomIdentifiers];
    })
    .with({ kind: "respond" }, ({ atoms }) =>
      atoms.flatMap((atom) =>
        match(atom)
          .with({ kind: "body" }, ({ body }) => getIdentifiersExpr(body))
          .otherwise(() => [])
      )
    )
    .with({ kind: "validate" }, ({ expr }) => getIdentifiersValidateExpr(expr))
    .exhaustive();
}

function getIdentifiersPopulator({ atoms }: Populator): FuzzySourceRef[] {
  return atoms.flatMap(getIdentifiersPopulate);
}

function getIdentifiersPopulate({ target, as, atoms }: Populate): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "repeat" }, ({ as }) => [as?.identifier])
      .with({ kind: "set" }, getIdentifiersModelActionAtom)
      .with({ kind: "populate" }, getIdentifiersPopulate)
      .otherwise(() => [])
  );
  return [target, as?.identifier, ...atomIdentifiers];
}

function getIdentifiersModelActionAtom(atom: ModelActionAtom): FuzzySourceRef[] {
  return match(atom)
    .with({ kind: "set" }, ({ target, set }) => [
      target,
      ...(set.kind === "hook" ? getIdentifiersHook(set) : getIdentifiersExpr(set.expr)),
    ])
    .with({ kind: "referenceThrough" }, ({ target, through }) => [target, ...through])
    .with({ kind: "input" }, ({ fields }) => fields.map(({ field }) => field))
    .with({ kind: "input-all" }, ({ except }) => except)
    .exhaustive();
}

function getIdentifiersQueryAtom(atom: QueryAtom): FuzzySourceRef[] {
  return match(atom)
    .with({ kind: "from" }, ({ identifierPath, as }) => [
      ...identifierPath,
      ...(as?.identifierPath ?? []),
    ])
    .with({ kind: "filter" }, ({ expr }) => getIdentifiersExpr(expr))
    .with({ kind: "orderBy" }, ({ orderBy }) => getIdentifiersOrderBy(orderBy))
    .otherwise(() => []);
}

function getIdentifiersOrderBy(orderBy: OrderBy): FuzzySourceRef[] {
  return orderBy.flatMap(({ expr }) => getIdentifiersExpr(expr));
}

function getIdentifiersSelect(select: Select): FuzzySourceRef[] {
  return select.flatMap(({ target, select }) => [
    target.kind === "short" ? target.name : undefined,
    ...getIdentifiersSelect(select ?? []),
  ]);
}

function getIdentifiersExpr(expr: Expr): FuzzySourceRef[] {
  return match(expr)
    .with({ kind: "function" }, ({ args }) => args.flatMap(getIdentifiersExpr))
    .with({ kind: "array" }, ({ elements }) => elements.flatMap(getIdentifiersExpr))
    .with({ kind: "path" }, ({ path }) => path)
    .with({ kind: "literal" }, () => [])
    .with({ kind: "binary" }, ({ lhs, rhs }) => [
      ...getIdentifiersExpr(lhs),
      ...getIdentifiersExpr(rhs),
    ])
    .with({ kind: "group" }, ({ expr }) => getIdentifiersExpr(expr))
    .with({ kind: "unary" }, ({ expr }) => getIdentifiersExpr(expr))
    .exhaustive();
}

function getIdentifiersHook({
  name,
  atoms,
}: Hook<"model" | "validator" | "action">): FuzzySourceRef[] {
  const atomIdentifiers = atoms.flatMap((atom) =>
    match(atom)
      .with({ kind: "arg_expr" }, ({ expr }) => getIdentifiersExpr(expr))
      .with({ kind: "arg_query" }, ({ query }) =>
        query.atoms.flatMap((atom) =>
          match(atom)
            .with({ kind: "select" }, ({ select }) => getIdentifiersSelect(select))
            .otherwise((atom) => getIdentifiersQueryAtom(atom))
        )
      )
      .otherwise(() => [])
  );
  return [name, ...atomIdentifiers];
}
