import { EmbeddedActionsParser, IToken, ParserMethod, TokenType } from "chevrotain";

import {
  Action,
  ActionAtomInput,
  ActionAtomInputAll,
  ActionAtomReferenceThrough,
  ActionAtomSet,
  ActionHook,
  AggregateType,
  AnonymousQuery,
  Api,
  Authenticator,
  AuthenticatorAtom,
  BinaryOperator,
  BooleanLiteral,
  Computed,
  Db,
  DeleteAction,
  Endpoint,
  EndpointAtom,
  EndpointCardinality,
  EndpointMethod,
  EndpointType,
  Entrypoint,
  EntrypointAtom,
  ExecuteAction,
  ExecuteActionAtom,
  Expr,
  ExtraInput,
  ExtraInputAtom,
  Field,
  FieldAtom,
  FloatLiteral,
  Generator,
  GeneratorClientAtom,
  GeneratorClientAtomTarget,
  GeneratorType,
  GlobalAtom,
  Hook,
  Identifier,
  Identify,
  InputAtom,
  IntegerLiteral,
  Literal,
  Model,
  ModelAction,
  ModelActionAtom,
  ModelAtom,
  ModelHook,
  NullLiteral,
  OrderBy,
  OrderType,
  Populate,
  PopulateAtom,
  Populator,
  Query,
  QueryAction,
  QueryActionAtom,
  QueryAtom,
  Reference,
  ReferenceAtom,
  Relation,
  RelationAtom,
  RepeatAtom,
  RepeatValue,
  RespondAction,
  RespondActionAtom,
  RespondActionAtomHttpHeader,
  Runtime,
  RuntimeAtom,
  Select,
  StringLiteral,
  TokenData,
  ValidateAction,
  ValidateExpr,
  Validator,
  ValidatorArg,
  ValidatorArgAtom,
  ValidatorAtom,
  ValidatorError,
  ValidatorErrorAtom,
  ValidatorHook,
  zeroToken,
} from "./ast/ast";
import { Type } from "./ast/type";
import * as L from "./lexer";

export function getTokenData(filename: string, ...tokens: IToken[]): TokenData {
  const positions = tokens.flatMap((t): TokenData[] => {
    if (t.startLine && t.startColumn && t.endLine && t.endColumn) {
      return [
        {
          filename,
          start: { line: t.startLine, column: t.startColumn },
          end: { line: t.endLine, column: t.endColumn },
        },
      ];
    } else {
      return [];
    }
  });
  return {
    filename,
    start: positions.at(0)?.start ?? zeroToken.start,
    end: positions.at(-1)?.end ?? zeroToken.end,
  };
}

class GaudiParser extends EmbeddedActionsParser {
  public filename = ":unset:";
  constructor() {
    super(L.GaudiTokens);
    this.performSelfAnalysis();
  }

  createTokenData(...tokens: IToken[]) {
    return getTokenData(this.filename, ...tokens);
  }

  document = this.RULE("document", (): GlobalAtom[] => {
    const atoms: GlobalAtom[] = [];

    this.MANY(() => {
      this.OR([
        { ALT: () => atoms.push(this.SUBRULE(this.validator)) },
        { ALT: () => atoms.push(this.SUBRULE(this.model)) },
        { ALT: () => atoms.push(this.SUBRULE(this.api)) },
        { ALT: () => atoms.push(this.SUBRULE(this.populator)) },
        { ALT: () => atoms.push(this.SUBRULE(this.runtime)) },
        { ALT: () => atoms.push(this.SUBRULE(this.authenticator)) },
        { ALT: () => atoms.push(this.SUBRULE(this.generator)) },
      ]);
    });

    return atoms;
  });

