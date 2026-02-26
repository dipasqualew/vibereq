import { describe, it, expect } from "vitest";
import { checkpointHashToFolder } from "../src/lib/git.js";

describe("checkpointHashToFolder", () => {
  it("converts a standard checkpoint hash to folder path", () => {
    expect(checkpointHashToFolder("df9cdff458c3")).toBe("df/9cdff458c3/0");
  });

  it("handles uppercase hash", () => {
    expect(checkpointHashToFolder("DF9CDFF458C3")).toBe("df/9cdff458c3/0");
  });

  it("handles short hash (less than 3 chars)", () => {
    expect(checkpointHashToFolder("ab")).toBe("ab/ab/0");
  });

  it("handles single character hash", () => {
    expect(checkpointHashToFolder("a")).toBe("a/a/0");
  });

  it("handles hash with whitespace", () => {
    expect(checkpointHashToFolder("  df9cdff458c3  ")).toBe("df/9cdff458c3/0");
  });

  it("handles exactly 3 character hash", () => {
    expect(checkpointHashToFolder("abc")).toBe("ab/c/0");
  });
});
