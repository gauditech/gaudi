# Syntax guide

## Models

Models correspond to database tables. They are defined using `model` keyword and a name. Name should start with an uppercase letter.

```
model <name> {
    ...
}
```

Model block can define the following attributes: `field`, `reference`, `relation`, described below.

Example definition:

```
model User {
    field name string
    reference org Organization
    relation posts Post
}
```

### Field

Field defines a field on a database level, with the following syntax:

```
field <name> <type> [optional attributes]

# example
field created_at datetime default=now
```

Required attributes:

- `name` - a name of the field
- `type` - can be: `text`, `number`, `decimal`, `boolean`, `datetime`

Optional attributes:
- `unique`
- `nullable`
- `default <value>` - sets default value of a field. `default null` implicitely sets `nullable` 
- `dbname` - SQL name of the table

### Reference

Reference defines a field that is a pointer to a model. Typically a foreign key (but optional). It creates a field on the model, storing the referencing model identifier value.

Syntax as follows:

```
reference <name> <model> [<target_field>] [optional attributes]
# examples
reference author User
reference device Device uuid
```

Required attributes:

- `name` - a reference name
- `model` - a referencing model

Optional attributes:

- `target_field` - a `field` on a referenced model, by default a primary key field (`id`)
- `nullable`
- `unique`
- `dbname` - SQL name of the field, by default it's constructed as `<model_dbname>_<target_field_dbname>`
- `fk` - SQL name for a foreign key, setting to `null` will skip creating a foreign key constraint

### Relation

1. Defines a one-to-many relation on the model referenced by `reference`, or one-to-one if `unique` is used when defining a `reference`
2. Composes a `relation` from another `relation`, by following multiple chained `reference`s, or applying a `filter` to an existing relation.

Syntax:

```
relation <name> <ref_model> [through <field>]

# example
relation posts Post through author_id
```

Required attributes:
- `name` - a name of the attribute
- `ref_model` - a referencing model

Optional attributes:
- `through <field>` - a referencing model field to join on. This attribute is required if a referencing model defines multiple `references` to the referenced model
- `filter` - a filter block; see [filtering(todo)](#)

### Filtering (todo)

This needs a separate document. Here are some examples:

```
relation publications_without_mentor publications filter {
    mentor is null
}

relation self_mentored_publications publications filter {
    this is mentor
}
```

TODO: Add nested filter examples.

#### Examples

In this example, `Paper` references `User` multiple times, making `through` a required attribute in users' relations.

```
model User {
    relation mentorships Paper through mentor
    relation publications Paper through author
    relation latest_publications publications filter {
        order by id desc
        limit 5
    }
}
model Paper {
    reference author User
    reference mentor User nullable
}
```
