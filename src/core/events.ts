import { EventEmitter } from "node:events";

export type LuluEventType = 
  | "session:start"
  | "agent:token"
  | "agent:thought"
  | "agent:error"
  | "tool:start"
  | "tool:end"
  | "session:end";

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
