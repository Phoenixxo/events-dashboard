import { EVENT_SOURCES, EVENT_TYPES } from "./analytics";
import type {
  EventCollectionInput,
  EventSource,
  EventType,
  TrackedEvent,
} from "./types";

type EventValidationResult =
  | { ok: true; input: EventCollectionInput }
  | { ok: false; error: string };

export function validateEventInput(value: unknown): EventValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Request body must be an event object." };
  }

  const candidate = value as Partial<EventCollectionInput>;

  if (!isEventType(candidate.type)) {
    return { ok: false, error: "Event type is not supported." };
  }

  if (!isEventSource(candidate.source)) {
    return { ok: false, error: "Event source is not supported." };
  }

  if (typeof candidate.userId !== "string" || candidate.userId.trim() === "") {
    return { ok: false, error: "User ID is required." };
  }

  if (
    candidate.value !== undefined &&
    (typeof candidate.value !== "number" ||
      Number.isNaN(candidate.value) ||
      candidate.value < 0)
  ) {
    return { ok: false, error: "Value must be a positive number." };
  }

  return {
    ok: true,
    input: {
      type: candidate.type,
      source: candidate.source,
      userId: candidate.userId.trim(),
      ...(candidate.value !== undefined ? { value: candidate.value } : {}),
      ...(typeof candidate.metadata === "string" && candidate.metadata.trim()
        ? { metadata: candidate.metadata.trim() }
        : {}),
    },
  };
}

export function createTrackedEvent(input: EventCollectionInput): TrackedEvent {
  return {
    id: createEventId(),
    timestamp: new Date().toISOString(),
    ...input,
  };
}

function createEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPES.includes(value as EventType);
}

function isEventSource(value: unknown): value is EventSource {
  return typeof value === "string" && EVENT_SOURCES.includes(value as EventSource);
}
