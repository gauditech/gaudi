export type Specification = {
  models: ModelSpec[];
};

export type ModelSpec = {
  name: string;
  fields: FieldSpec[];
  references: ReferenceSpec[];
  relations: RelationSpec[];
};

export type FieldSpec = {
  name: string;
  type: string;
  unique?: boolean;
  nullable?: boolean;
};

export type ReferenceSpec = {
  name: string;
  toModel: string;
  unique?: boolean;
  nullable?: boolean;
};

export type RelationSpec = {
  name: string;
  fromModel: string;
  through: string;
};