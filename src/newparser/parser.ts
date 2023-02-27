import {
  EmbeddedActionsParser,
  ILexingError,
  IRecognitionException,
  IToken,
  ParserMethod,
  TokenType,
} from "chevrotain";

import {
  Action,
  ActionAtom,
  ActionAtomDeny,
  ActionAtomInput,
  ActionAtomReferenceThrough,
  ActionAtomSet,
  ActionFieldHook,
  ActionType,
  AggregateType,
  BinaryOperator,
  BooleanLiteral,
  Computed,
  Db,
  Definition,
  Endpoint,
  EndpointAtom,
  EndpointType,
  Entrypoint,
  EntrypointAtom,
  Expr,
  ExprKind,
  Field,
  FieldAtom,
  FieldValidationHook,
  FloatLiteral,
  Hook,
  Identifier,
  IdentifierRef,
  InputAtom,
  IntegerLiteral,
  Literal,
  Model,
  ModelAtom,
  ModelHook,
  NullLiteral,
  OrderBy,
  OrderType,
  Populate,
  PopulateAtom,
  Populator,
  Query,
  QueryAtom,
  Reference,
  ReferenceAtom,
  Relation,
  RelationAtom,
  Repeater,
  RepeaterAtom,
  Select,
  StringLiteral,
  TokenData,
  Validator,
  unresolvedRef,
} from "./ast/ast";
import { unknownType } from "./ast/type";
import * as L from "./lexer";

function getTokenData(...tokens: IToken[]): TokenData {
  const positions = tokens.map((t) => ({
    start: t.startOffset,
    end: t.endOffset ?? t.startOffset,
  }));
  const start = Math.min(...positions.map(({ start }) => start));
  const end = Math.max(...positions.map(({ end }) => end));
  return { start, end };
}

class GaudiParser extends EmbeddedActionsParser {
  constructor() {
    super(L.GaudiTokens);
    this.performSelfAnalysis();
  }

  definition = this.RULE("definition", (): Definition => {
    const definition: Definition = [];

    this.MANY(() => {
      this.OR([
        { ALT: () => definition.push(this.SUBRULE(this.model)) },
        { ALT: () => definition.push(this.SUBRULE(this.entrypoint)) },
        { ALT: () => definition.push(this.SUBRULE(this.populator)) },
      ]);
    });

    return definition;
  });

