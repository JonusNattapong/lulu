import { EventEmitter } from "node:events";

export type LuluEventType =
  | "session:start"
  | "agent:token"
  | "agent:thought"
  | "agent:error"
  | "tool:start"
  | "tool:end"
  | "session:end"
  | "subagent:start"
  | "subagent:token"
  | "subagent:tool:start"
  | "subagent:tool:end"
  | "subagent:end"
  | "exec:start"
  | "exec:end"
  | "coordination:task:created"
  | "coordination:task:start"
  | "coordination:task:end"
  | "alwayson:start"
  | "alwayson:tick"
  | "alwayson:stop"
  | "notification:send"
  | "notification:sent"
  | "daemon:start"
  | "daemon:stop"
  | "proactive:suggestion:created"
  | "skill:proposal:created"
  | "skill:proposal:approved"
  | "skill:proposal:rejected"
  | "skill:proposal:merged"
  | "research:queued"
  | "research:start"
  | "research:done"
  | "research:failed"
  | "global-memory:fact:updated"
  | "global-memory:fact:created"
  | "global-memory:fact:deleted"
  | "global-memory:research:queued"
  | "taskqueue:enqueued"
  | "taskqueue:start"
  | "taskqueue:done"
  | "taskqueue:failed"
  | "taskqueue:cancelled"
  | "daemon"
  | "proactive";

export interface LuluEvent {
  type: LuluEventType;
  sessionId?: string;
  payload?: any;
  timestamp: string;
}

class LuluEventBus extends EventEmitter {
  emit(type: LuluEventType, payload?: any, sessionId?: string): boolean {
    const event: LuluEvent = {
      type,
      payload,
      sessionId,
      timestamp: new Date().toISOString()
    };
    const r1 = super.emit(type, event);
    const r2 = super.emit("*", event);
    return r1 || r2;
  }

  // Helper for easy subscription
  onAny(handler: (event: LuluEvent) => void) {
    this.on("*", handler);
  }
}

export const eventBus = new LuluEventBus();
