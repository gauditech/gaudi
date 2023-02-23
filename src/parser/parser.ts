import grammar from "@src/parser/grammar/gaudi.ohm-bundle";
import {
  AST,
  ActionAtomAST,
  ActionBodyAST,
  ActionKindAST,
  BinaryOperator,
  ComputedAST,
  EndpointAST,
  EndpointBodyAST,
  EndpointCardinality,
  EndpointMethod,
  EndpointTypeAST,
  EntrypointAST,
  EntrypointBodyAST,
  ExecutionRuntimeAST,
  ExecutionRuntimeBodyAtomAST,
  ExpAST,
  FieldAST,
  FieldBodyAST,
  FieldTag,
  HookAST,
  HookBodyAST,
  HookQueryAST,
  InputFieldAST,
  InputFieldOptAST,
  ModelAST,
  PopulateAST,
  PopulateBodyAST,
  PopulatorAST,
  QueryAST,
  QueryBodyAST,
  QueryOrderAST,
  ReferenceAST,
  ReferenceBodyAST,
  ReferenceTag,
  RelationAST,
  RelationBodyAST,
  RepeaterAST,
  RepeaterAtomAST,
  SelectAST,
  ValidatorAST,
  VirtualInputAtomAST,
} from "@src/types/ast";

export function parse(input: string): AST {
  const m = grammar.match(input);
  if (!m.succeeded()) {
    throw Error(m.message);
  }

  const ast: AST = semantics(m).parse();

  return ast;
}

const semantics = grammar.createSemantics();

