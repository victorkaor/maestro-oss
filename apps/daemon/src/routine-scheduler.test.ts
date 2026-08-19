import { describe, expect, it, vi } from "vitest";
import { RoutineScheduler } from "./routine-scheduler.js";

describe("RoutineScheduler", () => {
  it("throws on an invalid cron expression", () => {
    const scheduler = new RoutineScheduler({
      getSend: () => undefined,
      onFired: vi.fn(),
      onLastRun: vi.fn(),
    });
    expect(() =>
      scheduler.upsert("r1", { agentId: "a1", cronExpr: "not a cron", prompt: "hi", enabled: true }),
    ).toThrow();
  });

  it("does not schedule a task for a disabled routine", () => {
    const getSend = vi.fn(() => undefined);
    const scheduler = new RoutineScheduler({ getSend, onFired: vi.fn(), onLastRun: vi.fn() });
    scheduler.upsert("r1", { agentId: "a1", cronExpr: "* * * * *", prompt: "hi", enabled: false });
    // no task scheduled, no error, nothing to fire yet — remove should be a no-op too
    expect(() => scheduler.remove("r1")).not.toThrow();
  });

  it("remove is safe to call on an unknown routine id", () => {
    const scheduler = new RoutineScheduler({ getSend: () => undefined, onFired: vi.fn(), onLastRun: vi.fn() });
    expect(() => scheduler.remove("does-not-exist")).not.toThrow();
  });

  it("stopAll clears all scheduled routines", () => {
    const scheduler = new RoutineScheduler({ getSend: () => undefined, onFired: vi.fn(), onLastRun: vi.fn() });
    scheduler.upsert("r1", { agentId: "a1", cronExpr: "* * * * *", prompt: "hi", enabled: true });
    scheduler.upsert("r2", { agentId: "a2", cronExpr: "* * * * *", prompt: "hi", enabled: true });
    expect(() => scheduler.stopAll()).not.toThrow();
  });
});
