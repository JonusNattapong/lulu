import { describe, it, expect, mock } from "bun:test";
import { eventBus } from "../core/events.js";

describe("EventBus", () => {
  it("should emit and receive events", () => {
    const payload = { foo: "bar" };
    let received: any;
    eventBus.once("agent:token", (event) => {
      received = event;
    });
    eventBus.emit("agent:token", payload, "test-session");
    expect(received.type).toBe("agent:token");
    expect(received.payload).toEqual(payload);
    expect(received.sessionId).toBe("test-session");
  });

  it("should support wildcard subscription", () => {
    let receivedType: string | undefined;
    eventBus.onAny((event) => {
      if (event.type === "session:start") {
        receivedType = event.type;
      }
    });
    eventBus.emit("session:start", { user: "test" });
    expect(receivedType).toBe("session:start");
  });
});
