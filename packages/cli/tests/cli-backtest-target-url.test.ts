import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/main.js";

describe("cli backtest --target-url", () => {
  it("help mentions --target-url", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(String(msg));
    });
    const code = await runCli(["backtest", "--help"]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("--target-url");
    vi.restoreAllMocks();
  });

  it("errors when neither schema nor target-url", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((msg) => {
      errors.push(String(msg));
    });
    const code = await runCli(["backtest", "--bundle", "fixtures/compose-pool/sample-v1"]);
    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch(/schema.*target-url|target-url.*schema/);
    vi.restoreAllMocks();
  });
});
