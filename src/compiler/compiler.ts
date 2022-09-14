import { AST, FieldAST, ModelAST, ReferenceAST, RelationAST } from "src/types/ast";
import {
  FieldSpec,
  ModelSpec,
  ReferenceSpec,
  RelationSpec,
  Specification,
} from "src/types/specification";

function compileField(field: FieldAST): FieldSpec {
  let type = "unknown";
  let nullable: boolean;
  let unique: boolean;
  field.body.forEach((b) => {
    if (b === "nullable") {
      nullable = true;
    } else if (b === "unique") {
      unique = true;
    } else {
      type = b.type;
    }
  });

  return { name: field.name, type, nullable, unique };
}

function compileReference(reference: ReferenceAST): ReferenceSpec {
  let toModel: string;
  let nullable: boolean;
  let unique: boolean;
  reference.body.forEach((b) => {
    if (b === "nullable") {
      nullable = true;
    } else if (b === "unique") {
      unique = true;
    } else {
      toModel = b.to;
    }
  });

  return { name: reference.name, toModel, nullable, unique };
}

function compileRelation(relation: RelationAST): RelationSpec {
  let fromModel: string;
  let through: string;
  relation.body.forEach((b) => {
    if ("from" in b) {
      fromModel = b.from;
    } else {
      through = b.through;
    }
  });

  return { name: relation.name, fromModel, through };
}

function compileModel(model: ModelAST): ModelSpec {
  const fields: FieldSpec[] = [];
  const references: ReferenceSpec[] = [];
  const relations: RelationSpec[] = [];

  model.body.forEach((b) => {
    if (b.kind === "field") {
      fields.push(compileField(b));
    } else if (b.kind === "reference") {
      references.push(compileReference(b));
    } else if (b.kind === "relation") {
      relations.push(compileRelation(b));
    }
  });

  return { name: model.name, fields, references, relations };
}

export function compile(input: AST): Specification {
  return { models: input.models.map(compileModel) };
}
