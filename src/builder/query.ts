import { source } from "common-tags";
import _ from "lodash";

import { Ref, getModelProp, getRef, getTargetModel } from "@src/common/refs";
import { ensureEqual } from "@src/common/utils";
import { BinaryOperator } from "@src/types/ast";
import {
  Definition,
  EndpointDef,
  FilterDef,
  ModelDef,
  ReferenceDef,
  RelationDef,
  SelectConstantItem,
  SelectDef,
  SelectFieldItem,
  SelectableItem,
  TargetDef,
} from "@src/types/definition";

type Queryable = {
  modelRefKey: string;
  joins: Join[];
  filter: FilterDef;
  select: SelectableItem[];
};

type Join = {
  name: string;
  namePath: string[];
  kind: "relation" | "reference" | "query";
  refKey: string;
  joinType: "inner" | "left";
  on: FilterDef;
  joins: Join[];
};

export function buildEndpointContextSql(def: Definition, endpoint: EndpointDef): string | null {
  const exists: SelectConstantItem = {
    kind: "constant",
    type: "integer",
    value: 1,
    alias: "exists",
  };
  switch (endpoint.kind) {
    case "create":
    case "list": {
      const q = queryableFromEndpointTargets(def, _.initial(endpoint.targets), [exists], "multi");
      return q && queryableToString(def, q);
    }
    case "get":
    case "update": {
      const fields = endpoint.response.filter((s): s is SelectFieldItem => s.kind === "field");
      return buildEndpointTargetSql(def, endpoint.targets, fields, "single");
    }
    case "delete": {
      return buildEndpointTargetSql(def, endpoint.targets, [exists], "single");
    }
  }
}

export function selectToSelectable(select: SelectDef): SelectableItem[] {
  return select.filter((s): s is SelectableItem => s.kind === "field" || s.kind === "constant");
}

export function buildEndpointTargetSql(
  def: Definition,
  targets: TargetDef[],
  select: SelectableItem[],
  mode: "single" | "multi"
): string {
  const q = queryableFromEndpointTargets(def, targets, select, mode);
  if (!q) {
    throw new Error(`Unable to build queryable record! Check targets.`);
  }
  return queryableToString(def, q);
}

export function queryableFromEndpointTargets(
  def: Definition,
  targets: TargetDef[],
  select: SelectableItem[],
  mode: "single" | "multi"
): Queryable | null {
  if (!targets.length) return null;

  const [target, ...rest] = targets;
  const shouldFilterByIdentity = rest.length > 0 || mode === "single";
  return {
    modelRefKey: target.refKey,
    filter: shouldFilterByIdentity
      ? {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [target.name, target.identifyWith.name] },
          rhs: {
            kind: "variable",
            type: target.identifyWith.type,
            name: target.identifyWith.paramName,
          },
        }
      : undefined,
    joins: queryableJoins(def, rest, [target.name], mode),
    select,
  };
}

export type PathParam = { path: string; params: { name: string; type: "integer" | "text" }[] };

export function buildEndpointPath(endpoint: EndpointDef): PathParam {
  const pairs = endpoint.targets.map((target) => ({
    name: target.name.toLowerCase(),
    param: { name: target.identifyWith.paramName, type: target.identifyWith.type },
  }));
  switch (endpoint.kind) {
    case "get":
    case "update":
    case "delete":
      return {
        path: [
          "", // add leading slash
          ...pairs.map(({ name, param }) => [name, `:${param.name}`].join("/")),
        ].join("/"),
        params: pairs.map(({ param }) => param),
      };
    case "list":
    case "create":
      return {
        path: [
          "", // add leading slash
          ...pairs
            .slice(0, pairs.length - 1)
            .map(({ name, param }) => [name, `:${param.name}`].join("/")),
          pairs[pairs.length - 1].name,
        ].join("/"),
        params: pairs.slice(0, pairs.length - 1).map(({ param }) => param),
      };
  }
}
function queryableJoins(
  def: Definition,
  targets: TargetDef[],
  parentNamePath: string[],
  mode: "single" | "multi"
): Join[] {
  if (!targets.length) return [];
  const [target, ...rest] = targets;
  if (target.kind === "model") throw new Error(`Cannot join with models!`);
  const namePath = [...parentNamePath, target.name];
  const joinNames = getJoinNames(def, target.refKey);
  const shouldFilterByIdentity = rest.length > 0 || mode === "single";

  const joinFilter: FilterDef = {
    kind: "binary",
    operator: "is",
    lhs: { kind: "alias", namePath: [...parentNamePath, joinNames.that] },
    rhs: { kind: "alias", namePath: [...namePath, joinNames.this] },
  };
  const onFilter: FilterDef = shouldFilterByIdentity
    ? {
        kind: "binary",
        operator: "and",
        lhs: joinFilter,
        rhs: {
          kind: "binary",
          operator: "is",
          lhs: { kind: "alias", namePath: [...namePath, target.identifyWith.name] },
          rhs: {
            kind: "variable",
            type: target.identifyWith.type,
            name: target.identifyWith.paramName,
          },
        },
      }
    : joinFilter;

  return [
    {
      name: target.name,
      refKey: target.refKey,
      namePath,
      kind: target.kind,
      joinType: "inner",
      on: onFilter,
      joins: queryableJoins(def, rest, namePath, mode),
    },
  ];
}

