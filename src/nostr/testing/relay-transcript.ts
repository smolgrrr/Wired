import type { Event, Filter } from "nostr-tools";
import {
  WebSocketServer,
  type RawData,
  type WebSocket,
} from "ws";

type TranscriptBase = {
  at: number;
  connectionId: number;
  relayUrl: string;
};

export type RelayTranscriptEntry =
  | (TranscriptBase & { type: "connection-opened" })
  | (TranscriptBase & { type: "connection-closed" })
  | (TranscriptBase & {
      type: "request";
      subscriptionId: string;
      filters: Filter[];
      bytes: number;
    })
  | (TranscriptBase & {
      type: "event-returned";
      subscriptionId: string;
      eventId: string;
      bytes: number;
    })
  | (TranscriptBase & { type: "eose"; subscriptionId: string })
  | (TranscriptBase & {
      type: "close";
      subscriptionId: string;
      lifetimeMs: number;
    })
  | (TranscriptBase & {
      type: "publish";
      eventId: string;
      bytes: number;
    })
  | (TranscriptBase & {
      type: "acknowledgement";
      eventId: string;
      accepted: boolean;
      reason: string;
    })
  | { type: "retry"; at: number; operationId: string };

export type RelayRequestController = {
  connectionId: number;
  filters: Filter[];
  subscriptionId: string;
  sendEvent: (event: Event, delayMs?: number) => void;
  sendEose: (delayMs?: number) => void;
  closeConnection: (delayMs?: number) => void;
};

export type RelayPublishController = {
  connectionId: number;
  event: Event;
  acknowledge: (accepted: boolean, reason?: string, delayMs?: number) => void;
  closeConnection: (delayMs?: number) => void;
};

type RelayTranscriptHarnessOptions = {
  session?: RelayTranscriptSession;
  onRequest?: (request: RelayRequestController) => void;
  onPublish?: (publish: RelayPublishController) => void;
};

export type RelayWorkflowCapture = {
  name: string;
  startedAt: number;
  startIndex: number;
  completedAt?: number;
  completedIndex?: number;
  complete: () => void;
  recordRetry: (operationId: string) => void;
};

export type RelayTranscriptSummary = {
  workflow: string;
  openedConnections: number;
  closedConnections: number;
  connectionReuseCount: number;
  requests: number;
  closes: number;
  returnedEvents: number;
  returnedEventBytes: number;
  eose: number;
  publishes: number;
  publishedEventBytes: number;
  acknowledgements: number;
  rejections: number;
  retries: number;
  repeatedOperations: number;
  relayFanout: number;
  subscriptionLifetimesMs: number[];
  completionLatencyMs: number;
};