  validator = this.RULE("validator", (): Validator => {
    const atoms: ValidatorAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Validator));
    const name = this.SUBRULE(this.identifierDef);
    this.CONSUME1(L.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => atoms.push(this.SUBRULE(this.validatorArg)) },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME1(L.Assert));
            this.CONSUME2(L.LCurly);
            const expr = this.SUBRULE(this.expr);
            this.CONSUME2(L.RCurly);
            atoms.push({ kind: "assert", keyword, expr });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME2(L.Assert));
            const hook = this.SUBRULE(this.validatorHook);
            atoms.push({ kind: "assertHook", keyword, hook });
          },
        },
        { ALT: () => atoms.push(this.SUBRULE(this.validatorError)) },
      ]);
    });
    this.CONSUME1(L.RCurly);

    return { kind: "validator", name, atoms, keyword };
  });

  validatorArg = this.RULE("validatorArg", (): ValidatorArg => {
    const atoms: ValidatorArgAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Arg));
    const name = this.SUBRULE1(this.identifierDef);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Type));
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "type", identifier, keyword });
            },
          },
        ]),
    });
    this.CONSUME(L.RCurly);

    return { kind: "arg", name, atoms, keyword };
  });

  validatorError = this.RULE("validatorError", (): ValidatorError => {
    const atoms: ValidatorErrorAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Error));
    this.CONSUME(L.LCurly);
    this.MANY(() =>
      this.OR([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Code));
            const code = this.SUBRULE2(this.string);
            atoms.push({ kind: "code", code, keyword });
          },
        },
      ])
    );
    this.CONSUME(L.RCurly);

    return { kind: "error", atoms, keyword };
  });

  model = this.RULE("model", (): Model => {
    const atoms: ModelAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Model));
    const name = this.SUBRULE(this.identifierDef);
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

    const keyword = this.createTokenData(this.CONSUME(L.Field));
    const name = this.SUBRULE1(this.identifierDef);
    this.CONSUME1(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Type));
              const identifier = this.SUBRULE2(this.identifier);
              atoms.push({ kind: "type", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Default));
              const expr = this.SUBRULE(this.expr);
              atoms.push({ kind: "default", expr, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Unique));
              atoms.push({ kind: "unique", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Nullable));
              atoms.push({ kind: "nullable", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Validate));
              this.CONSUME2(L.LCurly);
              const expr = this.SUBRULE(this.validateExpr);
              this.CONSUME2(L.RCurly);
              atoms.push({ kind: "validate", expr: expr, keyword });
            },
          },
        ]),
    });
    this.CONSUME1(L.RCurly);

    return { kind: "field", name, atoms, keyword };
  });

  validateExpr = this.RULE("validateExpr", (): ValidateExpr => {
    return this.SUBRULE(this.validateOrExpr);
  });

  validatePrimaryExpr = this.RULE("validatePrimaryExpr", (): ValidateExpr => {
    return this.OR<ValidateExpr>([
      { ALT: () => this.SUBRULE(this.validateCallExpr) },
      { ALT: () => this.SUBRULE(this.validateGroupExpr) },
    ]);
  });

  validateGroupExpr = this.RULE("validateGroupExpr", (): ValidateExpr => {
    this.createTokenData(this.CONSUME(L.LRound));
    const expr = this.SUBRULE(this.validatePrimaryExpr);
    this.createTokenData(this.CONSUME(L.RRound));
    return { kind: "group", expr };
  });

  validateCallExpr = this.RULE("validateCallExpr", (): ValidateExpr => {
    const args: Expr[] = [];

    const validator = this.SUBRULE(this.identifierRef);
    this.CONSUME(L.LRound);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => args.push(this.SUBRULE(this.expr)),
    });
    this.CONSUME(L.RRound);
    return { kind: "validator", validator, args };
  });

  validateAndExpr = this.GENERATE_VALIDATE_OPERATOR(
    "validateAndExpr",
    this.validatePrimaryExpr,
    L.And
  );
  validateOrExpr = this.GENERATE_VALIDATE_OPERATOR("validateOrExpr", this.validateAndExpr, L.Or);

  GENERATE_VALIDATE_OPERATOR(
    name: string,
    next: ParserMethod<[], ValidateExpr>,
    operator: TokenType
  ): ParserMethod<[], ValidateExpr> {
    return this.RULE(name, (): ValidateExpr => {
      let lhs = this.SUBRULE1(next);
      this.MANY(() => {
        const operatorToken = this.CONSUME(operator);
        const keyword = this.createTokenData(operatorToken);

        const rhs = this.SUBRULE2(next);

        lhs = { kind: "binary", operator: operatorToken.image as "and" | "or", lhs, rhs, keyword };
      });
      return lhs;
    });
  }

  reference = this.RULE("reference", (): Reference => {
    const atoms: ReferenceAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Reference));
    const name = this.SUBRULE1(this.identifierDef);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.To));
              const identifier = this.SUBRULE2(this.identifierRef);
              atoms.push({ kind: "to", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Nullable));
              atoms.push({ kind: "nullable", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Unique));
              atoms.push({ kind: "unique", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.On), this.CONSUME(L.Delete));
              this.OR1([
                {
                  ALT: () => {
                    const actionKeyword = this.createTokenData(
                      this.CONSUME(L.Set),
                      this.CONSUME(L.Null)
                    );
                    atoms.push({
                      kind: "onDelete",
                      action: { kind: "setNull", keyword: actionKeyword },
                      keyword,
                    });
                  },
                },
                {
                  ALT: () => {
                    const actionKeyword = this.createTokenData(this.CONSUME(L.Cascade));
                    atoms.push({
                      kind: "onDelete",
                      action: { kind: "cascade", keyword: actionKeyword },
                      keyword,
                    });
                  },
                },
              ]);
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

    const keyword = this.createTokenData(this.CONSUME(L.Relation));
    const name = this.SUBRULE1(this.identifierDef);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.From));
              const identifier = this.SUBRULE2(this.identifierRef);
              atoms.push({ kind: "from", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Through));
              const identifier = this.SUBRULE3(this.identifierRef);
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
    const keyword = this.createTokenData(this.CONSUME(L.Computed));
    const name = this.SUBRULE(this.identifierDef);
    this.CONSUME(L.LCurly);
    const expr = this.SUBRULE(this.expr) as Expr<Db>;
    this.CONSUME(L.RCurly);

    return { kind: "computed", name, expr, keyword };
  });

  query = this.RULE("query", (): Query => {
    const atoms: QueryAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Query));
    const name = this.SUBRULE(this.identifierDef);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => atoms.push(this.SUBRULE(this.queryAtom)),
    });
    this.CONSUME(L.RCurly);

    return { kind: "query", name, atoms, keyword };
  });

  queryAtom = this.RULE("queryAtom", (): QueryAtom => {
    return this.OR1<QueryAtom>([
      {
        ALT: () => {
          const keyword = this.createTokenData(this.CONSUME(L.From));
          const identifierPath = this.SUBRULE1(this.identifierRefPath);
          const as = this.OPTION(() => {
            const keyword = this.createTokenData(this.CONSUME(L.As));
            const identifierPath = this.SUBRULE2(this.identifierDefPath);
            return { keyword, identifierPath };
          });
          return {
            kind: "from",
            identifierPath,
            as,
            keyword,
          };
        },
      },
      {
        ALT: () => {
          const keyword = this.createTokenData(this.CONSUME(L.Filter));
          this.CONSUME(L.LCurly);
          const expr = this.SUBRULE(this.expr) as Expr<Db>;
          this.CONSUME(L.RCurly);
          return { kind: "filter", expr, keyword };
        },
      },
      {
        ALT: () => {
          const keyword = this.createTokenData(this.CONSUME(L.Order), this.CONSUME(L.By));
          const orderBy = this.SUBRULE(this.orderBy);
          return { kind: "orderBy", orderBy, keyword };
        },
      },
      {
        ALT: () => {
          const keyword = this.createTokenData(this.CONSUME(L.Limit));
          const value = this.SUBRULE1(this.integer);
          return { kind: "limit", value, keyword };
        },
      },
      {
        ALT: () => {
          const keyword = this.createTokenData(this.CONSUME(L.Offset));
          const value = this.SUBRULE2(this.integer);
          return { kind: "offset", value, keyword };
        },
      },
      {
        ALT: () => {
          const aggregateToken = this.OR2([
            { ALT: () => this.CONSUME(L.Count) },
            { ALT: () => this.CONSUME(L.Sum) },
            { ALT: () => this.CONSUME(L.One) },
            { ALT: () => this.CONSUME(L.First) },
          ]);
          const aggregate = aggregateToken.image as AggregateType;
          const keyword = this.createTokenData(aggregateToken);
          return { kind: "aggregate", aggregate, keyword };
        },
      },
    ]);
  });

  orderBy = this.RULE("orderBy", (): OrderBy => {
    const orderBy: OrderBy = [];

    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        const expr = this.SUBRULE(this.expr);
        const orderToken = this.OPTION(() =>
          this.OR([{ ALT: () => this.CONSUME(L.Asc) }, { ALT: () => this.CONSUME(L.Desc) }])
        );
        if (orderToken) {
          const order = orderToken.image as OrderType;
          const keyword = this.createTokenData(orderToken);
          orderBy.push({ expr, order, keyword });
        } else {
          orderBy.push({ expr });
        }
      },
    });
    this.CONSUME(L.RCurly);

    return orderBy;
  });

  api = this.RULE("api", (): Api => {
    const atoms: Api["atoms"] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Api));
    const name = this.OPTION(() => this.SUBRULE(this.identifier));

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            atoms.push(this.SUBRULE(this.entrypoint));
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "api", keyword, name, atoms };
  });

  entrypoint = this.RULE("entrypoint", (): Entrypoint => {
    const atoms: EntrypointAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Entrypoint));
    const target = this.SUBRULE1(this.identifierRef);
    const as = this.OPTION(() => {
      const keyword = this.createTokenData(this.CONSUME(L.As));
      const identifier = this.SUBRULE2(this.identifierDef);
      return { identifier, keyword };
    });
    this.CONSUME1(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Response));
            const select = this.SUBRULE(this.select);
            atoms.push({ kind: "response", select, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Authorize));
            this.CONSUME2(L.LCurly);
            const expr = this.SUBRULE(this.expr);
            this.CONSUME2(L.RCurly);
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
        {
          ALT: () => {
            atoms.push(this.SUBRULE(this.identify));
          },
        },
      ]);
    });
    this.CONSUME1(L.RCurly);

    return { kind: "entrypoint", target, as, atoms, keyword };
  });

  identify = this.RULE("identify", (): Identify => {
    const atoms: Identify["atoms"] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Identify));

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Through));
            const identifierPath = this.SUBRULE(this.identifierRefPath);
            atoms.push({ kind: "through", identifierPath, keyword });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "identify", atoms, keyword };
  });

  endpoint = this.RULE("endpoint", (): Endpoint => {
    const atoms: EndpointAtom[] = [];
    const typeToken = this.OR1([
      { ALT: () => this.CONSUME(L.List) },
      { ALT: () => this.CONSUME(L.Get) },
      { ALT: () => this.CONSUME(L.Create) },
      { ALT: () => this.CONSUME(L.Update) },
      { ALT: () => this.CONSUME(L.Delete) },
      { ALT: () => this.CONSUME(L.Custom) },
    ]);
    const keywordType = this.createTokenData(typeToken);
    const type = typeToken.image as EndpointType;
    const keyword = this.createTokenData(this.CONSUME(L.Endpoint));
    this.CONSUME1(L.LCurly);
    this.MANY1(() => {
      this.OR2([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Extra), this.CONSUME(L.Inputs));
            const extraInputs: ExtraInput[] = [];
            this.CONSUME2(L.LCurly);
            this.MANY2(() => {
              extraInputs.push(this.SUBRULE(this.extraInput));
            });
            this.CONSUME2(L.RCurly);
            atoms.push({ kind: "extraInputs", extraInputs, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Action));
            const actions = this.SUBRULE(this.actions);
            atoms.push({ kind: "action", actions, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Authorize));
            this.CONSUME3(L.LCurly);
            const expr = this.SUBRULE(this.expr);
            this.CONSUME3(L.RCurly);
            atoms.push({ kind: "authorize", expr, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Method));
            const methodToken = this.OR3([
              { ALT: () => this.CONSUME(L.GET) },
              { ALT: () => this.CONSUME(L.POST) },
              { ALT: () => this.CONSUME(L.PATCH) },
              { ALT: () => this.CONSUME(L.DELETE) },
            ]);
            const method = methodToken.image as EndpointMethod;
            const methodKeyword = this.createTokenData(methodToken);
            atoms.push({ kind: "method", method, keyword, methodKeyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Cardinality));
            const cardinalityToken = this.OR4([
              { ALT: () => this.CONSUME(L.One) },
              { ALT: () => this.CONSUME(L.Many) },
            ]);
            const cardinality = cardinalityToken.image as EndpointCardinality;
            const cardinalityKeyword = this.createTokenData(cardinalityToken);
            atoms.push({ kind: "cardinality", cardinality, keyword, cardinalityKeyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Pageable));
            atoms.push({ kind: "pageable", keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Path));
            const path = this.SUBRULE(this.string);
            atoms.push({ kind: "path", path, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Order), this.CONSUME(L.By));
            const orderBy = this.SUBRULE(this.orderBy);
            atoms.push({ kind: "orderBy", orderBy, keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Filter));
            this.CONSUME(L.LCurly);
            const expr = this.SUBRULE2(this.expr) as Expr<Db>;
            this.CONSUME(L.RCurly);
            atoms.push({ kind: "filter", expr, keyword });
          },
        },
      ]);
    });
    this.CONSUME1(L.RCurly);

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
    return this.OR<Action>([
      { ALT: () => this.SUBRULE(this.modelAction) },
      { ALT: () => this.SUBRULE(this.deleteAction) },
      { ALT: () => this.SUBRULE(this.executeAction) },
      { ALT: () => this.SUBRULE(this.respondAction) },
      { ALT: () => this.SUBRULE(this.queryAction) },
      { ALT: () => this.SUBRULE(this.validateAction) },
    ]);
  });

  modelAction = this.RULE("modelAction", (): ModelAction => {
    const atoms: ModelActionAtom[] = [];

    const token = this.OR1([
      { ALT: () => this.CONSUME(L.Create) },
      { ALT: () => this.CONSUME(L.Update) },
    ]);
    const keyword = this.createTokenData(token);
    const kind = token.image as ModelAction["kind"];

    const { target, as } = this.OR2<{ target: ModelAction["target"]; as: ModelAction["as"] }>([
      {
        ALT: () => {
          const keyword = this.createTokenData(this.CONSUME2(L.As));
          const identifier = this.SUBRULE2(this.identifierDef);
          this.CONSUME1(L.LCurly);
          return { target: undefined, as: { keyword, identifier } };
        },
      },
      {
        ALT: () => {
          const target = this.SUBRULE(this.identifierRefPath);
          const as = this.OPTION(() => {
            const keyword = this.createTokenData(this.CONSUME1(L.As));
            const identifier = this.SUBRULE1(this.identifierDef);
            return { keyword, identifier };
          });
          this.CONSUME2(L.LCurly);
          return { target, as };
        },
      },
      {
        ALT: () => {
          this.CONSUME3(L.LCurly);
          return { target: undefined, as: undefined };
        },
      },
    ]);

    this.MANY(() => {
      this.OR3([
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomSet)) },
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomReference)) },
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomInput)) },
        { ALT: () => atoms.push(this.SUBRULE(this.actionAtomInputAll)) },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind, target, as, atoms, keyword };
  });

  deleteAction = this.RULE("deleteAction", (): DeleteAction => {
    const keyword = this.createTokenData(this.CONSUME(L.Delete));
    const target = this.OPTION(() => this.SUBRULE(this.identifierRefPath));

    this.CONSUME(L.LCurly);
    this.CONSUME(L.RCurly);

    return { kind: "delete", target, keyword };
  });

  executeAction = this.RULE("executeAction", (): ExecuteAction => {
    const atoms: ExecuteActionAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Execute));
    const alias = this.OPTION(() => {
      const keywordAs = this.createTokenData(this.CONSUME(L.As));
      const name = this.SUBRULE(this.identifierDef);
      return { keywordAs, name };
    });

    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        { ALT: () => atoms.push(this.SUBRULE(this.actionHook)) },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Responds));
            atoms.push({ kind: "responds", keyword });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "execute", keywordAs: alias?.keywordAs, name: alias?.name, atoms, keyword };
  });

  respondAction = this.RULE("respond", (): RespondAction => {
    const atoms: RespondActionAtom[] = [];

    const keyword = getTokenData(this.filename, this.CONSUME(L.Respond));

    this.CONSUME1(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = getTokenData(this.filename, this.CONSUME(L.Body));
            const body = this.SUBRULE1(this.expr);
            atoms.push({ kind: "body", keyword, body });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.filename, this.CONSUME(L.HttpStatus));
            const code = this.SUBRULE2(this.expr);
            atoms.push({ kind: "httpStatus", keyword, code });
          },
        },
        {
          ALT: () => {
            const keyword = getTokenData(this.filename, this.CONSUME(L.HttpHeaders));
            const headers: RespondActionAtomHttpHeader[] = [];

            this.CONSUME2(L.LCurly);
            this.MANY_SEP({
              SEP: L.Comma,
              DEF: () => {
                const name = this.SUBRULE3(this.string);
                const value = this.SUBRULE4(this.expr);

                headers.push({ kind: "header", keyword: name.token, name, value });
              },
            });
            this.CONSUME2(L.RCurly);

            atoms.push({ kind: "httpHeaders", keyword, headers });
          },
        },
      ]);
    });
    this.CONSUME1(L.RCurly);

    return {
      kind: "respond",
      atoms,
      keyword,
    };
  });

  queryAction = this.RULE("queryAction", (): QueryAction => {
    const atoms: QueryActionAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Query));
    const alias = this.OPTION(() => {
      const keyword = this.createTokenData(this.CONSUME(L.As));
      const name = this.SUBRULE(this.identifierDef);
      return { keyword, name };
    });

    this.CONSUME1(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          { ALT: () => atoms.push(this.SUBRULE(this.queryAtom)) },
          {
            ALT: () => {
              const updateAtoms: ActionAtomSet[] = [];
              const keyword = this.createTokenData(this.CONSUME(L.Update));
              this.CONSUME2(L.LCurly);
              this.MANY2(() => updateAtoms.push(this.SUBRULE(this.actionAtomSet)));
              this.CONSUME2(L.RCurly);
              atoms.push({ kind: "update", atoms: updateAtoms, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Delete));
              atoms.push({ kind: "delete", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Select));
              const select = this.SUBRULE(this.select);
              atoms.push({ kind: "select", select, keyword });
            },
          },
        ]);
      },
    });
    this.CONSUME1(L.RCurly);

    return {
      kind: "queryAction",
      keywordAs: alias?.keyword,
      name: alias?.name,
      type: Type.any,
      atoms,
      keyword,
    };
  });

  validateAction = this.RULE("validateAction", (): ValidateAction => {
    const keyword = this.createTokenData(
      this.CONSUME(L.Validate),
      this.CONSUME(L.With),
      this.CONSUME(L.Key)
    );
    const key = this.SUBRULE(this.string);

    this.CONSUME(L.LCurly);
    const expr = this.SUBRULE(this.validateExpr);
    this.CONSUME(L.RCurly);

    return { kind: "validate", key, expr, keyword };
  });

  actionAtomSet = this.RULE("actionAtomSet", (): ActionAtomSet => {
    const keyword = this.createTokenData(this.CONSUME(L.Set));
    const target = this.SUBRULE(this.identifierRef);
    const set = this.OR<ActionAtomSet["set"]>([
      { ALT: () => this.SUBRULE(this.actionHook) },
      { ALT: () => ({ kind: "expr", expr: this.SUBRULE(this.expr) }) },
    ]);

    return { kind: "set", target, set, keyword };
  });

  actionAtomReference = this.RULE("actionAtomReference", (): ActionAtomReferenceThrough => {
    const keyword = this.createTokenData(this.CONSUME(L.Reference));
    const target = this.SUBRULE1(this.identifierRef);
    const keywordThrough = this.createTokenData(this.CONSUME(L.Through));
    const through = this.SUBRULE2(this.identifierRefPath);
    return {
      kind: "referenceThrough",
      target,
      through,
      keyword,
      keywordThrough,
    };
  });

  actionAtomInput = this.RULE("actionAtomInput", (): ActionAtomInput => {
    const fields: ActionAtomInput["fields"] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Input));
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

  actionAtomInputAll = this.RULE("actionAtomInputAll", (): ActionAtomInputAll => {
    const except: ActionAtomInputAll["except"] = [];
    const keyword = this.createTokenData(this.CONSUME(L.Input), this.CONSUME(L.Mul));

    const keywordExcept = this.OPTION(() => {
      const keyword = this.createTokenData(this.CONSUME(L.Except));
      this.CONSUME(L.LCurly);
      this.MANY_SEP({
        SEP: L.Comma,
        DEF: () => except.push(this.SUBRULE(this.identifierRef)),
      });
      this.CONSUME(L.RCurly);
      return keyword;
    });

    return { kind: "input-all", keyword, keywordExcept, except };
  });

  extraInput = this.RULE("extraInput", (): ExtraInput => {
    const atoms: ExtraInputAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Field));
    const name = this.SUBRULE(this.identifierDef);
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () =>
        this.OR([
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Type));
              const identifier = this.SUBRULE(this.identifier);
              atoms.push({ kind: "type", identifier, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Nullable));
              atoms.push({ kind: "nullable", keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Validate));
              this.CONSUME2(L.LCurly);
              const expr = this.SUBRULE(this.validateExpr);
              this.CONSUME2(L.RCurly);
              atoms.push({ kind: "validate", expr, keyword });
            },
          },
        ]),
    });
    this.CONSUME(L.RCurly);

    return { kind: "field", name, atoms, keyword };
  });

  inputAtoms = this.RULE("inputAtoms", (): InputAtom[] => {
    const atoms: InputAtom[] = [];

    this.OPTION(() => {
      this.CONSUME(L.LCurly);
      this.MANY_SEP({
        SEP: L.Comma,
        DEF: () =>
          this.OR([
            {
              ALT: () => {
                const keyword = this.createTokenData(this.CONSUME(L.Required));
                atoms.push({ kind: "required", keyword });
              },
            },
            {
              ALT: () => {
                const keyword = this.createTokenData(this.CONSUME(L.Default));
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

    const keyword = this.createTokenData(this.CONSUME(L.Populator));
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

    const keyword = this.createTokenData(this.CONSUME(L.Populate));
    const target = this.SUBRULE1(this.identifierRef);
    const as = this.OPTION1(() => {
      const keyword = this.createTokenData(this.CONSUME1(L.As));
      const identifier = this.SUBRULE2(this.identifierDef);
      return { identifier, keyword };
    });
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Repeat));
            const as = this.OPTION2(() => {
              const keyword = this.createTokenData(this.CONSUME2(L.As));
              const identifier = this.SUBRULE3(this.identifierDef);
              return { keyword, identifier };
            });
            const repeatValue = this.SUBRULE(this.repeatValue);
            atoms.push({ kind: "repeat", as, repeatValue, keyword });
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

    return { kind: "populate", target, as, atoms, keyword };
  });

  repeatValue = this.RULE("repeat", (): RepeatValue => {
    return this.OR1<RepeatValue>([
      {
        ALT: () => {
          const value = this.SUBRULE1(this.integer);
          return { kind: "short", value };
        },
      },
      {
        ALT: () => {
          const atoms: RepeatAtom[] = [];
          this.CONSUME(L.LCurly);
          this.MANY_SEP({
            SEP: L.Comma,
            DEF: () => {
              const token = this.OR2([
                { ALT: () => this.CONSUME(L.Start) },
                { ALT: () => this.CONSUME(L.End) },
              ]);
              const keyword = this.createTokenData(token);
              const kind = token.image as "start" | "end";
              const value = this.SUBRULE2(this.integer);
              atoms.push({ kind, value, keyword });
            },
          });
          this.CONSUME(L.RCurly);
          return { kind: "long", atoms };
        },
      },
    ]);
  });

  runtime = this.RULE("runtime", (): Runtime => {
    const atoms: RuntimeAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Runtime));
    const name = this.SUBRULE(this.identifier);
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Default));
            atoms.push({ kind: "default", keyword });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Source), this.CONSUME(L.Path));
            const path = this.SUBRULE(this.string);
            atoms.push({ kind: "sourcePath", path, keyword });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "runtime", name, atoms, keyword };
  });

  authenticator = this.RULE("authenticator", (): Authenticator => {
    const atoms: AuthenticatorAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Auth));
    this.CONSUME1(L.LCurly);
    this.MANY(() => {
      const keyword = this.createTokenData(this.CONSUME(L.Method));
      const methodKeyword = this.createTokenData(this.CONSUME(L.Basic));
      this.CONSUME2(L.LCurly);
      this.CONSUME2(L.RCurly);
      atoms.push({
        kind: "method",
        method: { kind: "basic", keyword: methodKeyword },
        keyword,
      });
    });
    this.CONSUME(L.RCurly);

    return { kind: "authenticator", atoms, keyword };
  });

  generator = this.RULE("generator", (): Generator => {
    const atoms: GeneratorClientAtom[] = [];

    const keyword = this.createTokenData(this.CONSUME(L.Generate));
    const typeToken = this.OR1([{ ALT: () => this.CONSUME(L.Client) }]);
    const keywordType = this.createTokenData(typeToken);
    const type = typeToken.image as GeneratorType;
    this.CONSUME(L.LCurly);
    this.MANY(() => {
      this.OR2([
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Target));
            const typeToken = this.OR3([
              { ALT: () => this.CONSUME(L.Js) },
              { ALT: () => this.CONSUME(L.Ts) },
            ]);
            const keywordValue = this.createTokenData(typeToken);
            const value = typeToken.image as GeneratorClientAtomTarget;
            atoms.push({ kind: "target", keyword, value, keywordValue });
          },
        },
        {
          ALT: () => {
            const keyword = this.createTokenData(this.CONSUME(L.Output));
            const value = this.SUBRULE1(this.string);
            atoms.push({ kind: "output", keyword, value });
          },
        },
      ]);
    });
    this.CONSUME(L.RCurly);

    return { kind: "generator", type, atoms, keyword, keywordType };
  });

  modelHook: ParserMethod<[], ModelHook> = this.GENERATE_HOOK("modelHook", "model");
  validatorHook: ParserMethod<[], ValidatorHook> = this.GENERATE_HOOK("validatorHook", "validator");
  actionHook: ParserMethod<[], ActionHook> = this.GENERATE_HOOK("actionHook", "action");

  GENERATE_HOOK<k extends "model" | "validator" | "action", h extends Hook<k>>(
    ruleName: string,
    kind: k
  ): ParserMethod<[], h> {
    return this.RULE(ruleName, (): h => {
      const keyword = this.createTokenData(this.CONSUME(L.Hook));

      const name = kind === "model" ? this.SUBRULE1(this.identifierDef) : undefined;

      const atoms: unknown[] = [];

      this.CONSUME(L.LCurly);
      this.MANY(() => {
        this.OR1([
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME2(L.Arg));
              const name = this.SUBRULE3(this.identifier);
              this.OR2([
                {
                  GATE: () => kind !== "validator",
                  ALT: () => {
                    const query = this.SUBRULE(this.anonymousQuery);
                    atoms.push({ kind: "arg_query", name, query, keyword });
                  },
                },
                {
                  ALT: () => {
                    const expr = this.SUBRULE(this.expr);
                    atoms.push({ kind: "arg_expr", name, expr, keyword });
                  },
                },
              ]);
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Source));
              const name = this.SUBRULE4(this.identifier);
              const keywordFrom = this.createTokenData(this.CONSUME(L.From));
              const file = this.SUBRULE1(this.string);
              atoms.push({ kind: "source", name, file, keyword, keywordFrom });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Inline));
              const code = this.SUBRULE2(this.string);
              atoms.push({ kind: "inline", code, keyword });
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Runtime));
              const identifier = this.SUBRULE5(this.identifier);
              atoms.push({ kind: "runtime", identifier, keyword });
            },
          },
        ]);
      });
      this.CONSUME(L.RCurly);

      return { kind: "hook", name, atoms, keyword } as h;
    });
  }

  anonymousQuery = this.RULE("anonymousQuery", (): AnonymousQuery => {
    const atoms: AnonymousQuery["atoms"] = [];
    const keyword = this.createTokenData(this.CONSUME(L.Query));
    this.CONSUME(L.LCurly);
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => {
        this.OR([
          {
            ALT: () => {
              atoms.push(this.SUBRULE(this.queryAtom));
            },
          },
          {
            ALT: () => {
              const keyword = this.createTokenData(this.CONSUME(L.Select));
              const select = this.SUBRULE(this.select);
              atoms.push({ kind: "select", select, keyword });
            },
          },
        ]);
      },
    });
    this.CONSUME(L.RCurly);
    return { kind: "anonymousQuery", atoms, keyword, type: Type.any };
  });

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
              this.CONSUME(L.Colon);
              const expr = this.SUBRULE(this.expr);
              return { kind: "long", name, expr };
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
  expr = this.RULE("expr", (): Expr => {
    return this.SUBRULE(this.orExpr);
  });

  primaryExpr = this.RULE("primaryExpr", (): Expr => {
    return this.OR<Expr>([
      { ALT: () => this.SUBRULE(this.fnExpr) },
      { ALT: () => this.SUBRULE(this.groupExpr) },
      { ALT: () => this.SUBRULE(this.arrayExpr) },
      { ALT: () => this.SUBRULE(this.notExpr) },
      {
        ALT: () => {
          const literal = this.SUBRULE(this.literal);
          return {
            kind: "literal",
            literal,
            sourcePos: literal.token,
            type: Type.any,
          };
        },
      },
      {
        ALT: () => {
          const path = this.SUBRULE(this.identifierRefPath);
          const sourcePos = this.ACTION(() => ({
            start: path.at(0)!.token.start,
            end: path.at(-1)!.token.end,
            filename: this.filename,
          }));
          return { kind: "path", path, sourcePos, type: Type.any };
        },
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
    const rRound = this.createTokenData(this.CONSUME(L.RRound));
    const sourcePos = this.ACTION(() => ({
      start: name.token.start,
      end: rRound.end,
      filename: this.filename,
    }));
    return { kind: "function", name, args, sourcePos, type: Type.any };
  });

  groupExpr = this.RULE("groupExpr", (): Expr => {
    const lRound = this.createTokenData(this.CONSUME(L.LRound));
    const expr = this.SUBRULE(this.expr);
    const rRound = this.createTokenData(this.CONSUME(L.RRound));
    const sourcePos = this.ACTION(() => ({
      start: lRound.start,
      end: rRound.end,
      filename: this.filename,
    }));
    return { kind: "group", expr, sourcePos, type: Type.any };
  });

  arrayExpr = this.RULE("arrayExpr", (): Expr => {
    const elements: Expr[] = [];
    const lSquare = this.createTokenData(this.CONSUME(L.LSquare));
    this.MANY_SEP({
      SEP: L.Comma,
      DEF: () => elements.push(this.SUBRULE(this.expr)),
    });
    const rSquare = this.createTokenData(this.CONSUME(L.RSquare));
    const sourcePos = this.ACTION(() => ({
      start: lSquare.start,
      end: rSquare.end,
      filename: this.filename,
    }));
    return { kind: "array", elements, sourcePos, type: Type.any };
  });

  notExpr = this.RULE("notExpr", (): Expr => {
    const keyword = this.createTokenData(this.CONSUME(L.Not));
    const expr = this.SUBRULE(this.primaryExpr);
    const sourcePos = this.ACTION(() => ({
      start: keyword.start,
      end: expr.sourcePos.end,
      filename: this.filename,
    }));
    return { kind: "unary", operator: "not", expr, keyword, sourcePos, type: Type.any };
  });

  inOperator = this.RULE("inOperator", (): IToken[] => {
    const not_ = this.OPTION(() => this.CONSUME(L.Not));
    const in_ = this.CONSUME(L.In);
    return not_ ? [not_, in_] : [in_];
  });

  isOperator = this.RULE("isNotOperator", (): IToken[] => {
    const is_ = this.CONSUME(L.Is);
    const not_ = this.OPTION(() => this.CONSUME(L.Not));
    return not_ ? [is_, not_] : [is_];
  });

  mulExpr = this.GENERATE_BINARY_OPERATOR("mulExpr", this.primaryExpr, [L.Mul, L.Div]);
  addExpr = this.GENERATE_BINARY_OPERATOR("addExpr", this.mulExpr, [L.Add, L.Sub]);
  cmpExpr = this.GENERATE_BINARY_OPERATOR("cmpExpr", this.addExpr, [L.Gt, L.Gte, L.Lt, L.Lte]);
  inExpr = this.GENERATE_BINARY_OPERATOR("inExpr", this.cmpExpr, this.inOperator);
  isExpr = this.GENERATE_BINARY_OPERATOR("isExpr", this.inExpr, this.isOperator);
  andExpr = this.GENERATE_BINARY_OPERATOR("andExpr", this.isExpr, [L.And]);
  orExpr = this.GENERATE_BINARY_OPERATOR("orExpr", this.andExpr, [L.Or]);

  GENERATE_BINARY_OPERATOR(
    name: string,
    next: ParserMethod<[], Expr>,
    operator: TokenType[] | ParserMethod<[], IToken[]>
  ): ParserMethod<[], Expr> {
    return this.RULE(name, (): Expr => {
      let lhs = this.SUBRULE1(next);
      this.MANY(() => {
        const operatorTokens = Array.isArray(operator)
          ? [this.OR(operator.map((t) => ({ ALT: () => this.CONSUME(t) })))]
          : this.SUBRULE(operator);

        const rhs = this.SUBRULE2(next);

        const operatorData = this.ACTION(() => {
          const keyword = this.createTokenData(...operatorTokens);
          const operator = operatorTokens.map((t) => t.image).join(" ") as BinaryOperator;
          const sourcePos = {
            start: lhs.sourcePos.start,
            end: rhs.sourcePos.end,
            filename: this.filename,
          };
          return { sourcePos, keyword, operator };
        });

        lhs = { kind: "binary", ...operatorData, lhs, rhs, type: Type.any };
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
    const token = this.createTokenData(t);
    return { kind: "integer", value, token };
  });
  float = this.RULE("float", (): FloatLiteral => {
    const t = this.CONSUME(L.Float);
    const value = this.ACTION(() => parseFloat(t.image));
    const token = this.createTokenData(t);
    return { kind: "float", value, token };
  });
  boolean = this.RULE("boolean", (): BooleanLiteral => {
    const consumeBoolean = (value: boolean): BooleanLiteral => {
      const token = this.createTokenData(this.CONSUME(value ? L.True : L.False));
      return { kind: "boolean", value, token };
    };
    return this.OR([{ ALT: () => consumeBoolean(true) }, { ALT: () => consumeBoolean(false) }]);
  });
  null = this.RULE("null", (): NullLiteral => {
    const token = this.createTokenData(this.CONSUME(L.Null));
    return { kind: "null", value: null, token };
  });
  string = this.RULE("string", (): StringLiteral => {
    const t = this.CONSUME(L.String);
    const value = this.ACTION(() => JSON.parse(t.image));
    const token = this.createTokenData(t);
    return { kind: "string", value, token };
  });

  identifier = this.RULE("identifier", (): Identifier => {
    const token = this.CONSUME(L.Identifier);
    return { text: token.image, token: this.createTokenData(token) };
  });

  identifierRef = this.RULE(
    "identifierRef",
    (): Identifier & { type: Type; isDefinition: false } => {
      const identifier = this.SUBRULE(this.identifier);
      return { ...identifier, type: Type.any, isDefinition: false };
    }
  );

  identifierDef = this.RULE("identifierDef", (): IdentifierRef<never> => {
    const identifier = this.SUBRULE(this.identifier);
    return { ...identifier, type: Type.any, isDefinition: true };
  });

  identifierRefPath = this.RULE("identifierRefPath", (): IdentifierRef<never>[] => {
    const identifiers: IdentifierRef<never>[] = [];

    identifiers.push(this.SUBRULE1(this.identifierRef));
    this.MANY(() => {
      this.CONSUME(L.Dot);
      identifiers.push(this.SUBRULE2(this.identifierRef));
    });

    return identifiers;
  });

  identifierDefPath = this.RULE("identifierDefPath", (): IdentifierRef<never>[] => {
    const identifiers: IdentifierRef<never>[] = [];

    identifiers.push(this.SUBRULE1(this.identifierDef));
    this.MANY(() => {
      this.CONSUME(L.Dot);
      identifiers.push(this.SUBRULE2(this.identifierDef));
    });

    return identifiers;
  });
}

export const parser = new GaudiParser();
