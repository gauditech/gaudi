/* eslint-disable @typescript-eslint/no-explicit-any */
import { match } from "ts-pattern";
import { InvertPattern } from "ts-pattern/dist/types/InvertPattern";
import { MatchedValue } from "ts-pattern/dist/types/Match";
import { Pattern } from "ts-pattern/dist/types/Pattern";

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
>(input: i[], kind: k): MatchedValue<i, InvertPattern<{ kind: k }>>[] {
  return input.filter((i) =>
    match(i.kind)
      .with(kind, () => true)
      .otherwise(() => false)
  ) as any;
}

// eslint-disable-next-line @typescript-eslint/ban-types
type Narrowable2 = string | number | boolean | symbol | object | undefined | void | null | {};
export function kindFilter2<
  i extends { kind: Narrowable2 },
  k2 extends i["kind"],
  k extends Pattern<k2>
>(input: i[], kind: k): MatchedValue<i, InvertPattern<{ kind: k }>>[] {
  return input.filter((i) =>
    match(i.kind)
      .with(kind, () => true)
      .otherwise(() => false)
  ) as any;
}
