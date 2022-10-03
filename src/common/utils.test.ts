import { nameInitials } from "./utils";

describe("nameInitials", () => {
  it("succeeds for camelCase examples", () => {
    expect(nameInitials("myFirstWord")).toBe("mfw");
    expect(nameInitials("MYWord")).toBe("myw");
  });

  it("succeds for snake_case examples", () => {
    expect(nameInitials("my_first_word")).toBe("mfw");
  });

  it("succeeds for advanced examples", () => {
    expect(nameInitials("M.Y.12word")).toBe("myw");
    expect(nameInitials("_M__y1woR!d")).toBe("mywrd");
  });
});
