import cron, { type ScheduledTask } from "node-cron";

export interface RoutineSchedulerCallbacks {
  getSend: (agentId: string) => ((content: string) => void) | undefined;
  onFired: (routineId: string, agentId: string, at: string) => void;
  onLastRun: (routineId: string, at: string) => void;
}

interface Routine {
  agentId: string;
  cronExpr: string;
  prompt: string;
  enabled: boolean;
}

/**
 * Owns the in-memory cron jobs for one workspace connection. Routines are
 * (re)activated by the web client replaying `routine.upsert` for each
 * enabled row on connect — the daemon itself does not read the routines
 * table on startup.
 */
export class RoutineScheduler {
  private tasks = new Map<string, ScheduledTask>();
  private routines = new Map<string, Routine>();

  constructor(private callbacks: RoutineSchedulerCallbacks) {}

  upsert(routineId: string, routine: Routine): void {
    this.remove(routineId);
    this.routines.set(routineId, routine);
    if (!routine.enabled) return;

    if (!cron.validate(routine.cronExpr)) {
      throw new Error(`Invalid cron expression: ${routine.cronExpr}`);
    }

    const task = cron.schedule(routine.cronExpr, () => {
      const send = this.callbacks.getSend(routine.agentId);
      if (!send) return;
      send(routine.prompt);
      const at = new Date().toISOString();
      this.callbacks.onFired(routineId, routine.agentId, at);
      this.callbacks.onLastRun(routineId, at);
    });
    this.tasks.set(routineId, task);
  }

  remove(routineId: string): void {
    this.tasks.get(routineId)?.stop();
    this.tasks.delete(routineId);
    this.routines.delete(routineId);
  }

  stopAll(): void {
    for (const task of this.tasks.values()) task.stop();
    this.tasks.clear();
    this.routines.clear();
  }
}
