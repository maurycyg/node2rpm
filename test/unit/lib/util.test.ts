import { describe, it, expect } from "vitest";
import * as util from "../../../src/util.js";

describe("util", () => {
  it("exports resolve, mkdirp, rpmbuild", () => {
    expect(util).toBeDefined();
    expect(typeof util.resolve).toBe("function");
    expect(typeof util.mkdirp).toBe("function");
    expect(typeof util.rpmbuild).toBe("function");
  });
});
