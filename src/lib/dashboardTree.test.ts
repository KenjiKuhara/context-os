/**
 * dashboardTree: isDescendant の単体テスト（Tree D&D 循環防止の回帰防止用）。
 */

import { describe, it, expect } from "vitest";
import { isDescendant } from "./dashboardTree";

describe("isDescendant", () => {
  it("同一 ID は false（自分は自分の子孫ではない）", () => {
    const map = new Map<string, string[]>();
    map.set("a", ["b"]);
    expect(isDescendant("a", "a", map)).toBe(false);
  });

  it("直接の子なら true", () => {
    const map = new Map<string, string[]>();
    map.set("a", ["b"]);
    expect(isDescendant("a", "b", map)).toBe(true);
  });

  it("孫なら true", () => {
    const map = new Map<string, string[]>();
    map.set("a", ["b"]);
    map.set("b", ["c"]);
    expect(isDescendant("a", "c", map)).toBe(true);
  });

  it("無関係なノードは false", () => {
    const map = new Map<string, string[]>();
    map.set("a", ["b"]);
    map.set("x", ["y"]);
    expect(isDescendant("a", "y", map)).toBe(false);
    expect(isDescendant("a", "x", map)).toBe(false);
  });

  it("逆（nodeId が ancestorId の親側）は false", () => {
    const map = new Map<string, string[]>();
    map.set("a", ["b"]);
    map.set("b", ["c"]);
    expect(isDescendant("c", "a", map)).toBe(false);
  });
});
