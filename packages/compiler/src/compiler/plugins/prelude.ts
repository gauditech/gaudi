function getCode(): string {
  return `
  validator maxInt {
    arg value { type integer }
    arg max { type integer }
    assert { value <= max }
    error { code "too-large" }
  }
  validator minInt {
    arg value { type integer }
    arg min { type integer }
    assert { value >= min }
    error { code "too-small" }
  }

  validator maxFloat {
    arg value { type float }
    arg max { type float }
    assert { value <= max }
    error { code "too-large" }
  }
  validator minFloat {
    arg value { type float }
    arg min { type float }
    assert { value >= min }
    error { code "too-small" }
  }

  validator maxLength {
    arg value { type string }
    arg min { type integer }
    assert { length(value) <= min }
    error { code "too-long" }
  }
  validator minLength {
    arg value { type string }
    arg max { type integer }
    assert { length(value) >= max }
    error { code "too-short" }
  }

  validator isEqualBool {
    arg value { type boolean }
    arg target { type boolean }
    assert { value is target }
    error { code "not-equal" }
  }
  validator isEqualInt {
    arg value { type integer }
    arg target { type integer }
    assert { value is target }
    error { code "not-equal" }
  }
  validator isEqualFloat {
    arg value { type float }
    arg target { type float }
    assert { value is target }
    error { code "not-equal" }
  }
  validator isEqualString {
    arg value { type string }
    arg target { type string }
    assert { value is target }
    error { code "not-equal" }
  }

  validator isEmail {
    arg value { type string }
    assert hook {
      arg value value
      // https://www.regular-expressions.info/email.html
      inline "value.match(/[a-z0-9!#$%&'*+/=?^_\`{|}~-]+(?:\\\\.[a-z0-9!#$%&'*+/=?^_\`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/)"
    }
    error { code "invalid-email" }
  }

  runtime GaudiImplicitJavascriptRuntime {
    source path ""
  }
  `;
}

export const PreludePlugin = { code: getCode() };
