import type {
  CoordinatorTask,
  SubAgentTask,
  SubAgentResult,
  CoordinationTaskStatus,
  SubAgentTaskStatus,
} from "../types/types.js";
import { subAgentManager } from "./subagent.js";
import { eventBus } from "./events.js";
import { notificationManager } from "./notifications.js";

class CoordinatorManager {
  private tasks = new Map<string, CoordinatorTask>();

  createTask(title: string, subTasks: { title: string; prompt: string; dependsOn?: string[]; id?: string }[]): string {
    const id = `coord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const task: CoordinatorTask = {
      id,
      title,
      subTasks: subTasks.map(st => ({
        title: st.title,
        prompt: st.prompt,
        dependsOn: st.dependsOn || [],
        id: st.id || `${id}-${Math.random().toString(36).slice(2, 7)}`,
        status: "pending" as SubAgentTaskStatus,
        createdAt: new Date().toISOString(),
      })),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(id, task);
    eventBus.emit("coordination:task:created", { taskId: id, title, subTaskCount: task.subTasks.length }, id);
    return id;
  }

  getTask(id: string): CoordinatorTask | null {
    return this.tasks.get(id) ?? null;
  }

  listTasks(): CoordinatorTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listActive(): CoordinatorTask[] {
    return this.listTasks().filter(t => t.status === "running" || t.status === "pending");
  }

  /**
   * Run a coordination task: resolve dependency graph, spawn sub-agents, collect results.
   * Returns aggregated result text.
   */
  async orchestrate(
    taskId: string,
    config: any,
    onProgress?: (msg: string) => void,
  ): Promise<string> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status === "running") throw new Error(`Task already running: ${taskId}`);

    task.status = "running";
    task.startedAt = new Date().toISOString();
    eventBus.emit("coordination:task:start", { taskId, subTaskCount: task.subTasks.length }, taskId);

    const results: string[] = [];

    // Track running sub-agent promises keyed by subtask id
    const pendingById = new Map(task.subTasks.map(st => [st.id, { ...st }]));
    const runningPromises = new Map<string, Promise<void>>();
    const completedIds = new Set<string>();

    onProgress?.(`Starting orchestration of "${task.title}" with ${task.subTasks.length} sub-tasks`);

    const spawnSubAgent = async (st: typeof task.subTasks[0]): Promise<void> => {
      onProgress?.(`Spawning sub-agent for: ${st.title}`);
      const agentId = await subAgentManager.spawn({
        parentId: taskId,
        name: st.title,
        prompt: st.prompt,
        config,
        maxRounds: 10,
        timeout: 120_000,
      });

      st.agentId = agentId;
      st.status = "running";
      pendingById.set(st.id, st);

      // Track the promise
      const waitPromise = (async () => {
        try {
          const result = await subAgentManager.collect([agentId], 120_000);
          const res = result.get(agentId);
          st.result = res;
          st.status = res ? "done" : "failed";
          if (res) {
            st.endedAt = new Date().toISOString();
            onProgress?.(`Sub-agent done: ${st.title} (${res.usage.totalTokens} tokens)`);
          } else {
            st.error = "No result returned";
            st.endedAt = new Date().toISOString();
            onProgress?.(`Sub-agent failed: ${st.title}`);
          }
        } finally {
          completedIds.add(st.id);
          pendingById.set(st.id, st);
          runningPromises.delete(st.id);
        }
      })();

      runningPromises.set(st.id, waitPromise);
    };

    // Run spawn loop with polling
    while (true) {
      // Spawn any pending tasks whose deps are all done
      for (const [id, st] of pendingById) {
        if (st.status !== "pending") continue;
        const depsDone = st.dependsOn.every(depId => {
          const dep = pendingById.get(depId);
          return dep && (dep.status === "done" || dep.status === "failed");
        });
        if (depsDone) {
          await spawnSubAgent(st);
        }
      }

      // If nothing is running and nothing can spawn, we're done
      if (runningPromises.size === 0) {
        const stillPending = Array.from(pendingById.values()).some(st => st.status === "pending");
        if (!stillPending) break;
        // Deadlock: pending tasks but deps never resolve
        onProgress?.("Deadlock detected: remaining tasks have unresolved dependencies");
        break;
      }

      // Wait for at least one running task to finish
      const runningArr = Array.from(runningPromises.values());
      await Promise.race(runningArr);
    }

    // Wait for remaining promises
    await Promise.allSettled(runningPromises.values());
    runningPromises.clear();

    // Aggregate results
    for (const st of task.subTasks) {
      if (st.result?.text) {
        results.push(`## ${st.title}\n${st.result.text}`);
      } else if (st.error) {
        results.push(`## ${st.title} (FAILED)\n${st.error}`);
      }
    }

    const allDone = task.subTasks.every(st => st.status === "done");
    task.status = allDone ? "done" : "failed";
    task.endedAt = new Date().toISOString();
    task.aggregatedResult = results.join("\n\n");

    eventBus.emit("coordination:task:end", {
      taskId,
      status: task.status,
      subTasks: task.subTasks.map(st => ({ id: st.id, status: st.status })),
    }, taskId);

    // Notify via notification manager
    await notificationManager.send({
      title: `Coordination ${allDone ? "Complete" : "Failed"}: ${task.title}`,
      body: `${task.subTasks.length} sub-tasks — ${task.subTasks.filter(s => s.status === "done").length} succeeded`,
      source: "coordinator",
      priority: allDone ? "low" : "high",
      timestamp: new Date().toISOString(),
    });

    return task.aggregatedResult;
  }

  abort(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = "cancelled";
    task.endedAt = new Date().toISOString();
    for (const st of task.subTasks) {
      if (st.agentId) subAgentManager.abort(st.agentId);
    }
    eventBus.emit("coordination:task:end", { taskId, status: "cancelled" }, taskId);
    return true;
  }

  prune(maxAgeMs = 3_600_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, task] of this.tasks) {
      if (task.endedAt && new Date(task.endedAt).getTime() < cutoff) {
        this.tasks.delete(id);
      }
    }
  }
}

export const coordinatorManager = new CoordinatorManager();
