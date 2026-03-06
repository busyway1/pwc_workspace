import { describe, expect, test, beforeEach } from "bun:test";
import { ReloadEventStore } from "./events.js";

describe("ReloadEventStore", () => {
  let store: ReloadEventStore;

  beforeEach(() => {
    store = new ReloadEventStore();
  });

  describe("record", () => {
    test("creates an event with sequential IDs", () => {
      const e1 = store.record("ws_abc", "config");
      const e2 = store.record("ws_abc", "plugins");

      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
      expect(e1.workspaceId).toBe("ws_abc");
      expect(e1.reason).toBe("config");
      expect(e2.reason).toBe("plugins");
    });

    test("includes id and timestamp", () => {
      const event = store.record("ws_abc", "skills");
      expect(typeof event.id).toBe("string");
      expect(event.id.length).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("number");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    test("includes trigger when provided", () => {
      const trigger = {
        type: "skill" as const,
        name: "my-skill",
        action: "added" as const,
      };
      const event = store.record("ws_abc", "skills", trigger);
      expect(event.trigger).toEqual(trigger);
    });

    test("trigger is undefined when not provided", () => {
      const event = store.record("ws_abc", "config");
      expect(event.trigger).toBeUndefined();
    });

    test("evicts old events when maxSize exceeded", () => {
      const small = new ReloadEventStore(3);
      small.record("ws_a", "config");
      small.record("ws_a", "plugins");
      small.record("ws_a", "skills");
      small.record("ws_a", "mcp"); // should evict the first

      const events = small.list("ws_a");
      expect(events.length).toBe(3);
      // The oldest event (seq=1) should be gone
      expect(events[0].seq).toBe(2);
      expect(events[2].seq).toBe(4);
    });

    test("evicts multiple events when well over maxSize", () => {
      const tiny = new ReloadEventStore(2);
      tiny.record("ws_a", "config"); // seq 1
      tiny.record("ws_a", "plugins"); // seq 2
      tiny.record("ws_a", "skills"); // seq 3 — evicts seq 1
      tiny.record("ws_a", "mcp"); // seq 4 — evicts seq 2

      const events = tiny.list("ws_a");
      expect(events.length).toBe(2);
      expect(events[0].seq).toBe(3);
      expect(events[1].seq).toBe(4);
    });
  });

  describe("recordDebounced", () => {
    test("records the first event normally", () => {
      const event = store.recordDebounced("ws_abc", "config");
      expect(event).not.toBeNull();
      expect(event!.reason).toBe("config");
    });

    test("suppresses duplicate within debounce window", () => {
      const e1 = store.recordDebounced("ws_abc", "config");
      const e2 = store.recordDebounced("ws_abc", "config");
      expect(e1).not.toBeNull();
      expect(e2).toBeNull();
    });

    test("allows after debounce window expires", async () => {
      const e1 = store.recordDebounced("ws_abc", "config", undefined, 50);
      expect(e1).not.toBeNull();

      // Wait for debounce to expire
      await new Promise((r) => setTimeout(r, 60));

      const e2 = store.recordDebounced("ws_abc", "config", undefined, 50);
      expect(e2).not.toBeNull();
      expect(e2!.seq).toBeGreaterThan(e1!.seq);
    });

    test("different reasons are not debounced against each other", () => {
      const e1 = store.recordDebounced("ws_abc", "config");
      const e2 = store.recordDebounced("ws_abc", "plugins");
      expect(e1).not.toBeNull();
      expect(e2).not.toBeNull();
    });

    test("different workspaces are not debounced against each other", () => {
      const e1 = store.recordDebounced("ws_a", "config");
      const e2 = store.recordDebounced("ws_b", "config");
      expect(e1).not.toBeNull();
      expect(e2).not.toBeNull();
    });

    test("uses custom debounce interval", async () => {
      const e1 = store.recordDebounced("ws_abc", "config", undefined, 20);
      expect(e1).not.toBeNull();

      // Within custom debounce window
      const e2 = store.recordDebounced("ws_abc", "config", undefined, 20);
      expect(e2).toBeNull();

      await new Promise((r) => setTimeout(r, 30));

      const e3 = store.recordDebounced("ws_abc", "config", undefined, 20);
      expect(e3).not.toBeNull();
    });
  });

  describe("list", () => {
    test("filters by workspaceId", () => {
      store.record("ws_a", "config");
      store.record("ws_b", "plugins");
      store.record("ws_a", "skills");

      const eventsA = store.list("ws_a");
      expect(eventsA.length).toBe(2);
      expect(eventsA.every((e) => e.workspaceId === "ws_a")).toBe(true);

      const eventsB = store.list("ws_b");
      expect(eventsB.length).toBe(1);
      expect(eventsB[0].workspaceId).toBe("ws_b");
    });

    test("returns empty array for unknown workspace", () => {
      store.record("ws_a", "config");
      expect(store.list("ws_unknown")).toEqual([]);
    });

    test("respects since cursor", () => {
      store.record("ws_a", "config"); // seq 1
      store.record("ws_a", "plugins"); // seq 2
      const cursor = store.cursor(); // 2
      store.record("ws_a", "skills"); // seq 3

      const events = store.list("ws_a", cursor);
      expect(events.length).toBe(1);
      expect(events[0].seq).toBe(3);
    });

    test("returns all events when since is 0", () => {
      store.record("ws_a", "config");
      store.record("ws_a", "plugins");

      const events = store.list("ws_a", 0);
      expect(events.length).toBe(2);
    });

    test("returns all events when since is undefined", () => {
      store.record("ws_a", "config");
      store.record("ws_a", "plugins");

      const events = store.list("ws_a");
      expect(events.length).toBe(2);
    });

    test("returns empty when since is at or past current cursor", () => {
      store.record("ws_a", "config");
      const cursor = store.cursor();
      const events = store.list("ws_a", cursor);
      expect(events.length).toBe(0);
    });
  });

  describe("cursor", () => {
    test("returns 0 initially", () => {
      expect(store.cursor()).toBe(0);
    });

    test("returns current sequence number after records", () => {
      store.record("ws_a", "config");
      expect(store.cursor()).toBe(1);

      store.record("ws_a", "plugins");
      expect(store.cursor()).toBe(2);

      store.record("ws_b", "skills");
      expect(store.cursor()).toBe(3);
    });

    test("increments for debounced records that succeed", () => {
      store.recordDebounced("ws_a", "config");
      expect(store.cursor()).toBe(1);

      // Suppressed — cursor should not change
      store.recordDebounced("ws_a", "config");
      expect(store.cursor()).toBe(1);
    });
  });
});