type Waiter = {
  predicate: (entries: readonly RelayTranscriptEntry[]) => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function messageBytes(message: string): number {
  return Buffer.byteLength(message, "utf8");
}

export class RelayTranscriptSession {
  private readonly transcript: RelayTranscriptEntry[] = [];
  private readonly waiters = new Set<Waiter>();
  private nextConnectionId = 0;

  get entries(): readonly RelayTranscriptEntry[] {
    return this.transcript;
  }

  beginWorkflow(name: string): RelayWorkflowCapture {
    const capture: RelayWorkflowCapture = {
      name,
      startedAt: Date.now(),
      startIndex: this.transcript.length,
      complete: () => {
        if (capture.completedAt !== undefined) return;
        capture.completedAt = Date.now();
        capture.completedIndex = this.transcript.length;
      },
      recordRetry: (operationId) => {
        this.record({ type: "retry", at: Date.now(), operationId });
      },
    };
    return capture;
  }

  summary(workflow: RelayWorkflowCapture): RelayTranscriptSummary {
    const entries = this.transcript.slice(
      workflow.startIndex,
      workflow.completedIndex ?? this.transcript.length,
    );
    const operationsByConnection = new Map<number, number>();
    const operationSignatures = new Set<string>();
    let repeatedOperations = 0;

    for (const entry of entries) {
      if (entry.type !== "request" && entry.type !== "publish") continue;
      operationsByConnection.set(
        entry.connectionId,
        (operationsByConnection.get(entry.connectionId) ?? 0) + 1,
      );
      const signature =
        entry.type === "request"
          ? `REQ:${JSON.stringify(entry.filters)}`
          : `EVENT:${entry.eventId}`;
      if (operationSignatures.has(signature)) repeatedOperations += 1;
      operationSignatures.add(signature);
    }

    const completedAt = workflow.completedAt ?? Date.now();
    const relayUrls = new Set(
      entries
        .filter((entry) => entry.type === "request" || entry.type === "publish")
        .map((entry) => entry.relayUrl),
    );

    return {
      workflow: workflow.name,
      openedConnections: entries.filter((entry) => entry.type === "connection-opened")
        .length,
      closedConnections: entries.filter((entry) => entry.type === "connection-closed")
        .length,
      connectionReuseCount: [...operationsByConnection.values()].reduce(
        (total, operations) => total + Math.max(0, operations - 1),
        0,
      ),
      requests: entries.filter((entry) => entry.type === "request").length,
      closes: entries.filter((entry) => entry.type === "close").length,
      returnedEvents: entries.filter((entry) => entry.type === "event-returned").length,
      returnedEventBytes: entries
        .filter((entry) => entry.type === "event-returned")
        .reduce((total, entry) => total + entry.bytes, 0),
      eose: entries.filter((entry) => entry.type === "eose").length,
      publishes: entries.filter((entry) => entry.type === "publish").length,
      publishedEventBytes: entries
        .filter((entry) => entry.type === "publish")
        .reduce((total, entry) => total + entry.bytes, 0),
      acknowledgements: entries.filter(
        (entry) => entry.type === "acknowledgement" && entry.accepted,
      ).length,
      rejections: entries.filter(
        (entry) => entry.type === "acknowledgement" && !entry.accepted,
      ).length,
      retries: entries.filter((entry) => entry.type === "retry").length,
      repeatedOperations,
      relayFanout: relayUrls.size,
      subscriptionLifetimesMs: entries
        .filter((entry) => entry.type === "close")
        .map((entry) => entry.lifetimeMs),
      completionLatencyMs: Math.max(0, completedAt - workflow.startedAt),
    };
  }

  async waitFor(
    predicate: (entries: readonly RelayTranscriptEntry[]) => boolean,
    timeoutMs = 2_000,
  ): Promise<void> {
    if (predicate(this.transcript)) return;
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        predicate,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Relay transcript condition timed out after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  record(entry: RelayTranscriptEntry): void {
    this.transcript.push(entry);
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(this.transcript)) continue;
      clearTimeout(waiter.timeout);
      this.waiters.delete(waiter);
      waiter.resolve();
    }
  }

  allocateConnectionId(): number {
    this.nextConnectionId += 1;
    return this.nextConnectionId;
  }
}

export class RelayTranscriptHarness {
  readonly url: string;
  readonly session: RelayTranscriptSession;

  private readonly sockets = new Set<WebSocket>();
  private readonly scheduledActions = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;

  private constructor(
    private readonly server: WebSocketServer,
    private readonly options: RelayTranscriptHarnessOptions,
    port: number,
  ) {
    this.url = `ws://127.0.0.1:${port}`;
    this.session = options.session ?? new RelayTranscriptSession();
    this.server.on("connection", (socket) => this.accept(socket));
  }

