import {
  EmbeddedActionsParser,
  ILexingError,
  IRecognitionException,
  IToken,
  ParserMethod,
  TokenType,
} from "chevrotain";

import * as L from "./lexer";
import {
  Action,
  ActionAtom,
  ActionAtomDeny,
  ActionAtomInput,
  ActionAtomReferenceThrough,
  ActionAtomSet,
  ActionType,
  AggregateType,
  BinaryOperator,
  BooleanLiteral,
  Computed,
  Definition,
  Endpoint,
  EndpointAtom,
  EndpointType,
  Entrypoint,
  EntrypointAtom,
  Expr,
  Field,
  FieldAtom,
  FloatLiteral,
  Hook,
  HookAtom,
  Identifier,
  IdentifierAs,
  IdentifierPath,
  IdentifierPathAs,
  InputAtom,
  IntegerLiteral,
  Literal,
  Model,
  ModelAtom,
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
  UnnamedHook,
  Validator,
} from "./parsed";

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
        { ALT: () => atoms.push(this.SUBRULE(this.hook)) },
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
              this.CONSUME(L.Validate);
              this.SUBRULE(this.fieldValidators);
            },
          },
        ]),
    });
    this.CONSUME(L.RCurly);

    return { kind: "field", name, atoms, keyword };
  });

  fieldValidators = this.RULE("fieldValidators", (): Validator[] => {
    const validators: Validator[] = [];

    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => validators.push(this.SUBRULE(this.unnamedHook)),
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
              const identifier = this.SUBRULE2(this.identifier);
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

    return { kind: "reference", name, atoms, keyword };
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
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "from", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Through));
              const identifier = this.SUBRULE3(this.identifier);
              atoms.push({ kind: "through", identifier, keyword });
            },
          },
        ]);
      },
    });
    this.CONSUME(L.RCurly);

    return { kind: "relation", name, atoms, keyword };
  });

  computed = this.RULE("computed", (): Computed => {
    const keyword = getTokenData(this.CONSUME(L.Computed));
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    const expr = this.SUBRULE(this.expr);
    this.CONSUME(L.RCurly);

    return { kind: "computed", name, expr, keyword };
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
              const identifier = this.SUBRULE(this.identifierPath);
              atoms.push({ kind: "from", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = getTokenData(this.CONSUME(L.Filter));
              const expr = this.SUBRULE(this.expr);
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

    return { kind: "query", name, atoms, keyword };
  });

  orderBy = this.RULE("orderBy", (): OrderBy => {
    const orderBy: OrderBy = [];

    this.CONSUME(L.RCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        const identifier = this.SUBRULE(this.identifier);
        const orderToken = this.OPTION(() =>
          this.OR([{ ALT: () => this.CONSUME(L.Asc) }, { ALT: () => this.CONSUME(L.Desc) }])
        );
        if (orderToken) {
          const order = orderToken.image as OrderType;
          const keyword = getTokenData(orderToken);
          orderBy.push({ identifier, order, keyword });
        } else {
          orderBy.push({ identifier });
        }
      },
    });
    this.CONSUME(L.LCurly);

    return orderBy;
  });

  entrypoint = this.RULE("entrypoint", (): Entrypoint => {
    const atoms: EntrypointAtom[] = [];

    const keyword = getTokenData(this.CONSUME(L.Entrypoint));
    this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Target));
            const identifier = this.SUBRULE(this.identifierAs);
            atoms.push({ kind: "target", identifier, keyword });
          },
        },
        {
          ALT: () => {
            const identify = this.CONSUME(L.Identify);
            const with_ = this.CONSUME(L.With);
            const keyword = getTokenData(identify, with_);
            const identifier = this.SUBRULE2(this.identifier);
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

    return { kind: "entrypoint", atoms, keyword };
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
    const target = this.OPTION(() => this.SUBRULE(this.identifierPathAs));

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

    return { kind, target, atoms, keyword };
  });

  actionAtomSet = this.RULE("actionAtomSet", (): ActionAtomSet => {
    const keyword = getTokenData(this.CONSUME(L.Set));
    const target = this.SUBRULE(this.identifier);
    const set = this.OR([
      { ALT: (): ActionAtomSet["set"] => this.SUBRULE(this.unnamedHook) },
      { ALT: (): ActionAtomSet["set"] => ({ kind: "expr", expr: this.SUBRULE(this.expr) }) },
    ]);

    return { kind: "set", target, set, keyword };
  });

  actionAtomReference = this.RULE("actionAtomReference", (): ActionAtomReferenceThrough => {
    const keyword = getTokenData(this.CONSUME(L.Reference));
    const target = this.SUBRULE1(this.identifier);
    this.CONSUME(L.Through);
    const through = this.SUBRULE2(this.identifier);

    return { kind: "referenceThrough", target, through, keyword };
  });

  actionAtomDeny = this.RULE("actionAtomDeny", (): ActionAtomDeny => {
    const keyword = getTokenData(this.CONSUME(L.Deny));
    const fields = this.OR([
      {
        ALT: (): ActionAtomDeny["fields"] => {
          const keyword = getTokenData(this.CONSUME(L.Mul));
          return { kind: "all", keyword };
        },
      },
      {
        ALT: (): ActionAtomDeny["fields"] => {
          const fields: Identifier[] = [];

          this.CONSUME(L.LCurly);
          this.MANY_SEP({
            SEP: L.Comma,
            DEF: () => fields.push(this.SUBRULE(this.identifier)),
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
        const field = this.SUBRULE(this.identifier);
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
                const keyword = getTokenData(this.CONSUME1(L.Default));
                const value = this.SUBRULE(this.literal);
                atoms.push({ kind: "default_literal", value, keyword });
              },
            },
            {
              ALT: () => {
                const keyword = getTokenData(this.CONSUME2(L.Default));
                const value = this.SUBRULE(this.identifierPath);
                atoms.push({ kind: "default_reference", value, keyword });
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
            const identifier = this.SUBRULE(this.identifierAs);
            atoms.push({ kind: "target", identifier, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.CONSUME(L.Identify));
            const identifier = this.SUBRULE2(this.identifier);
            atoms.push({ kind: "identify", identifier, keyword });
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
    return this.OR1([
      {
        ALT: (): Repeater => {
          const value = this.SUBRULE1(this.integer);
          return { kind: "simple", value };
        },
      },
      {
        ALT: (): Repeater => {
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

  unnamedHook = this.RULE("unnamedHook", (): UnnamedHook => {
    const keyword = getTokenData(this.CONSUME(L.Hook));
    const atoms = this.SUBRULE(this.hookAtoms);
    return { kind: "hook", atoms, keyword };
  });

  hook = this.RULE("hook", (): Hook => {
    const keyword = getTokenData(this.CONSUME(L.Hook));
    const name = this.SUBRULE(this.identifier);
    const atoms = this.SUBRULE(this.hookAtoms);
    return { kind: "hook", name, atoms, keyword };
  });

  hookAtoms = this.RULE("hookAtoms", (): HookAtom[] => {
    const atoms: HookAtom[] = [];

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const default_ = this.CONSUME(L.Default);
            const arg = this.CONSUME1(L.Arg);
            const keyword = getTokenData(default_, arg);
            const name = this.SUBRULE2(this.identifier);
            atoms.push({ kind: "default_arg", name, keyword });
          },
        },
        {
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

    return atoms;
  });

  select = this.RULE("select", (): Select => {
    const select: Select = [];

    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        const identifier = this.SUBRULE(this.identifier);
        const nested = this.OPTION(() => this.SUBRULE(this.select));
        select.push({ identifier, select: nested });
      },
    });
    this.CONSUME(L.RCurly);

    return select;
  });

  // Ordinary operator precedance, modeled after chevrotain example:
  // https://github.com/Chevrotain/chevrotain/blob/master/examples/grammars/calculator/calculator_embedded_actions.js
  expr = this.RULE("expr", (): Expr => {
    return this.SUBRULE(this.orExpr);
  });

  primaryExpr = this.RULE("primaryExpr", (): Expr => {
    return this.OR([
      { ALT: (): Expr => this.SUBRULE(this.fnExpr) },
      { ALT: (): Expr => this.SUBRULE(this.groupExpr) },
      { ALT: (): Expr => this.SUBRULE(this.notExpr) },
      { ALT: (): Expr => ({ kind: "literal", literal: this.SUBRULE(this.literal) }) },
      {
        ALT: (): Expr => ({
          kind: "identifierPath",
          identifierPath: this.SUBRULE(this.identifierPath),
        }),
      },
    ]);
  });

  fnExpr = this.RULE("fnExpr", (): Expr => {
    const args: Expr[] = [];

    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LRound);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => args.push(this.SUBRULE(this.expr)),
    });
    this.CONSUME(L.RRound);

    return { kind: "function", name, args };
  });

  groupExpr = this.RULE("groupExpr", (): Expr => {
    this.CONSUME(L.LRound);
    const expr = this.SUBRULE(this.expr);
    this.CONSUME(L.RRound);
    return { kind: "group", expr };
  });

  notExpr = this.RULE("notExpr", (): Expr => {
    const keyword = getTokenData(this.CONSUME(L.Not));
    const expr = this.SUBRULE(this.primaryExpr);
    return { kind: "unary", operator: "not", expr, keyword };
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
    next: ParserMethod<[], Expr>
  ): ParserMethod<[], Expr> {
    return this.RULE(name, (): Expr => {
      let lhs = this.SUBRULE1(next);
      this.MANY(() => {
        const operator = this.OR(operators.map((op) => ({ ALT: () => this.CONSUME(op) })));
        const keyword = getTokenData(operator);
        const rhs = this.SUBRULE2(next);
        lhs = { kind: "binary", operator: operator.image as BinaryOperator, lhs, rhs, keyword };
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

  identifierPath = this.RULE("identifierPath", (): IdentifierPath => {
    const identifiers: IdentifierPath = [];

    identifiers.push(this.SUBRULE1(this.identifier));
    this.MANY(() => {
      this.CONSUME(L.Dot);
      identifiers.push(this.SUBRULE2(this.identifier));
    });

    return identifiers;
  });

  identifierAs = this.RULE("identifierAs", (): IdentifierAs => {
    const identifier = this.SUBRULE1(this.identifier);

    const as = this.OPTION(() => {
      this.CONSUME(L.As);
      return this.SUBRULE2(this.identifier);
    });

    return { identifier, as };
  });

  identifierPathAs = this.RULE("identifierPathAs", (): IdentifierPathAs => {
    const identifierPath = this.SUBRULE(this.identifierPath);

    const as = this.OPTION(() => {
      this.CONSUME(L.As);
      return this.SUBRULE2(this.identifier);
    });

    return { identifierPath, as };
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
      ast: Definition;
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
