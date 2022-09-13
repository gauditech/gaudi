# Model examples

## Db connection

```
database {
    engine pg
    uri postgresql://...
}
```

## Model

```
model User {
    // optional dbname
    dbname users
}
```

## Fields

```
model User {
    // validate can be block
    field fullName { type text, validate { min 2, max 20 } }
    // validate can be inline; `unique` with optional fn `lower`
    field email {
        type text, unique lower
        validate regex /^[^@]+@[^@]+$/
        validate min 4
    }
    // custom dbname, nullable
    field poi { type boolean, dbname person_of_interest, nullable }
}
```

## References

```
model Post {
    // simplest form
    reference author { to User }
    // custom dbname, nullable
    reference reviewer { to User, nullable }
    // one to one with unique keyword
    reference extras { to PostExtras, unique }
}
```

## Relations

```
model User {
    relation posts { to Post, through author }
    relation posts_reviewed { to Post, through reviewer }
}
```

## Queries

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
