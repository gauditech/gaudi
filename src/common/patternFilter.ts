/* eslint-disable @typescript-eslint/no-explicit-any */
import { match } from "ts-pattern";
import { InvertPattern } from "ts-pattern/dist/types/InvertPattern";
import { MatchedValue } from "ts-pattern/dist/types/Match";
import { NotP, Pattern } from "ts-pattern/dist/types/Pattern";

import { AnyActionBodyAST } from "@src/types/ast";

type Cast<A, B> = A extends B ? A : B;

type Narrowable = string | number | bigint | boolean;

type NonObjectNarrowed<A> = Cast<
  A,
  [] | (A extends Narrowable ? A : never) | { [K in keyof A]: A[K] }
>;

type ShallowNarrowed<A> = Cast<
  A,
  [] | (A extends Narrowable ? A : never) | { [K in keyof A]: NonObjectNarrowed<A[K]> }
>;

export function patternFilter<i, p extends Pattern<ShallowNarrowed<i>>>(
  input: i[],
  pattern: p
): MatchedValue<i, InvertPattern<p>>[] {
  return input.filter((i) =>
    match(i)
      .with(pattern as any, () => true)
      .otherwise(() => false)
  ) as any;
}

export function kindFilter<
  i extends { kind: unknown },
  k extends Pattern<ShallowNarrowed<i["kind"]>>
>(input: i[], kind: k): FilteredKind<i, k>[] {
  return input.filter((i) =>
    match(i.kind)
      .with(kind, () => true)
      .otherwise(() => false)
  ) as any;
}

export function patternFind<i, p extends Pattern<ShallowNarrowed<i>>>(
  input: i[],
  pattern: p
): MatchedValue<i, InvertPattern<p>> | undefined {
  return input.find((i) =>
    match(i)
      .with(pattern as any, () => true)
      .otherwise(() => false)
  ) as any;
}

export function kindFind<
  i extends { kind: unknown },
  k extends Pattern<ShallowNarrowed<i["kind"]>>
>(input: i[], kind: k): FilteredKind<i, k> | undefined {
  return input.find((i) =>
    match(i.kind)
      .with(kind, () => true)
      .otherwise(() => false)
  ) as any;
}

export type FilteredKind<
  i extends { kind: unknown },
  k extends Pattern<ShallowNarrowed<i["kind"]>>
> = Omit<MatchedValue<i, InvertPattern<{ kind: k }>>, OptionalKeys<i>> & OptionalValues<i>;
export type RejectedKind<
  i extends { kind: unknown },
  k extends Pattern<ShallowNarrowed<i["kind"]>>
> = Omit<MatchedValue<i, InvertPattern<NotP<i, { kind: k }>>>, OptionalKeys<i>> & OptionalValues<i>;

type Mapped<A, B> = {
  [K in keyof A & keyof B]: A[K] extends B[K] ? never : K;
};
type OptionalKeys<T> = Mapped<T, Required<T>>[keyof T];

type OptionalValues<T> = {
  [K in OptionalKeys<T>]?: T[K];
};