function getJoinNames(def: Definition, refKey: string): { this: string; that: string } {
  const prop = getRef(def, refKey);
  switch (prop.kind) {
    case "reference": {
      const reference = prop.value as ReferenceDef;
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { this: field.name, that: refField.name };
    }
    case "relation": {
      const relation = prop.value as RelationDef;
      const { value: reference } = getRef<"reference">(def, relation.throughRefKey);
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      const { value: refField } = getRef<"field">(def, reference.toModelFieldRefKey);

      return { this: field.name, that: refField.name };
    }
    default:
      throw new Error(`Kind ${prop.kind} not supported`);
  }
}

function toAlias(np: string[]): string {
  return `"${np.join(".")}"`;
}

function filterToString(filter: FilterDef): string {
  if (filter === undefined) return "true = true";
  switch (filter.kind) {
    case "literal": {
      switch (filter.type) {
        case "boolean":
          return filter.value ? "TRUE" : "FALSE";
        case "null":
          return "NULL";
        case "text":
          return `'${filter.value}'`;
        case "integer":
          return filter.value.toString();
      }
    }
    // Due to bug in eslint/prettier, linter complains that `break` is expected in the case "literal"
    // Since inner switch is exaustive, break is unreachable so prettier deletes it
    // eslint-disable-next-line no-fallthrough
    case "alias": {
      const np = filter.namePath.slice(0, filter.namePath.length - 1);
      const f = filter.namePath.at(filter.namePath.length - 1);
      return `${toAlias(np)}.${f}`;
    }
    case "binary": {
      return `(${filterToString(filter.lhs)} ${opToString(filter.operator)} ${filterToString(
        filter.rhs
      )})`;
    }
    case "variable": {
      return `:${filter.name}`;
    }
  }
}

function opToString(op: BinaryOperator): string {
  switch (op) {
    case "is":
      return "=";
    default:
      return op.toUpperCase();
  }
}

function joinToString(def: Definition, join: Join): string {
  const model = getTargetModel(def.models, join.refKey);
  const joinMode = join.joinType === "inner" ? "JOIN" : "LEFT JOIN";
  return source`
  ${joinMode} ${model.dbname} AS ${toAlias(join.namePath)}
  ON ${filterToString(join.on)}
  ${join.joins.map((j) => joinToString(def, j))}`;
}

function selectToString(def: Definition, select: SelectableItem[]) {
  return select
    .map((item) => {
      switch (item.kind) {
        case "field": {
          const { value: field } = getRef<"field">(def, item.refKey);
          return `${toAlias(_.initial(item.namePath))}.${field.dbname} AS ${item.alias}`;
        }
        case "constant": {
          // FIXME security issue, this is not an escaped value!!
          ensureEqual(item.type, "integer");
          return `${item.value} AS "${item.alias}"`;
        }
      }
    })
    .join(", ");
}

export function queryableToString(def: Definition, q: Queryable): string {
  const { value: model } = getRef<"model">(def, q.modelRefKey);
  return source`
    SELECT ${selectToString(def, q.select)}
    FROM ${model.dbname} as ${toAlias([model.name])}
    ${q.joins.map((j) => joinToString(def, j))}
    WHERE ${filterToString(q.filter)};
  `;
}

/*
-- Unused functions, but may be used for dev/testing/debugging.
 */

function _queryableSelectAll(def: Definition, q: Queryable): string {
  const { value: model } = getRef<"model">(def, q.modelRefKey);
  const fieldSels = model.fields.map(
    (f) => `${toAlias([model.name])}.${f.dbname} AS ${toAlias([model.name, f.name])}`
  );
  const joinSels = q.joins.map((j) => _joinSelectAll(def, j));
  return [...fieldSels, ...joinSels].join(",");
}

function _joinSelectAll(def: Definition, j: Join): string {
  const model = getTargetModel(def.models, j.refKey);
  return model.fields
    .map((f) => `${toAlias(j.namePath)}.${f.dbname} AS ${toAlias([...j.namePath, f.name])}`)
    .join(",");
}

/**
 * Second attempt. Filters included.
 */

export function buildContextQueryable(def: Definition, targets: TargetDef[]): Queryable | null {
  // this is a "multi" builder, don't fetch leaf target, as it's fetched in a separate query

  // if this is root level endpoint, there is no context to fetch
  if (targets.length <= 1) {
    return null;
  }
  return buildTargetQueryable(def, _.initial(targets));
}