  static async listen(
    options: RelayTranscriptHarnessOptions = {},
  ): Promise<RelayTranscriptHarness> {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Relay transcript harness did not bind a TCP port");
    }
    return new RelayTranscriptHarness(server, options, address.port);
  }

  get entries(): readonly RelayTranscriptEntry[] {
    return this.session.entries;
  }

  beginWorkflow(name: string): RelayWorkflowCapture {
    return this.session.beginWorkflow(name);
  }

  summary(workflow: RelayWorkflowCapture): RelayTranscriptSummary {
    return this.session.summary(workflow);
  }

  waitFor(
    predicate: (entries: readonly RelayTranscriptEntry[]) => boolean,
    timeoutMs = 2_000,
  ): Promise<void> {
    return this.session.waitFor(predicate, timeoutMs);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const timeout of this.scheduledActions) clearTimeout(timeout);
    this.scheduledActions.clear();
    for (const socket of this.sockets) socket.terminate();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private schedule(action: () => void, delayMs = 0): void {
    if (this.closed) return;
    if (delayMs <= 0) {
      action();
      return;
    }
    const timeout = setTimeout(() => {
      this.scheduledActions.delete(timeout);
      if (!this.closed) action();
    }, delayMs);
    this.scheduledActions.add(timeout);
  }

  private accept(socket: WebSocket): void {
    const connectionId = this.session.allocateConnectionId();
    this.sockets.add(socket);
    this.session.record({
      type: "connection-opened",
      at: Date.now(),
      connectionId,
      relayUrl: this.url,
    });
    const requestStartedAt = new Map<string, number>();

    socket.on("message", (data) => {
      this.receive(socket, connectionId, requestStartedAt, data);
    });
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.session.record({
        type: "connection-closed",
        at: Date.now(),
        connectionId,
        relayUrl: this.url,
      });
    });
  }

  private receive(
    socket: WebSocket,
    connectionId: number,
    requestStartedAt: Map<string, number>,
    data: RawData,
  ): void {
    const raw = data.toString();
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(message) || typeof message[0] !== "string") return;

    if (message[0] === "REQ" && typeof message[1] === "string") {
      const subscriptionId = message[1];
      const filters = message.slice(2) as Filter[];
      requestStartedAt.set(subscriptionId, Date.now());
      this.session.record({
        type: "request",
        at: Date.now(),
        connectionId,
        relayUrl: this.url,
        subscriptionId,
        filters,
        bytes: messageBytes(raw),
      });
      this.options.onRequest?.({
        connectionId,
        subscriptionId,
        filters,
        sendEvent: (event, delayMs) =>
          this.schedule(() => {
            const outgoing = JSON.stringify(["EVENT", subscriptionId, event]);
            socket.send(outgoing);
            this.session.record({
              type: "event-returned",
              at: Date.now(),
              connectionId,
              relayUrl: this.url,
              subscriptionId,
              eventId: event.id,
              bytes: messageBytes(outgoing),
            });
          }, delayMs),
        sendEose: (delayMs) =>
          this.schedule(() => {
            socket.send(JSON.stringify(["EOSE", subscriptionId]));
            this.session.record({
              type: "eose",
              at: Date.now(),
              connectionId,
              relayUrl: this.url,
              subscriptionId,
            });
          }, delayMs),
        closeConnection: (delayMs) => this.schedule(() => socket.close(), delayMs),
      });
      return;
    }

    if (message[0] === "CLOSE" && typeof message[1] === "string") {
      const subscriptionId = message[1];
      const now = Date.now();
      this.session.record({
        type: "close",
        at: now,
        connectionId,
        relayUrl: this.url,
        subscriptionId,
        lifetimeMs: Math.max(0, now - (requestStartedAt.get(subscriptionId) ?? now)),
      });
      requestStartedAt.delete(subscriptionId);
      return;
    }

    if (message[0] === "EVENT" && message[1] && typeof message[1] === "object") {
      const event = message[1] as Event;
      this.session.record({
        type: "publish",
        at: Date.now(),
        connectionId,
        relayUrl: this.url,
        eventId: event.id,
        bytes: messageBytes(raw),
      });
      this.options.onPublish?.({
        connectionId,
        event,
        acknowledge: (accepted, reason = "", delayMs) =>
          this.schedule(() => {
            socket.send(JSON.stringify(["OK", event.id, accepted, reason]));
            this.session.record({
              type: "acknowledgement",
              at: Date.now(),
              connectionId,
              relayUrl: this.url,
              eventId: event.id,
              accepted,
              reason,
            });
          }, delayMs),
        closeConnection: (delayMs) => this.schedule(() => socket.close(), delayMs),
      });
    }
  }
}
