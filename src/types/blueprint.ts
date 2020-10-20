import { Field, Model } from "./model";

export interface Blueprint {
  models: Record<string, Model>;
  fields: Record<string, Field>;
}