semantics.addOperation("parse()", {
  Definition(definitions) {
    return definitions.parse();
  },
  Model(this, auth, _model, identifierAs, _parenL, body, _parenR): ModelAST {
    const isAuth = auth.numChildren > 0;
    const [name, alias] = identifierAs.parse();
    return { kind: "model", name, alias, body: body.parse(), isAuth, interval: this.source };
  },
  Field(this, _field, identifier, _parenL, body, _parenR): FieldAST {
    return {
      kind: "field",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  FieldBody_type(this, _type, identifier): FieldBodyAST {
    return { kind: "type", type: identifier.parse(), interval: this.source };
  },
  FieldBody_default(this, _default, literal): FieldBodyAST {
    return { kind: "default", default: literal.parse(), interval: this.source };
  },
  FieldBody_tag(this, tag): FieldBodyAST {
    return { kind: "tag", tag: tag.sourceString as FieldTag, interval: this.source };
  },
  FieldBody_validate(this, _validate, _parenL, body, _parenR): FieldBodyAST {
    return { kind: "validate", validators: body.parse(), interval: this.source };
  },
  Validator_hook(this, hook): ValidatorAST {
    return {
      kind: "hook",
      hook: hook.parse(),
      interval: this.source,
    };
  },
  Validator_builtin(this, name, args): ValidatorAST {
    return {
      kind: "builtin",
      name: name.parse(),
      args: args.children.map((c) => c.parse()),
      interval: this.source,
    };
  },
  Reference(this, _reference, identifier, _parenL, body, _parenR): ReferenceAST {
    return {
      kind: "reference",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  ReferenceBody_to(this, _to, identifier): ReferenceBodyAST {
    return { kind: "to", to: identifier.parse(), interval: this.source };
  },
  ReferenceBody_tag(this, tag): ReferenceBodyAST {
    return { kind: "tag", tag: tag.sourceString as ReferenceTag, interval: this.source };
  },
  Relation(this, _relation, identifier, _parenL, body, _parenR): RelationAST {
    return {
      kind: "relation",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  RelationBody_from(this, _from, identifier): RelationBodyAST {
    return { kind: "from", from: identifier.parse(), interval: this.source };
  },
  RelationBody_through(this, _from, identifier): RelationBodyAST {
    return { kind: "through", through: identifier.parse(), interval: this.source };
  },
  Query(this, _query, identifier, _parenL, body, _parenR): QueryAST {
    return {
      kind: "query",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  QueryBody_from(this, _from, identifierAs): QueryBodyAST {
    const [from, alias] = identifierAs.parse();
    return { kind: "from", from, alias, interval: this.source };
  },
  QueryBody_filter(this, _filter, exp): QueryBodyAST {
    return { kind: "filter", filter: exp.parse(), interval: this.source };
  },
  QueryBody_order_by(this, _order, _by, fields): QueryBodyAST {
    return { kind: "orderBy", orderings: fields.parse(), interval: this.source };
  },
  QueryBody_limit(this, _limit, limit): QueryBodyAST {
    return { kind: "limit", limit: limit.parse(), interval: this.source };
  },
  QueryBody_offset(this, _offset, offset): QueryBodyAST {
    return { kind: "offset", offset: offset.parse(), interval: this.source };
  },
  QueryBody_select(this, _select, select): QueryBodyAST {
    return { kind: "select", select: select.parse(), interval: this.source };
  },
  QueryBody_aggregate(this, name): QueryBodyAST {
    return { kind: "aggregate", name: name.sourceString };
  },
  QueryOrder(this, field, orderNode): QueryOrderAST {
    const order =
      orderNode.sourceString === "asc"
        ? "asc"
        : orderNode.sourceString === "desc"
        ? "desc"
        : undefined;
    return { field: field.parse(), order, interval: this.source };
  },
  Computed(this, _computed, identifier, _parenL, exp, _parenR): ComputedAST {
    return {
      kind: "computed",
      name: identifier.parse(),
      exp: exp.parse(),
      interval: this.source,
    };
  },
  OrExp_or(this, lhs, _or, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "or",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  AndExp_and(this, lhs, _and, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "and",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  IsExp_is_not(this, lhs, _is, _not, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "is not",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  IsExp_is(this, lhs, _is, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "is",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  InExp_not_in(this, lhs, _not, _in, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "not in",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  InExp_in(this, lhs, _in, rhs): ExpAST {
    return {
      kind: "binary",
      operator: "in",
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  OpExp_operator(this, lhs, op, rhs): ExpAST {
    return {
      kind: "binary",
      operator: op.sourceString as BinaryOperator,
      lhs: lhs.parse(),
      rhs: rhs.parse(),
      interval: this.source,
    };
  },
  FnExp_fn(this, identifier, _parenL, args, _parenR): ExpAST {
    return {
      kind: "function",
      name: identifier.parse(),
      args: args.parse(),
    };
  },
  PrimaryExp_paren(this, _parenL, exp, _parenR): ExpAST {
    return { kind: "paren", exp: exp.parse(), interval: this.source };
  },
  PrimaryExp_not(this, _not, exp): ExpAST {
    return { kind: "unary", operator: "not", exp: exp.parse(), interval: this.source };
  },
  PrimaryExp_identifier(this, identifier): ExpAST {
    return { kind: "identifier", identifier: identifier.parse(), interval: this.source };
  },
  PrimaryExp_literal(this, literal): ExpAST {
    return { kind: "literal", literal: literal.parse(), interval: this.source };
  },
  Entrypoint(this, _entrypoint, identifier, _braceL, body, _braceR): EntrypointAST {
    return {
      kind: "entrypoint",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  EntrypointBody_target(this, _target, kind, identifierAs): EntrypointBodyAST {
    const [identifier, alias] = identifierAs.parse();
    return {
      kind: "target",
      target: { kind: kind.sourceString as "model" | "relation", identifier, alias },
      interval: this.source,
    };
  },
  EntrypointBody_identify(this, _identify, _with, identifier): EntrypointBodyAST {
    return { kind: "identify", identifier: identifier.parse(), interval: this.source };
  },
  EntrypointBody_response(this, _response, body): EntrypointBodyAST {
    return { kind: "response", select: body.parse(), interval: this.source };
  },
  EntrypointBody_authorize(this, _authorize, _braceL, body, _braceR): EntrypointBodyAST {
    return { kind: "authorize", expression: body.parse(), interval: this.source };
  },
  EntrypointBody_endpoint(this, endpoint): EntrypointBodyAST {
    return { kind: "endpoint", endpoint: endpoint.parse() };
  },
  EntrypointBody_entrypoint(this, entrypoint): EntrypointBodyAST {
    return { kind: "entrypoint", entrypoint: entrypoint.parse() };
  },
  SelectBody(this, _braceL, body, _braceR): SelectAST {
    return { select: Object.fromEntries(body.parse()), interval: this.source };
  },
  Select_nested(this, name, nested): [string, SelectAST] {
    return [name.parse(), nested.parse()];
  },
  Select_single(this, name): [string, SelectAST] {
    return [name.parse(), { interval: this.source }];
  },
  Endpoint(this, endpointType, _endpoint, _braceL, body, _braceR): EndpointAST {
    return {
      type: endpointType.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  EndpointType(endpointType): EndpointTypeAST {
    return endpointType.sourceString as EndpointTypeAST;
  },
  EndpointBody_action_block(this, _action, _braceL, body, _braceR): EndpointBodyAST {
    return { kind: "action-block", atoms: body.parse(), interval: this.source };
  },
  EndpointBody_authorize(this, _authorize, _braceL, body, _braceR): EndpointBodyAST {
    return { kind: "authorize", expression: body.parse(), interval: this.source };
  },

  EndpointBody_cardinality(this, _cardinality, value): EndpointBodyAST {
    return {
      kind: "cardinality",
      value: value.sourceString as EndpointCardinality,
      interval: this.source,
    };
  },
  EndpointBody_method(this, _cardinality, value): EndpointBodyAST {
    return { kind: "method", value: value.sourceString as EndpointMethod, interval: this.source };
  },
  EndpointBody_path(this, _cardinality, value): EndpointBodyAST {
    return { kind: "path", value: value.parse(), interval: this.source };
  },

  Hook(this, _hook, identifier, _braceL, body, _braceR): HookAST {
    return {
      kind: "hook",
      name: identifier.numChildren > 0 ? identifier.child(0).parse() : undefined,
      body: body.parse(),
      interval: this.source,
    };
  },
  HookBody_argument_default(this, _default, _arg, identifier): HookBodyAST {
    return {
      kind: "arg",
      name: identifier.parse(),
      value: { kind: "default" },
      interval: this.source,
    };
  },
  HookBody_argument_query(this, _arg, identifier, query): HookBodyAST {
    return {
      kind: "arg",
      name: identifier.parse(),
      value: { kind: "query", query: query.parse() },
      interval: this.source,
    };
  },
  HookBody_argument_expression(this, _arg, identifier, exp): HookBodyAST {
    return {
      kind: "arg",
      name: identifier.parse(),
      value: { kind: "expression", exp: exp.parse() },
      interval: this.source,
    };
  },
  HookBody_return_type(this, _returns, identifier): HookBodyAST {
    return { kind: "returnType", type: identifier.parse(), interval: this.source };
  },
  HookBody_source(this, _source, target, _from, file): HookBodyAST {
    return { kind: "source", target: target.parse(), file: file.parse(), interval: this.source };
  },
  HookBody_inline(this, _inline, inlineString): HookBodyAST {
    return { kind: "inline", inline: inlineString.parse(), interval: this.source };
  },
  HookBody_executionRuntime(this, _runtime, name): HookBodyAST {
    return {
      kind: "execution-runtime",
      name: name.parse(),
      interval: this.source,
    };
  },
  HookQuery(this, _query, _parenL, body, _parenR): HookQueryAST {
    return {
      kind: "query",
      body: body.parse(),
      interval: this.source,
    };
  },
  ActionBody_default(this, kind, _braceL, body, _braceR): ActionBodyAST {
    return {
      kind: kind.sourceString as ActionKindAST,
      atoms: body.parse(),
      interval: this.source,
    };
  },
  ActionBody_named(this, kind, name, _braceL, body, _braceR): ActionBodyAST {
    return {
      kind: kind.sourceString as ActionKindAST,
      target: name.parse(),
      atoms: body.parse(),
      interval: this.source,
    };
  },
  ActionBody_aliased(this, kind, name, _as, alias, _braceL, body, _braceR): ActionBodyAST {
    return {
      kind: kind.sourceString as ActionKindAST,
      target: name.parse(),
      alias: alias.parse(),
      atoms: body.parse(),
      interval: this.source,
    };
  },
  ActionAtomBody_set_hook(this, _set, identifier, hook): ActionAtomAST {
    return {
      kind: "set",
      target: identifier.parse(),
      set: { kind: "hook", hook: hook.parse() },
      interval: this.source,
    };
  },
  ActionAtomBody_set_expression(this, _set, identifier, exp): ActionAtomAST {
    return {
      kind: "set",
      target: identifier.parse(),
      set: { kind: "expression", exp: exp.parse() },
    };
  },
  ActionAtomBody_reference(this, _reference, identifier, _through, through): ActionAtomAST {
    return {
      kind: "reference",
      target: identifier.parse(),
      through: through.parse(),
      interval: this.source,
    };
  },
  ActionAtomBody_input(this, _input, _braceL, atoms, _braceR): ActionAtomAST {
    return {
      kind: "input",
      fields: atoms.parse(),
    };
  },
  ActionAtomBody_deny(this, _deny, body) {
    return {
      kind: "deny",
      fields: body.parse(),
    };
  },
  ActionAtomBody_hook(this, body): ActionAtomAST {
    return {
      kind: "hook",
      hook: body.parse(),
    };
  },
  ActionAtomBody_nested_action(this, action): ActionAtomAST {
    return {
      kind: "action",
      body: action.parse(),
    };
  },
  ActionAtomBody_virtual_input(this, _kw, identifier, _bL, body, _bR): ActionAtomAST {
    return {
      kind: "virtual-input",
      name: identifier.parse(),
      atoms: body.parse(),
      interval: this.source,
    };
  },
  ActionAtomBody_responds(this, _responds): ActionAtomAST {
    return {
      kind: "responds",
    };
  },
  VirtualInputBody_type(this, _type, type): VirtualInputAtomAST {
    return { kind: "type", type: type.parse() };
  },
  VirtualInputBody_optional(this, _kw): VirtualInputAtomAST {
    return { kind: "optional" };
  },
  VirtualInputBody_nullable(this, _nullable): VirtualInputAtomAST {
    return { kind: "nullable" };
  },
  VirtualInputBody_validate(this, _keyword, _bL, validator, _bR): VirtualInputAtomAST {
    return { kind: "validate", validators: validator.parse() };
  },
  ActionInputAtom_field(this, name): InputFieldAST {
    return { name: name.parse(), opts: [] };
  },
  ActionInputAtom_field_with_opts(this, name, _braceL, opts, _braceR): InputFieldAST {
    return { name: name.parse(), opts: opts.parse() };
  },
  ActionInputOpt_optional(this, _opt): InputFieldOptAST {
    return { kind: "optional" };
  },
  ActionInputOpt_default_value(this, _default, identifierPath): InputFieldOptAST {
    return { kind: "default-value", value: identifierPath.parse() };
  },
  ActionInputOpt_default_reference(this, _default, path): InputFieldOptAST {
    return { kind: "default-reference", path: path.parse() };
  },
  DenyList_all(this, _asteriks) {
    return "*";
  },
  DenyList_some(this, _braceL, fields, _braceR) {
    return fields.parse();
  },
  IdentifierPath(this, head, _dot, tail): string[] {
    return [head.parse(), ...tail.children.map((child) => child.parse())];
  },
  IdentifierWithAs_identifier(this, identifier) {
    return [identifier.parse(), undefined];
  },
  IdentifierWithAs_identifier_as(this, identifier, _as, alias) {
    return [identifier.parse(), alias.parse()];
  },
  IdentifierPathWithAs_identifier(this, identifier) {
    return [identifier.parse(), undefined];
  },
  IdentifierPathWithAs_identifier_as(this, identifier, _as, alias) {
    return [identifier.parse(), alias.parse()];
  },
  null(_null) {
    return null;
  },
  boolean(boolean) {
    return boolean.sourceString === "true";
  },
  integer(this, _integer) {
    return parseInt(this.sourceString);
  },
  float(this, _floatMajor, _dot, _floatMinor) {
    return parseFloat(this.sourceString);
  },
  string(_openQuote, string, _closeQuote) {
    return string.sourceString;
  },
  multiLineString(this, _tickL, body, _tickR): string {
    return body.sourceString;
  },
  identifier(this, _letter, _alnum) {
    return this.sourceString;
  },
  OptionalBraces_no_braces(exp) {
    return exp.parse();
  },
  OptionalBraces_braces(_braceL, exp, _braceR) {
    return exp.parse();
  },
  NewlineBody_empty() {
    return [];
  },
  NonemptyNewlineBody(head, _delimiter, tail, _delimiterTail) {
    return [head.parse(), ...tail.children.map((child) => child.parse())];
  },
  NonemptyListOf(this, head, _seperator, tail) {
    return [head.parse(), ...tail.children.map((c) => c.parse())];
  },

  Populator(this, _populator, identifier, _braceL, body, _braceR): PopulatorAST {
    return {
      kind: "populator",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  Populate(this, _keyword, identifier, _braceL, body, _braceR): PopulateAST {
    return {
      kind: "populate",
      name: identifier.parse(),
      body: body.parse(),
      interval: this.source,
    };
  },
  PopulateBody_target(this, _target, kind, identifierAs): PopulateBodyAST {
    const [identifier, alias] = identifierAs.parse();
    return {
      kind: "target",
      target: { kind: kind.sourceString as "model" | "relation", identifier, alias },
      interval: this.source,
    };
  },
  PopulateBody_identify(this, _identify, _with, identifier): PopulateBodyAST {
    return {
      kind: "identify",
      identifier: identifier.parse(),
      interval: this.source,
    };
  },
  PopulateBody_repeat(this, _identifier, repeat): PopulateBodyAST {
    return {
      kind: "repeat",
      repeat: repeat.parse(),
      interval: this.source,
    };
  },
  PopulateBody_set_hook(this, _set, identifier, hook): PopulateBodyAST {
    return {
      kind: "set",
      target: identifier.parse(),
      set: { kind: "hook", hook: hook.parse() },
      interval: this.source,
    };
  },
  PopulateBody_set_expression(this, _set, identifier, exp): PopulateBodyAST {
    return {
      kind: "set",
      target: identifier.parse(),
      set: { kind: "expression", exp: exp.parse() },
    };
  },
  PopulateBody_populate(this, populate): PopulateBodyAST {
    return {
      kind: "populate",
      populate: populate.parse(),
      // interval: this.source
    };
  },
  Repeater_aliased(this, body, _as, alias): RepeaterAST {
    return {
      alias: alias.parse(),
      atoms: body.parse(),
      interval: this.source,
    };
  },
  Repeater_anonymous(this, body): RepeaterAST {
    return {
      atoms: body.parse(),
      interval: this.source,
    };
  },
  RepeaterBody_fixed(this, atom): RepeaterAtomAST[] {
    return [
      {
        kind: "fixed",
        value: atom.parse(),
        interval: this.source,
      },
    ];
  },
  RepeaterBody_range(this, _lbrace, atoms, _rbrace): RepeaterAtomAST[] {
    return atoms.parse();
  },
  RepeaterRangeAtom_limits(this, boundary, interval): RepeaterAtomAST {
    return {
      kind: boundary.sourceString as "start" | "end",
      value: interval.parse(),
    };
  },

  // ----- Execution Runtime

  ExecutionRuntime(this, _runtime, name, _lbrace, body, _rbrace): ExecutionRuntimeAST {
    return {
      kind: "execution-runtime",
      name: name.sourceString,
      body: body.parse(),
      interval: this.source,
    };
  },

  ExecutionRuntimeBody_sourcePath(this, _hookPath, value): ExecutionRuntimeBodyAtomAST {
    return {
      kind: "sourcePath",
      value: value.parse(),
    };
  },

  ExecutionRuntimeBody_default(this, _hookPath): ExecutionRuntimeBodyAtomAST {
    return {
      kind: "default",
    };
  },
});
