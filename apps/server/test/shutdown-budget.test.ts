import { describe, expect, it, vi } from "vitest";

import {
  createShutdownBudget,
  withShutdownDeadline,
} from "../src/server/shutdown-budget.js";

describe("createShutdownBudget", () => {
  it("hands a step its full preference while the budget is untouched", () => {
    const budget = createShutdownBudget(12_000, () => 1_000);
    expect(budget.forStep(5_000)).toBe(5_000);
    expect(budget.remainingMs()).toBe(12_000);
  });

  it("caps a step by what the earlier steps left behind", () => {
    let now = 1_000;
    const budget = createShutdownBudget(12_000, () => now);
    now += 9_500;
    expect(budget.forStep(5_000)).toBe(2_500);
  });

  it("floors at zero once the budget is spent", () => {
    let now = 1_000;
    const budget = createShutdownBudget(12_000, () => now);
    now += 30_000;
    expect(budget.remainingMs()).toBe(0);
    expect(budget.forStep(5_000)).toBe(0);
  });
});

describe("withShutdownDeadline", () => {
  it("returns the step's value when it settles in time", async () => {
    await expect(
      withShutdownDeadline(Promise.resolve("done"), 1_000, "step")
    ).resolves.toBe("done");
  });

  it("gives up on a step that never settles", async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      const pending = withShutdownDeadline(
        new Promise<string>(() => {}),
        1_000,
        "http-server",
        log
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toBeNull();
      expect(log).toHaveBeenCalledWith(
        { step: "http-server", budgetMs: 1_000 },
        expect.stringContaining("budget")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let one failing step strand the ones behind it", async () => {
    await expect(
      withShutdownDeadline(Promise.reject(new Error("boom")), 1_000, "step")
    ).resolves.toBeNull();
  });

  it("skips a step outright when nothing is left of the budget", async () => {
    const log = vi.fn();
    const work = vi.fn();
    await expect(
      withShutdownDeadline(
        new Promise<string>(() => work()),
        0,
        "database-pool",
        log
      )
    ).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith(
      { step: "database-pool", budgetMs: 0 },
      expect.stringContaining("exhausted")
    );
  });
});
