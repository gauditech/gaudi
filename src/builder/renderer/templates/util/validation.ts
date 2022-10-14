import { commaLists, oneLine } from "common-tags";

/**
 * Functions for rendering validation schema calls base on Yup (https://github.com/jquense/yup)
 */

/**
 * Render validator object instance
 */
export function renderValidator() {
  return `yup`;
}

// ----- types

/**
 * Render "object" Yup schema
 *
 * https://github.com/jquense/yup#object
 */
export function renderObject<T>(
  fields: Record<string, T>,
  callback: (field: T) => string,
  condition = true
): string {
  // prettier-ignore
  return optionalCall(condition)(commaLists`
    object({
      ${Object.entries<T>(fields).map(([name, field]) => oneLine`"${name}": ${renderValidator()}${callback(field)}`)}
    })
  `);
}

/**
 * Render "mixed" Yup schema
 *
 * https://github.com/jquense/yup#mixed
 */
export function renderMixed(condition = true): string {
  return optionalCall(condition)("mixed()");
}

/**
 * Render "string" Yup schema
 *
 * https://github.com/jquense/yup#string
 */
export function renderString(condition = true): string {
  return optionalCall(condition)("string()");
}

/**
 * Render "number" Yup schema
 *
 * https://github.com/jquense/yup#number
 */
export function renderNumber(condition = true): string {
  return optionalCall(condition)("number()");
}

/**
 * Render "boolean" Yup schema
 *
 * https://github.com/jquense/yup#boolean
 */
export function renderBoolean(condition = true): string {
  return optionalCall(condition)("boolean()");
}

// ----- conditionals

/**
 * Render "required" Yup schema
 *
 * https://github.com/jquense/yup#schemarequiredmessage-string--function-schema
 */
export function renderRequired(condition = true): string {
  return optionalCall(condition)("required()");
}

// ----- utils

/** Returns call string prefixed with "." if condition is true, otherwise it returns an empty string.  */
export function optionalCall(condition: boolean): (call: string) => string {
  return (call) => (condition ? "." + call : "");
}
