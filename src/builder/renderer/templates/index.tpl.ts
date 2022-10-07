import { source } from "common-tags";

export function render(): string {
  // prettier-ignore
  return source`
    require('./server/main.js')
  `
}