export function buildTargetQueryable(def: Definition, targets: TargetDef[]): Queryable {
  // this is a "single" builder, let's just join all the `join` stuff together

  // assumes there's at least 1 target
  const rootTarget = targets[0];
  const { value: model } = getRef<"model">(def, rootTarget.refKey);
  const allFilterPaths = targets.flatMap((t) => getFilterPaths(t.filter));
  const fromPath = _.last(targets)!.namePath;
  const allPaths = _.uniqWith([fromPath, ...allFilterPaths], _.isEqual);
  const relativePaths = allPaths.map(_.tail); // drop context from namespace

  const joins = buildJoins(def, model, [rootTarget.name], relativePaths);

  return {
    modelRefKey: rootTarget.refKey,
    filter: undefined, // TODO read filters from all targets
    joins,
    select: [],
  };
}

function buildJoins(
  def: Definition,
  parent: ModelDef,
  namePathPrefix: string[],
  relativeJoinPaths: string[][]
): Join[] {
  const direct = _.chain(relativeJoinPaths)
    .map((p) => p[0]) // take direct
    .compact() // remove empty paths
    .uniq()
    // .map((name) => buildJoin(def, parentContext, namePath, name))
    .value();

  return direct.map((name): Join => {
    // for each direct join, find relative paths
    const joinPaths = relativeJoinPaths.filter((p) => p[0] === name).map(_.tail);
    // define next context
    const ref = getModelProp<"reference" | "relation" | "query">(parent, name);
    const model = getTargetModel(def.models, ref.value.refKey);

    const joins = buildJoins(def, model, [...namePathPrefix, name], joinPaths);

    return {
      kind: ref.kind,
      refKey: ref.value.refKey,
      name,
      namePath: namePathPrefix,
      joinType: "inner",
      on: undefined,
      joins,
    };
  });
}

function getJoinFilter(
  def: Definition,
  model: ModelDef,
  namePath: string[],
  ref: Ref<"reference" | "relation" | "query">
): FilterDef {
  switch (ref.kind) {
    case "reference": {
      const { value: field } = getRef<"field">(def, ref.value.fieldRefKey);
      return {
        kind: "binary",
        operator: "is",
        lhs: { kind: "alias", namePath: [...namePath, field.name] }, // Org.repos.author_id
        rhs: { kind: "alias", namePath: [...namePath, ref.value.name, "id"] }, // Org.repos.author.id
      };
    }
    case "relation": {
      const { value: reference } = getRef<"reference">(def, ref.value.throughRefKey);
      const { value: field } = getRef<"field">(def, reference.fieldRefKey);
      return {
        kind: "binary",
        operator: "is",
        lhs: { kind: "alias", namePath: [...namePath, "id"] }, // Org.repos.id
        rhs: { kind: "alias", namePath: [...namePath, ref.value.name, field.name] }, // Org.repos.issues.repo_id
      };
    }
    case "query": {
      const model = getTargetModel(def.models, ref.value.retType);
    }
  }
}

/*


SELECT -
FROM org "Org"
JOIN (
  SELECT *
  FROM repo "Org.issues_with_many_commenteers:top_repos:repos"
  JOIN 
  WHERE "Org.issues_with_many_commenteers:top_repos:repos".
) ON "Org".id = "Org.issues_with_many_commenteers:top_repos:repos".org_id


SELECT -
FROM org "Org"
JOIN repo "Org.repos"
  ON "Org".id = "Org.repos".org_id
  AND "Org.repos".is_public IS TRUE

JOIN issues "Org.repos.issues"
  ON "Org.repos".id = "Org.repos.issues".repo_id


model Org {
  relation repos

  query top_repos {
    from repos
    filter { is_public is true }
    order by star_count desc
    limit 5
  }

  query issues_with_many_commenteers {
    from top_repos.public_issues
    filter { comment_count > 1000 }
    order_by comment_count
    limit 5
  }
}

model Repo {
  reference Org
  relation issues
}

model RepoStar {
  reference Repo
  query public_issues {
    from issues
    filter { is_public is true }
  }
}

model Issue {
  reference Repo
  relation comments
}

model Comment {
  reference Issue
}




SELECT *
FROM org "Org"
JOIN (
  SELECT *
  FROM org_membership "Org.recent_memberships:org_membership"
  JOIN users u
    ON om.user_id = u.id
) 
  ON om.org_id = o.id

PROBLEM:
joinPathovi ne uzimaju u obzir da query moze imat svojih hrpu join pathova!
Query se moze prikazivati u:
1. from / targets
2. filterima ako je IN za liste
3. filterima ako je filtrirani reference
4. filterima ako je aggregate
5. filterima ako je FIRST

Kako god, query moze imati deeply nested path putanju (query na query na query...)
to mozemo / moramo rijesiti sa subqueryima ILI ih resolveat - flattenat

from repos.issues
filt author.id == 100
and  @auth in members
- repos, issues
- repos, issues, author
- repos, members




from Org.repos as o.r
filter @auth in o.members # query
    or @auth in r.collaborators # query
    or o.members.id in [1,3,5] <-- this becomes many! count? some?
    or o.members.id in [4,5,6]



 */

function getFilterPaths(filter: FilterDef): string[][] {
  switch (filter?.kind) {
    case undefined:
    case "literal":
    case "variable":
      return [];
    case "alias":
      return [filter.namePath];
    case "binary": {
      return [...getFilterPaths(filter.lhs), ...getFilterPaths(filter.rhs)];
    }
  }
}
