import { Field, Model } from "./model";

export interface Definition {
  models: Record<string, Model>;
  fields: Record<string, Field>;
}
