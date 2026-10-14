import { describe, expect, it } from "vitest";
import { compileSquidConfig } from "../src/net/squid.js";

const lines = (conf: string) => conf.trim().split("\n");

describe("compileSquidConfig", () => {
  it("denies everything in none mode", () => {
    const conf = lines(compileSquidConfig({ mode: "none", allow: [] }));
    expect(conf.filter((l) => l.startsWith("http_access allow"))).toEqual([]);
    expect(conf.at(-1)).toBe("http_access deny all");
  });

  it("admits only listed domains in allowlist mode", () => {
    const conf = compileSquidConfig({ mode: "allowlist", allow: [".npmjs.org", "example.com"] });
    expect(conf).toContain(
      "acl allowed dstdomain -n .npmjs.org example.com\nhttp_access allow allowed",
    );
  });

  it("blocks private and host ranges before any allow rule", () => {
    const conf = lines(compileSquidConfig({ mode: "open", allow: [] }));
    expect(conf.indexOf("http_access deny blocked_dst")).toBeLessThan(
      conf.indexOf("http_access allow all"),
    );
    expect(conf.find((l) => l.startsWith("acl blocked_dst"))).toContain("127.0.0.0/8");
  });

  it("matches allowlisted domains by name only, never by reverse DNS", () => {
    expect(compileSquidConfig({ mode: "allowlist", allow: ["example.com"] })).toContain(
      "acl allowed dstdomain -n ",
    );
  });

  it("rejects a host that would inject squid directives", () => {
    expect(() =>
      compileSquidConfig({ mode: "allowlist", allow: ["x.com\nhttp_access allow all"] }),
    ).toThrow(/invalid host/);
  });
});
