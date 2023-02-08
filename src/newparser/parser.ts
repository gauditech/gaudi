import { EmbeddedActionsParser, IToken, ParserMethod, TokenType } from "chevrotain";

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
  Hook,
  HookAtom,
  Identifier,
  IdentifierAs,
  IdentifierPath,
  IdentifierPathAs,
  InputAtom,
  Literal,
  Model,
  ModelAtom,
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
  SourcePos,
  UnnamedHook,
  Validator,
} from "./parsed";

function getSourcePos(token: IToken): SourcePos {
  return { start: token.startOffset, end: token.endOffset ?? token.startOffset };
}

export class GaudiParser extends EmbeddedActionsParser {
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

    this.CONSUME(L.Model);
    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => atoms.push(this.SUBRULE(this.field)) },
        { ALT: () => atoms.push(this.SUBRULE(this.reference)) },
        { ALT: () => atoms.push(this.SUBRULE(this.relation)) },
        { ALT: () => atoms.push(this.SUBRULE(this.computed)) },
        { ALT: () => atoms.push(this.SUBRULE(this.hook)) },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "model", name, atoms };
  });

  field = this.RULE("field", (): Field => {
    const atoms: FieldAtom[] = [];

    this.CONSUME(L.Field);
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => {
              this.CONSUME(L.Type);
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "type", identifier });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Default);
              const literal = this.SUBRULE(this.literal);
              atoms.push({ kind: "default", literal });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Unique);
              atoms.push({ kind: "unique" });
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

    return { kind: "field", name, atoms };
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

    this.CONSUME(L.Reference);
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              this.CONSUME(L.To);
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "to", identifier });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Nullable);
              atoms.push({ kind: "nullable" });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Unique);
              atoms.push({ kind: "unique" });
            },
          },
        ]);
      },
    });
    this.CONSUME(L.RCurly);

    return { kind: "reference", name, atoms };
  });

  relation = this.RULE("relation", (): Relation => {
    const atoms: RelationAtom[] = [];

    this.CONSUME(L.Relation);
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              this.CONSUME(L.From);
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "from", identifier });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Through);
              const identifier = this.SUBRULE3(this.identifier);
              atoms.push({ kind: "through", identifier });
            },
          },
        ]);
      },
    });
    this.CONSUME(L.RCurly);

    return { kind: "relation", name, atoms };
  });

  computed = this.RULE("computed", (): Computed => {
    this.CONSUME(L.Computed);
    const name = this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    const expr = this.SUBRULE(this.expr);
    this.CONSUME(L.RCurly);

    return { kind: "computed", name, expr };
  });

  query = this.RULE("query", (): Query => {
    const atoms: QueryAtom[] = [];

    const name = this.SUBRULE(this.identifier);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR1([
          {
            ALT: () => {
              this.CONSUME(L.From);
              const identifier = this.SUBRULE(this.identifierPath);
              atoms.push({ kind: "from", identifier });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Filter);
              const expr = this.SUBRULE(this.expr);
              atoms.push({ kind: "filter", expr });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Order);
              this.CONSUME(L.By);
              const orderBy = this.SUBRULE(this.orderBy);
              atoms.push({ kind: "orderBy", orderBy });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Limit);
              const value = parseInt(this.CONSUME1(L.Integer).image);
              atoms.push({ kind: "limit", value });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Offset);
              const value = parseInt(this.CONSUME2(L.Integer).image);
              atoms.push({ kind: "offset", value });
            },
          },
          {
            ALT: () => {
              this.CONSUME(L.Select);
              const select = this.SUBRULE(this.select);
              atoms.push({ kind: "select", select });
            },
          },
          {
            ALT: () => {
              const aggregateToken = this.OR2([
                { ALT: () => this.CONSUME(L.Count) },
                { ALT: () => this.CONSUME(L.Sum) },
              ]);
              const aggregate = aggregateToken.image as AggregateType;
              atoms.push({ kind: "aggregate", aggregate });
            },
          },
        ]);
      },
    });

    return { kind: "query", name, atoms };
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
        const order = orderToken?.image as OrderType | undefined;
        orderBy.push({ identifier, order });
      },
    });
    this.CONSUME(L.LCurly);

    return orderBy;
  });

  entrypoint = this.RULE("entrypoint", (): Entrypoint => {
    const atoms: EntrypointAtom[] = [];

    this.CONSUME(L.Entrypoint);
    this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(L.Target);
            const identifier = this.SUBRULE(this.identifierAs);
            atoms.push({ kind: "target", identifier });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Identify);
            this.CONSUME(L.With);
            const identifier = this.SUBRULE2(this.identifier);
            atoms.push({ kind: "identify", identifier });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Response);
            const select = this.SUBRULE(this.select);
            atoms.push({ kind: "response", select });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Authorize);
            const expr = this.SUBRULE(this.expr);
            atoms.push({ kind: "authorize", expr });
          },
        },
        {
          ALT: () => {
            atoms.push({ kind: "endpoints", endpoint: this.SUBRULE(this.endpoint) });
          },
        },
        {
          ALT: () => {
            atoms.push({ kind: "entrypoints", entrypoint: this.SUBRULE(this.entrypoint) });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "entrypoint", atoms };
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
    const type = typeToken.image as EndpointType;
    this.CONSUME(L.Endpoint);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR2([
        {
          ALT: () => {
            const actions = this.SUBRULE(this.actions);
            atoms.push({ kind: "action", actions });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Authorize);
            const expr = this.SUBRULE(this.expr);
            atoms.push({ kind: "authorize", expr });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { type, atoms };
  });

  actions = this.RULE("actions", (): Action[] => {
    const actions: Action[] = [];

    this.CONSUME(L.Action);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      actions.push(this.SUBRULE(this.action));
    });
    this.CONSUME(L.RCurly);

    return actions;
  });

  action = this.RULE("action", (): Action => {
    const atoms: ActionAtom[] = [];

    const typeToken = this.OR1([
      { ALT: () => this.CONSUME(L.Create) },
      { ALT: () => this.CONSUME(L.Update) },
      { ALT: () => this.CONSUME(L.Delete) },
    ]);
    const kind = typeToken.image as ActionType;
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

    return { kind, target, atoms };
  });

  actionAtomSet = this.RULE("actionAtomSet", (): ActionAtomSet => {
    this.CONSUME(L.Set);
    const target = this.SUBRULE(this.identifier);
    const set = this.OR([
      { ALT: () => this.SUBRULE(this.unnamedHook) },
      { ALT: () => this.SUBRULE(this.expr) },
    ]);

    return { kind: "set", target, set };
  });

  actionAtomReference = this.RULE("actionAtomReference", (): ActionAtomReferenceThrough => {
    this.CONSUME(L.Reference);
    const target = this.SUBRULE1(this.identifier);
    this.CONSUME(L.Through);
    const through = this.SUBRULE2(this.identifier);

    return { kind: "referenceThrough", target, through };
  });

  actionAtomDeny = this.RULE("actionAtomDeny", (): ActionAtomDeny => {
    this.CONSUME(L.Deny);
    const fields = this.OR([
      {
        ALT: (): ActionAtomDeny["fields"] => {
          this.CONSUME(L.Mul);
          return "*";
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

          return fields;
        },
      },
    ]);

    return { kind: "deny", fields };
  });

  actionAtomInput = this.RULE("actionAtomInput", (): ActionAtomInput => {
    const fields: ActionAtomInput["fields"] = [];

    this.CONSUME(L.Input);
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

    return { kind: "input", fields };
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
                this.CONSUME(L.Optional);
                atoms.push({ kind: "optional" });
              },
            },
            {
              ALT: () => {
                this.CONSUME1(L.Default);
                const value = this.SUBRULE(this.literal);
                atoms.push({ kind: "default_literal", value });
              },
            },
            {
              ALT: () => {
                this.CONSUME2(L.Default);
                const value = this.SUBRULE(this.identifierPath);
                atoms.push({ kind: "default_reference", value });
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

    this.CONSUME(L.Populator);
    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      atoms.push(this.SUBRULE(this.populate));
    });
    this.CONSUME(L.RCurly);

    return { kind: "populator", name, atoms };
  });

  populate = this.RULE("populate", (): Populate => {
    const atoms: PopulateAtom[] = [];

    this.CONSUME(L.Populate);
    this.SUBRULE1(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(L.Target);
            const identifier = this.SUBRULE(this.identifierAs);
            atoms.push({ kind: "target", identifier });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Identify);
            const identifier = this.SUBRULE2(this.identifier);
            atoms.push({ kind: "identify", identifier });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Repeat);
            const repeater = this.SUBRULE(this.repeater);
            atoms.push({ kind: "repeat", repeater });
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

    return { kind: "populate", atoms };
  });

  repeater = this.RULE("repeater", (): Repeater => {
    return this.OR1([
      {
        ALT: (): Repeater => {
          const value = parseInt(this.CONSUME1(L.Integer).image);
          return { kind: "simple", value };
        },
      },
      {
        ALT: (): Repeater => {
          const atoms: RepeaterAtom[] = [];
          this.MANY_SEP({
            SEP: L.Comma,
            DEF: () => {
              const kindToken = this.OR2([
                { ALT: () => this.CONSUME(L.Start) },
                { ALT: () => this.CONSUME(L.End) },
              ]);
              const kind = kindToken.image as "start" | "end";
              const value = parseInt(this.CONSUME2(L.Integer).image);
              atoms.push({ kind, value });
            },
          });
          return { kind: "body", atoms };
        },
      },
    ]);
  });

  unnamedHook = this.RULE("unnamedHook", (): UnnamedHook => {
    this.CONSUME(L.Hook);
    const atoms = this.SUBRULE(this.hookAtoms);
    return { kind: "hook", atoms };
  });

  hook = this.RULE("hook", (): Hook => {
    this.CONSUME(L.Hook);
    const name = this.SUBRULE(this.identifier);
    const atoms = this.SUBRULE(this.hookAtoms);
    return { kind: "hook", name, atoms };
  });

  hookAtoms = this.RULE("hookAtoms", (): HookAtom[] => {
    const atoms: HookAtom[] = [];

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(L.Default);
            this.CONSUME1(L.Arg);
            const name = this.SUBRULE2(this.identifier);
            atoms.push({ kind: "default_arg", name });
          },
        },
        {
          ALT: () => {
            this.CONSUME2(L.Arg);
            const name = this.SUBRULE3(this.identifier);
            const expr = this.SUBRULE(this.expr);
            atoms.push({ kind: "arg_expr", name, expr });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Source);
            const name = this.SUBRULE4(this.identifier);
            this.CONSUME(L.From);
            const file = this.CONSUME1(L.String).image;
            atoms.push({ kind: "source", name, file });
          },
        },
        {
          ALT: () => {
            this.CONSUME(L.Inline);
            const code = this.CONSUME2(L.String).image;
            atoms.push({ kind: "inline", code });
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
    this.CONSUME(L.Not);
    const expr = this.SUBRULE(this.primaryExpr);
    return { kind: "unary", operator: "not", expr };
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
      const lhs = this.SUBRULE1(next);
      this.MANY(() => {
        const operator = this.OR(operators.map((op) => ({ ALT: () => this.CONSUME(op) })));
        const rhs = this.SUBRULE2(next);
        return { kind: "binary", operator: operator.image, lhs, rhs };
      });
      return lhs;
    });
  }

  literal = this.RULE("literal", (): Literal => {
    return this.OR([
      {
        ALT: () => {
          const value = parseInt(this.CONSUME(L.Integer).image);
          return { kind: "integer", value };
        },
      },
      {
        ALT: () => {
          const value = parseFloat(this.CONSUME(L.Float).image);
          return { kind: "float", value };
        },
      },
      {
        ALT: () => {
          this.CONSUME(L.True);
          return { kind: "boolean", value: true };
        },
      },
      {
        ALT: () => {
          this.CONSUME(L.False);
          return { kind: "boolean", value: false };
        },
      },
      {
        ALT: () => {
          this.CONSUME(L.Null);
          return { kind: "null", value: null };
        },
      },
      {
        ALT: () => {
          const value = this.CONSUME(L.String).image;
          return { kind: "string", value };
        },
      },
    ]);
  });

  identifier = this.RULE("identifier", (): Identifier => {
    const token = this.CONSUME(L.Identifier);
    return { text: token.image, pos: getSourcePos(token) };
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

export const parser = new GaudiParser();
