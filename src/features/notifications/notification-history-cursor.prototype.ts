// PROTOTYPE — do not ship.
// Question: can two independently paged notification streams advance without
// gaps when relay limits land inside a second shared by many events, while an
// incomplete aggregate query remains retryable and never advances its cursor?

export type NotificationStream = "authored" | "mentions";
export type QueryPhase = "page" | "boundary";

export type PrototypeEvent = {
  id: string;
  createdAt: number;
};

type StreamState = {
  activeBoundaryPrefix: string | null;
  boundarySecond: number | null;
  exhausted: boolean;
  limit: number;
  nextUntil: number | null;
  phase: QueryPhase | "ready" | "incomplete";
  pendingBoundaryPrefixes: string[];
  relayPageEvents: Record<string, PrototypeEvent[]>;
  retryPhase: QueryPhase | null;
};

export type NotificationHistoryPrototypeState = {
  events: Record<string, PrototypeEvent>;
  streams: Record<NotificationStream, StreamState>;
};

export type NotificationHistoryPrototypeAction =
  | {
    type: "receive";
    stream: NotificationStream;
    relay: string;
    events: PrototypeEvent[];
  }
  | {
    type: "complete";
    stream: NotificationStream;
    allTargetsEose: boolean;
  }
  | { type: "load-next"; stream: NotificationStream }
  | { type: "retry"; stream: NotificationStream };

function stream(limit: number): StreamState {
  return {
    activeBoundaryPrefix: null,
    boundarySecond: null,
    exhausted: false,
    limit,
    nextUntil: null,
    phase: "page",
    pendingBoundaryPrefixes: [],
    relayPageEvents: {},
    retryPhase: null,
  };
}

export function initialNotificationHistoryPrototypeState(): NotificationHistoryPrototypeState {
  return {
    events: {},
    streams: {
      authored: stream(25),
      mentions: stream(50),
    },
  };
}

export function notificationHistoryPrototypeReducer(
  state: NotificationHistoryPrototypeState,
  action: NotificationHistoryPrototypeAction,
): NotificationHistoryPrototypeState {
  const next = structuredClone(state);
  const current = next.streams[action.stream];

  if (action.type === "receive") {
    current.relayPageEvents[action.relay] = [
      ...(current.relayPageEvents[action.relay] ?? []),
      ...action.events,
    ];
    action.events.forEach((event) => {
      next.events[event.id] = event;
    });
    return next;
  }

  if (action.type === "load-next") {
    if (current.phase !== "ready" || current.exhausted) return next;
    current.phase = "page";
    current.boundarySecond = null;
    current.relayPageEvents = {};
    return next;
  }

  if (action.type === "retry") {
    if (current.phase !== "incomplete" || current.retryPhase === null) return next;
    current.phase = current.retryPhase;
    current.retryPhase = null;
    current.relayPageEvents = {};
    return next;
  }

  const completingPhase = current.phase;
  if (completingPhase !== "page" && completingPhase !== "boundary") return next;
  if (!action.allTargetsEose) {
    current.phase = "incomplete";
    current.retryPhase = completingPhase;
    return next;
  }

  current.retryPhase = null;
  if (completingPhase === "boundary") {
    const activePrefix = current.activeBoundaryPrefix ?? "";
    const saturated = Object.values(current.relayPageEvents).some((events) =>
      new Set(events.map((event) => event.id)).size >= current.limit
    );
    if (saturated && activePrefix.length < 64) {
      const children = "0123456789abcdef".split("").map((digit) => activePrefix + digit);
      current.activeBoundaryPrefix = children.shift() ?? null;
      current.pendingBoundaryPrefixes = [
        ...children,
        ...current.pendingBoundaryPrefixes,
      ];
      current.relayPageEvents = {};
      return next;
    }
    const nextPrefix = current.pendingBoundaryPrefixes.shift();
    if (nextPrefix !== undefined) {
      current.activeBoundaryPrefix = nextPrefix;
      current.relayPageEvents = {};
      return next;
    }
    current.nextUntil = Math.max(0, (current.boundarySecond ?? 0) - 1);
    current.activeBoundaryPrefix = null;
    current.phase = "ready";
    current.relayPageEvents = {};
    return next;
  }

  const saturatedBoundaries = Object.values(current.relayPageEvents).flatMap((events) => {
    if (new Set(events.map((event) => event.id)).size < current.limit) return [];
    return [Math.min(...events.map((event) => event.createdAt))];
  });
  if (saturatedBoundaries.length === 0) {
    current.exhausted = true;
    current.phase = "ready";
    current.relayPageEvents = {};
    return next;
  }

  current.boundarySecond = Math.max(...saturatedBoundaries);
  current.activeBoundaryPrefix = "";
  current.phase = "boundary";
  current.relayPageEvents = {};
  return next;
}

export function visiblePrototypeEvents(
  state: NotificationHistoryPrototypeState,
): PrototypeEvent[] {
  return Object.values(state.events).sort(
    (left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}