  model = this.RULE("model", (): Model => {
    const atoms: ModelAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Model));
    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => atoms.push(this.SUBRULE(this.field)) },
        { ALT: () => atoms.push(this.SUBRULE(this.reference)) },
        { ALT: () => atoms.push(this.SUBRULE(this.relation)) },
        { ALT: () => atoms.push(this.SUBRULE(this.query)) },
        { ALT: () => atoms.push(this.SUBRULE(this.computed)) },
        {
          ALT: () => {
            const modelHook = this.SUBRULE(this.modelHook);
            this.ACTION(() => {
              modelHook.ref = unresolvedRef;
              modelHook.type = unknownType;
            });
            atoms.push(modelHook);
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "model", name, atoms, keyword };
  });

  field = this.RULE("field", (): Field => {
    const atoms: FieldAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Field));
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Type));
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "type", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Default));
              const literal = this.SUBRULE(this.literal);
              atoms.push({ kind: "default", literal, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Unique));
              atoms.push({ kind: "unique", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Nullable));
              atoms.push({ kind: "nullable", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Validate));
              atoms.push({
                kind: "validate",
                validators: this.SUBRULE(this.fieldValidators),
                keyword,
              });
            },
          },
        ]),
    });
    this.CONSUME(L.RCurly);

    return { kind: "field", name, ref: unresolvedRef, type: unknownType, atoms, keyword };
  });

  fieldValidators = this.RULE("fieldValidators", (): Validator[] => {
    const validators: Validator[] = [];

    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => validators.push(this.SUBRULE(this.fieldValidationHook)),
          },
          {
            ALT: () => {
              const identifier = this.SUBRULE(this.identifier);
              const args: Literal[] = [];
              this.MANY(() => args.push(this.SUBRULE(this.literal)));
              validators.push({ kind: "builtin", name: identifier, args });
            },
          },
        ]),
    });
    this.CONSUME(L.RCurly);

    return validators;
  });

  reference = this.RULE("reference", (): Reference => {
    const atoms: ReferenceAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Reference));
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.To));
              const identifier = this.SUBRULE2(this.identifierRef);
              atoms.push({ kind: "to", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Nullable));
              atoms.push({ kind: "nullable", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Unique));
              atoms.push({ kind: "unique", keyword });
            },
          },
        ]);
      },
    });
    this.CONSUME(L.RCurly);

    return { kind: "reference", name, ref: unresolvedRef, type: unknownType, atoms, keyword };
  });

  relation = this.RULE("relation", (): Relation => {
    const atoms: RelationAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Relation));
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.From));
              const identifier = this.SUBRULE2(this.identifierRef);
              atoms.push({ kind: "from", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Through));
              const identifier = this.SUBRULE3(this.identifierRef);
              atoms.push({ kind: "through", identifier, keyword });
            },
          },
        ]);
      },
    });
    this.CONSUME(L.RCurly);

    return { kind: "relation", name, ref: unresolvedRef, type: unknownType, atoms, keyword };
  });

  computed = this.RULE("computed", (): Computed => {
    const keyword = getTokenData(this.CONSUME(L.Computed));
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    const expr = this.SUBRULE(this.expr) as Expr<Db>;
    this.CONSUME(L.RCurly);

    return { kind: "computed", name, ref: unresolvedRef, type: unknownType, expr, keyword };
  });

  query = this.RULE("query", (): Query => {
    const atoms: QueryAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Query));
    const name = this.SUBRULE(this.identifier);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR1([
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.From));
              const identifierPath = this.SUBRULE1(this.identifierRefPath);
              const as = this.OPTION(() => {
                const keyword = getTokenData(this.CONSUME(L.As));
                const identifierPath = this.SUBRULE2(this.identifierRefPath);
                return { keyword, identifierPath };
              });
              atoms.push({
                kind: "from",
                identifierPath,
                as,
                keyword,
              });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Filter));
              const expr = this.SUBRULE(this.expr) as Expr<Db>;
              atoms.push({ kind: "filter", expr, keyword });
            },
          },
          {
            ALT: () => {
              const order = this.CONSUME(L.Order);
              const by = this.CONSUME(L.By);
              const keyword = getTokenData(order, by);
              const orderBy = this.SUBRULE(this.orderBy);
              atoms.push({ kind: "orderBy", orderBy, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Limit));
              const value = this.SUBRULE1(this.integer);
              atoms.push({ kind: "limit", value, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Offset));
              const value = this.SUBRULE2(this.integer);
              atoms.push({ kind: "offset", value, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Select));
              const select = this.SUBRULE(this.select);
              atoms.push({ kind: "select", select, keyword });
            },
          },
          {
            ALT: () => {
              const aggregateToken = this.OR2([
                { ALT: () => this.CONSUME(L.Count) },
                { ALT: () => this.CONSUME(L.Sum) },
              ]);
              const keyword = getTokenData(aggregateToken);
              const aggregate = aggregateToken.image as AggregateType;
              atoms.push({ kind: "aggregate", aggregate, keyword });
            },
          },
        ]);
      },
    });

    return { kind: "query", name, ref: unresolvedRef, type: unknownType, atoms, keyword };
  });

  orderBy = this.RULE("orderBy", (): OrderBy => {
    const orderBy: OrderBy = [];

    this.CONSUME(L.RCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        const identifierPath = this.SUBRULE(this.identifierRefPath);
        const orderToken = this.OPTION(() =>
          this.OR([{ ALT: () => this.CONSUME(L.Asc) }, { ALT: () => this.CONSUME(L.Desc) }])
        );
        if (orderToken) {
          const order = orderToken.image as OrderType;
          const keyword = getTokenData(orderToken);
          orderBy.push({ identifierPath, order, keyword });
        } else {
          orderBy.push({ identifierPath });
        }
      },
    });
    this.CONSUME(L.LCurly);

    return orderBy;
  });

  entrypoint = this.RULE("entrypoint", (): Entrypoint => {
    const atoms: EntrypointAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Entrypoint));
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Target));
            const identifier = this.SUBRULE1(this.identifierRef);
            const as = this.OPTION(() => {
              const keyword = getTokenData(this.CONSUME(L.As));
              const identifier = this.SUBRULE2(this.identifierRef);
              return { keyword, identifier };
            });
            atoms.push({ kind: "target", identifier, as, keyword });
          },
        },
        {
          ALT: () => {
            const identify = this.CONSUME(L.Identify);
            const with_ = this.CONSUME(L.With);
            const keyword = getTokenData(identify, with_);
            const identifier = this.SUBRULE3(this.identifierRef);
            atoms.push({ kind: "identifyWith", identifier, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Response));
            const select = this.SUBRULE(this.select);
            atoms.push({ kind: "response", select, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Authorize));
            const expr = this.SUBRULE(this.expr);
            atoms.push({ kind: "authorize", expr, keyword });
          },
        },
        {
          ALT: () => {
            atoms.push(this.SUBRULE(this.endpoint));
          },
        },
        {
          ALT: () => {
            atoms.push(this.SUBRULE(this.entrypoint));
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "entrypoint", name, atoms, keyword };
  });

  endpoint = this.RULE("endpoint", (): Endpoint => {
    const atoms: EndpointAtom[] = [];
    const typeToken = this.OR1([
      { ALT: () => this.CONSUME(L.List) },
      { ALT: () => this.CONSUME(L.Get) },
      { ALT: () => this.CONSUME(L.Create) },
      { ALT: () => this.CONSUME(L.Update) },
      { ALT: () => this.CONSUME(L.Delete) },
    ]);
    const keywordType = getTokenData(typeToken);
    const type = typeToken.image as EndpointType;
    const keyword = getTokenData(this.CONSUME(L.Endpoint));
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR2([
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Action));
            const actions = this.SUBRULE(this.actions);
            atoms.push({ kind: "action", actions, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Authorize));
            const expr = this.SUBRULE(this.expr);
            atoms.push({ kind: "authorize", expr, keyword });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "endpoint", type, keywordType, atoms, keyword };
  });

  actions = this.RULE("actions", (): Action[] => {
    const actions: Action[] = [];

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      actions.push(this.SUBRULE(this.action));
    });
    this.CONSUME(L.RCurly);

    return actions;
  });

  action = this.RULE("action", (): Action => {
    const atoms: ActionAtom[] = [];

    const token = this.OR1([
      { ALT: () => this.CONSUME(L.Create) },
      { ALT: () => this.CONSUME(L.Update) },
      { ALT: () => this.CONSUME(L.Delete) },
    ]);
    const keyword = getTokenData(token);
    const kind = token.image as ActionType;
    const target = this.OPTION1(() => {
      const target = this.SUBRULE(this.identifierRefPath);
      const as = this.OPTION2(() => {
        const keyword = getTokenData(this.CONSUME(L.As));
        const identifier = this.SUBRULE(this.identifierRef);
        return { keyword, identifier };
      });
      return { target, as };
    });

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR2([
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomSet)) },
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomReference)) },
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomDeny)) },
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomInput)) },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind, target: target?.target, as: target?.as, atoms, keyword };
  });

  actionAtomSet = this.RULE("actionAtomSet", (): ActionAtomSet => {
    const keyword = getTokenData(this.CONSUME(L.Set));
    const target = this.SUBRULE(this.identifierRef);
    const set = this.OR<ActionAtomSet["set"]>([
      { ALT: () => this.SUBRULE(this.actionFieldHook) },
      { ALT: () => ({ kind: "expr", expr: this.SUBRULE(this.expr) }) },
    ]);

    return { kind: "set", target, set, keyword };
  });

  actionAtomReference = this.RULE("actionAtomReference", (): ActionAtomReferenceThrough => {
    const keyword = getTokenData(this.CONSUME(L.Reference));
    const target = this.SUBRULE1(this.identifierRef);
    this.CONSUME(L.Through);
    const through = this.SUBRULE2(this.identifierRef);

    return {
      kind: "referenceThrough",
      target,
      through,
      keyword,
    };
  });

  actionAtomDeny = this.RULE("actionAtomDeny", (): ActionAtomDeny => {
    const keyword = getTokenData(this.CONSUME(L.Deny));
    const fields = this.OR<ActionAtomDeny["fields"]>([
      {
        ALT: () => {
          const keyword = getTokenData(this.CONSUME(L.Mul));
          return { kind: "all", keyword };
        },
      },
      {
        ALT: () => {
          const fields: IdentifierRef[] = [];

          this.CONSUME(L.LCurly);
          this.MANY_SEP({
            SEP: L.Comma,
            DEF: () => fields.push(this.SUBRULE(this.identifierRef)),
          });
          this.CONSUME(L.RCurly);

          return { kind: "list", fields };
        },
      },
    ]);

    return { kind: "deny", fields, keyword };
  });

  actionAtomInput = this.RULE("actionAtomInput", (): ActionAtomInput => {
    const fields: ActionAtomInput["fields"] = [];

    const keyword = getTokenData(this.CONSUME(L.Input));
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        const field = this.SUBRULE(this.identifierRef);
        const atoms = this.SUBRULE(this.inputAtoms);
        fields.push({ field, atoms });
      },
    });
    this.CONSUME(L.RCurly);

    return { kind: "input", fields, keyword };
  });

  inputAtoms = this.RULE("inputAtoms", (): InputAtom[] => {
    const atoms: InputAtom[] = [];

    this.OPTION(() => {
      this.CONSUME(L.Input);
      this.CONSUME(L.LCurly);
      this.MANY_SEP({
        SEP: L.Comma,
        DEF: () =>
          this.OR([
            {
              ALT: () => {
                const keyword = getTokenData(this.CONSUME(L.Optional));
                atoms.push({ kind: "optional", keyword });
              },
            },
            {
              ALT: () => {
                const keyword = getTokenData(this.CONSUME(L.Default));
                const expr = this.SUBRULE(this.expr);
                atoms.push({ kind: "default", value: expr, keyword });
              },
            },
          ]),
      });
      this.CONSUME(L.RCurly);
    });

    return atoms;
  });

  populator = this.RULE("populator", (): Populator => {
    const atoms: Populate[] = [];

    const keyword = getTokenData(this.CONSUME(L.Populator));
    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      atoms.push(this.SUBRULE(this.populate));
    });
    this.CONSUME(L.RCurly);

    return { kind: "populator", name, atoms, keyword };
  });

  populate = this.RULE("populate", (): Populate => {
    const atoms: PopulateAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Populate));
    this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Target));
            const identifier = this.SUBRULE(this.identifierRef);
            const as = this.OPTION(() => {
              const keyword = getTokenData(this.CONSUME(L.As));
              const identifier = this.SUBRULE2(this.identifierRef);
              return { keyword, identifier };
            });
            atoms.push({ kind: "target", identifier, as, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Repeat));
            const repeater = this.SUBRULE(this.repeater);
            atoms.push({ kind: "repeat", repeater, keyword });
          },
        },
        {
          ALT: () => {
            const set = this.SUBRULE(this.actionAtomSet);
            atoms.push(set);
          },
        },
        {
          ALT: () => {
            atoms.push(this.SUBRULE(this.populate));
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "populate", atoms, keyword };
  });

  repeater = this.RULE("repeater", (): Repeater => {
    return this.OR1<Repeater>([
      {
        ALT: () => {
          const value = this.SUBRULE1(this.integer);
          return { kind: "simple", value };
        },
      },
      {
        ALT: () => {
          const atoms: RepeaterAtom[] = [];
          this.MANY_SEP({
            SEP: L.Comma,
            DEF: () => {
              const token = this.OR2([
                { ALT: () => this.CONSUME(L.Start) },
                { ALT: () => this.CONSUME(L.End) },
              ]);
              const keyword = getTokenData(token);
              const kind = token.image as "start" | "end";
              const value = this.SUBRULE2(this.integer);
              atoms.push({ kind, value, keyword });
            },
          });
          return { kind: "body", atoms };
        },
      },
    ]);
  });

  modelHook: ParserMethod<[], ModelHook> = this.GENERATE_HOOK("modelHook", true, false);
  fieldValidationHook: ParserMethod<[], FieldValidationHook> = this.GENERATE_HOOK(
    "fieldValidationHook",
    false,
    true
  );
  actionFieldHook: ParserMethod<[], ActionFieldHook> = this.GENERATE_HOOK(
    "actionFieldHook",
    false,
    false
  );

  GENERATE_HOOK<h extends Hook<n, s>, n extends boolean, s extends boolean>(
    ruleName: string,
    named: n,
    simple: s
  ): ParserMethod<[], h> {
    return this.RULE(ruleName, (): h => {
      const keyword = getTokenData(this.CONSUME(L.Hook));

      const name = named ? this.SUBRULE1(this.identifier) : undefined;

      const atoms: unknown[] = [];

      this.CONSUME(L.LCurly);
      this.MANY(() => {
        this.OR([
          {
            GATE: () => simple,
            ALT: () => {
              const default_ = this.CONSUME(L.Default);
              const arg = this.CONSUME1(L.Arg);
              const keyword = getTokenData(default_, arg);
              const name = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "default_arg", name, keyword });
            },
          },
          {
            GATE: () => !simple,
            ALT: () => {
              const keyword = getTokenData(this.CONSUME2(L.Arg));
              const name = this.SUBRULE3(this.identifier);
              const expr = this.SUBRULE(this.expr);
              atoms.push({ kind: "arg_expr", name, expr, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Source));
              const name = this.SUBRULE4(this.identifier);
              const keywordFrom = getTokenData(this.CONSUME(L.From));
              const file = this.SUBRULE1(this.string);
              atoms.push({ kind: "source", name, file, keyword, keywordFrom });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Inline));
              const code = this.SUBRULE2(this.string);
              atoms.push({ kind: "inline", code, keyword });
            },
          },
        ]);
      });
      this.CONSUME(L.RCurly);

      return { kind: "hook", name, atoms, keyword } as h;
    });
  }

  select = this.RULE("select", (): Select => {
    const select: Select = [];

    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        const target = this.OR<Select[number]["target"]>([
          {
            ALT: () => {
              const name = this.SUBRULE(this.identifier);
              const identifierPath = this.SUBRULE(this.identifierRefPath);
              return { kind: "long", name, identifierPath };
            },
          },
          {
            ALT: () => {
              const name = this.SUBRULE(this.identifierRef);
              return { kind: "short", name };
            },
          },
        ]);

        const nested = this.OPTION2(() => this.SUBRULE(this.select));
        select.push({ target, select: nested });
      },
    });
    this.CONSUME(L.RCurly);

    return select;
  });

  // Ordinary operator precedance, modeled after chevrotain example:
  // https://github.com/Chevrotain/chevrotain/blob/master/examples/grammars/calculator/calculator_embedded_actions.js
  expr = this.RULE("expr", (): Expr<ExprKind> => {
    return this.SUBRULE(this.orExpr);
  });

  primaryExpr = this.RULE("primaryExpr", (): Expr<ExprKind> => {
    return this.OR<Expr<ExprKind>>([
      { ALT: () => this.SUBRULE(this.fnExpr) },
      { ALT: () => this.SUBRULE(this.groupExpr) },
      { ALT: () => this.SUBRULE(this.notExpr) },
      { ALT: () => ({ kind: "literal", type: unknownType, literal: this.SUBRULE(this.literal) }) },
      {
        ALT: () => {
          const path = this.SUBRULE(this.identifierRefPath);
          return { kind: "path", path, type: unknownType };
        },
      },
    ]);
  });

  fnExpr = this.RULE("fnExpr", (): Expr<ExprKind> => {
    const args: Expr<ExprKind>[] = [];

    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LRound);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => args.push(this.SUBRULE(this.expr)),
    });
    this.CONSUME(L.RRound);

    return { kind: "function", name, args, type: unknownType };
  });

  groupExpr = this.RULE("groupExpr", (): Expr<ExprKind> => {
    this.CONSUME(L.LRound);
    const expr = this.SUBRULE(this.expr);
    this.CONSUME(L.RRound);
    return { kind: "group", expr, type: unknownType };
  });

  notExpr = this.RULE("notExpr", (): Expr<ExprKind> => {
    const keyword = getTokenData(this.CONSUME(L.Not));
    const expr = this.SUBRULE(this.primaryExpr);
    return { kind: "unary", operator: "not", expr, keyword, type: unknownType };
  });

  mulExpr = this.GENERATE_BINARY_OPERATOR_RULE("mulExpr", [L.Mul, L.Div], this.primaryExpr);
  addExpr = this.GENERATE_BINARY_OPERATOR_RULE("addExpr", [L.Add, L.Sub], this.mulExpr);
  cmpExpr = this.GENERATE_BINARY_OPERATOR_RULE("cmpExpr", [L.Gt, L.Gte, L.Lt, L.Lte], this.addExpr);
  inExpr = this.GENERATE_BINARY_OPERATOR_RULE("inExpr", [L.In], this.cmpExpr);
  isExpr = this.GENERATE_BINARY_OPERATOR_RULE("isExpr", [L.Is], this.inExpr);
  andExpr = this.GENERATE_BINARY_OPERATOR_RULE("andExpr", [L.And], this.isExpr);
  orExpr = this.GENERATE_BINARY_OPERATOR_RULE("orExpr", [L.Or], this.andExpr);

  GENERATE_BINARY_OPERATOR_RULE(
    name: string,
    operators: TokenType[],
    next: ParserMethod<[], Expr<ExprKind>>
  ): ParserMethod<[], Expr<ExprKind>> {
    return this.RULE(name, (): Expr<ExprKind> => {
      let lhs = this.SUBRULE1(next);
      this.MANY(() => {
        const operator = this.OR(operators.map((op) => ({ ALT: () => this.CONSUME(op) })));
        const keyword = getTokenData(operator);
        const rhs = this.SUBRULE2(next);
        lhs = {
          kind: "binary",
          operator: operator.image as BinaryOperator,
          lhs,
          rhs,
          keyword,
          type: unknownType,
        };
      });
      return lhs;
    });
  }

  literal = this.RULE("literal", (): Literal => {
    return this.OR([
      { ALT: () => this.SUBRULE(this.integer) },
      { ALT: () => this.SUBRULE(this.float) },
      { ALT: () => this.SUBRULE(this.boolean) },
      { ALT: () => this.SUBRULE(this.null) },
      { ALT: () => this.SUBRULE(this.string) },
    ]);
  });

  integer = this.RULE("integer", (): IntegerLiteral => {
    const t = this.CONSUME(L.Integer);
    const value = this.ACTION(() => parseInt(t.image));
    const token = getTokenData(t);
    return { kind: "integer", value, token };
  });
  float = this.RULE("float", (): FloatLiteral => {
    const t = this.CONSUME(L.Float);
    const value = this.ACTION(() => parseFloat(t.image));
    const token = getTokenData(t);
    return { kind: "float", value, token };
  });
  boolean = this.RULE("boolean", (): BooleanLiteral => {
    const consumeBoolean = (value: boolean): BooleanLiteral => {
      const token = getTokenData(this.CONSUME(value ? L.True : L.False));
      return { kind: "boolean", value, token };
    };
    return this.OR([{ ALT: () => consumeBoolean(true) }, { ALT: () => consumeBoolean(false) }]);
  });
  null = this.RULE("null", (): NullLiteral => {
    const token = getTokenData(this.CONSUME(L.Null));
    return { kind: "null", value: null, token };
  });
  string = this.RULE("string", (): StringLiteral => {
    const t = this.CONSUME(L.String);
    const value = this.ACTION(() => JSON.parse(t.image));
    const token = getTokenData(t);
    return { kind: "string", value, token };
  });

  identifier = this.RULE("identifier", (): Identifier => {
    const token = this.CONSUME(L.Identifier);
    return { text: token.image, token: getTokenData(token) };
  });

  identifierRef = this.RULE("identifierRef", (): IdentifierRef => {
    const identifier = this.SUBRULE(this.identifier);
    return { identifier, ref: unresolvedRef, type: unknownType };
  });

  identifierRefPath = this.RULE("identifierRefPath", (): IdentifierRef[] => {
    const identifiers: IdentifierRef[] = [];

    identifiers.push(this.SUBRULE1(this.identifierRef));
    this.MANY(() => {
      this.CONSUME(L.Dot);
      identifiers.push(this.SUBRULE2(this.identifierRef));
    });

    return identifiers;
  });
}

const parser = new GaudiParser();

export type ParseResult =
  | {
      success: true;
      ast: Definition;
    }
  | {
      success: false;
      ast?: Definition;
      lexerErrors?: ILexingError[];
      parserErrors?: IRecognitionException[];
    };

export function parse(source: string): ParseResult {
  const lexerResult = L.lexer.tokenize(source);
  parser.input = lexerResult.tokens;

  let lexerErrors;
  let parserErrors;
  if (lexerResult.errors.length > 0) {
    lexerErrors = lexerResult.errors;
  } else if (parser.errors.length > 0) {
    parserErrors = parser.errors;
  }

  const ast = parser.definition();

  if (lexerErrors || parserErrors) {
    return { success: false, ast, lexerErrors, parserErrors };
  } else {
    return { success: true, ast };
  }
}
