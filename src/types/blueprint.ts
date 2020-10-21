import { Model } from "./model";

export interface Blueprint {
  models: Record<string, Model>;
}
