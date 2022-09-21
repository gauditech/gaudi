# Model syntax examples

## Database connection

In `v0`, we will hardcode a connection to local instance running on localhost, port 5433.
`v1` will allow users to provide a database URI for postgresql, following standard format.

```
database {
    engine pg
    uri postgresql://...
}
```

## Model block

```
model User {
    // optional dbname
    dbname users
    // optional list of fields, refs, etc.
}
```

## Fields

### Basic syntax

```
model User {
    field fullName { type text, [params] }
}
```

### Type

```
  field fullName, { type <TYPE> }
```

A type can be one of:

- text
- integer
- boolean
- double
- date
- time
- datetime

We currently have no plans supporting dates/times without the timezone. `decimal` will be added in `v2`.

### Dbname

Like with models, fields accept an optional parameter `dbname`.

```
  field subbed { type boolean, dbname wants_newsletter }
```

### Unique, nullable

A field can optionally be unique, or nullable. If marked as both unique and nullable, by default database will allow multiple NULLs, but guarantee uniqueness for any other value.
By default, fields are **not nullable**. In v1, we want to add a unique support for `LOWER()`. In v2, this will be expanded to other functions (or custom ones).

```
  { type text, unique }
  { type boolean, nullable }
  { type integer, unique, nullable }
  { type text, unique lower }
```

### Default

Fields may be assigned a default value, following a standard database implementation.
NULL can be used as a default as long as field is defined as `nullable`.

```
{ type text, nullable, default null }
{ type text, default '' }
{ type number, default 2000 }
```

### Validators

Fields may define validators using `validate` block. More on validators here (TODO).
Syntax for validate block as follows:

```
field fullName {
  type text
  validate { min 4, max 20 }
}
field email { type text, validate { regex /^[^@]+@[^@]+$/, max 40 }}
```

Here we're using `min`, `max` and `regex` validators.

## References

Reference is a field with a foreign key constraint. It shares most of arguments with field, such as: `unique`, `nullable`, `dbname`, `default null`.
Field's required `type` is not supported, instead `to` param is required, which may only be a model. A model may have a reference to it's own model.

```
model Post {
// simplest form
reference author { to User }

// custom dbname, nullable, default
reference reviewer { to User, nullable, default null }

// one to one with unique keyword
reference extras { to PostExtras, unique }

// self-referencing model
reference parentPost { to Post, nullable, default null }
}

```

`TODO` `onDelete`

## Relations

Relations point to a reference from another side of the link. They have 2 required props, `to <Model>, through <field>` identifying the reference.

```
model User {
    relation posts { from Post through author }
}
model Post {
    reference author { to User }
    // self-reference-relation example
    reference parentPost { to Post }
    relation childPosts { from Post, through parentPost }
}
```

## Queries

Queries let you navigate relation/reference links, filter, aggregate etc. TODO

### Filtering

#### Basic filtering syntax

```
model User {
    relation posts { from Post, through author }
    query archived_posts {
        from posts
        filter { is_archived is true }
    }
}
```

#### Filtering by a boolean value

The following filter expressions are identical.

```
filter { is_archived }
filter { is_archived is true }
```

And these as well.

```
filtered { not is_archived }
filtered { is_archived is not true }
```

#### Numeric comparison

```
filter { age > 21 }
filter { age >= 21 }
filter { age is 21 }
filter { age <= 21 }
filter { age < 21 }
```

In `v1`, date(time) fields behave as numbers.

#### Checking for existance in a set - `in`

```
filter { dayOfMonth in [7, 14, 21, 28] }
filter { dayOfWeek not in [6, 7] }
```

#### Text comparison

```
filter { lower email is 'my@email' }
filter { email is like '%@gaudi.tech' }
filter { email is not like '%@scam% }
```

#### And/or logic

```
filter {
    is_archived is false
    and is_public is true
    or is_important is true }

// you can use parens to manipulate operator precedance
filter { not is_archived and (is_public or is_important) }
```

#### Filtering by nested property

```
filter { author.is_active }
```

#### Multi-field arithmetics

```
filter { score - 100 > initial_score + bonus * 1.4 }
```

### Referencing parent objects

Queries may reference parent objects which have to be labeled using `as`.

`As` on a model:

```
model Post as p {
    reference author { to User }
    reference parent { to Post }
    query selfreplies {
        from parent
        filter { author is p.author }
    }
}
```

`As` on a query's `from`:

```
query members {
    from membership.user as m.u
    filter { m.is_active and u.is_active }
}
```

These assignments can be combined, TODO example.

### Ordering and limiting

```
query latest_issues {
  from issues
  order by { created_at desc }
  limit 10
}
```

.

```

// using as
model User as u {
// filtering relations
query 10_recent_posts {
from posts
filter { created_at > now - 1_week }
order_by { id desc }
limit 10
}

    // filtering other queries
    query newest_post { from 10_recent_posts, first }

    // querying nested properties
    query youngest_reviewer {
        from posts.reviewer
        filter { age is not null }
        order_by { age asc nulls last }
        first
    }

    // `as` syntax
    query latest_reviewer {
        from posts.reviewer as p.r
        filter { age is not null }
        order_by { p.id desc }
        first
    }

    // filtering by another property
    query posts_by_latest_reviewer {
        from posts
        filter { reviewer is u.latest_reviewer }
    }

    // deeply nested filter
    query posts_reviewed_by_users_mentoring {
        from posts
        filter { reviewer.mentor is author }
    }

    // and/or/between
    query lucky_age_reviewers {
        from posts.reviewer
        filter { age between 28 36 or age > 60 }
    }

    // lower, like (ilike not supported)
    query cool_emails_reviewers {
        from posts.reviewer
        filter { lower email like '%@cool.c%' }
    }

    // aggregates - count and sum
    query post_count { from posts, count }
    query total_comments { from posts.num_of_comments, sum }

}

```
