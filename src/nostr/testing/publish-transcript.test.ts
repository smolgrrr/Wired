import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEvent,
  useWebSocketImplementation as configureWebSocketImplementation,
} from "nostr-tools";
import { WebSocket } from "ws";
import { RelayPool } from "../relay-pool";
import {
  auditSampleCount,
  emitAuditMeasurement,
  summarizeSamples,
} from "./audit-metrics";
import {
  RelayTranscriptHarness,
  RelayTranscriptSession,
  type RelayPublishController,
  type RelayTranscriptEntry,
} from "./relay-transcript";

configureWebSocketImplementation(WebSocket);

const event = finalizeEvent({
  created_at: 2_000_000_000,
  kind: 1,
  tags: [],
  content: "browser publish transcript",
}, new Uint8Array(32).fill(90));

function workflowEntries(
  session: RelayTranscriptSession,
  workflow: { startIndex: number; completedIndex?: number },
): readonly RelayTranscriptEntry[] {
  return session.entries.slice(workflow.startIndex, workflow.completedIndex);
}

describe("browser publish relay transcript", () => {
  const harnesses: RelayTranscriptHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("measures full/partial acknowledgement with pooled connection reuse", async () => {
    const session = new RelayTranscriptSession();
    const accept = (publish: RelayPublishController) => publish.acknowledge(true, "", 5);
    const reject = (publish: RelayPublishController) =>
      publish.acknowledge(false, "blocked", 5);
    const runHarnesses = [
      await RelayTranscriptHarness.listen({ session, onPublish: accept }),
      await RelayTranscriptHarness.listen({ session, onPublish: accept }),
      await RelayTranscriptHarness.listen({ session, onPublish: reject }),
    ];
    harnesses.push(...runHarnesses);
    const pool = new RelayPool();
    await pool.connect(runHarnesses.map((harness) => harness.url));
    const completionLatencies: number[] = [];
    let evidenceEntries: readonly RelayTranscriptEntry[] = [];

    for (let run = 0; run < auditSampleCount(); run += 1) {
      const workflow = session.beginWorkflow(`browser-publish-partial-${run + 1}`);
      const accepted = await pool.publish(event);
      workflow.complete();

      expect(accepted).toEqual(new Set(runHarnesses.slice(0, 2).map((relay) => relay.url)));
      const summary = session.summary(workflow);
      expect(summary).toMatchObject({
        openedConnections: 0,
        publishes: 3,
        acknowledgements: 2,
        rejections: 1,
        retries: 0,
        relayFanout: 3,
      });
      const entries = workflowEntries(session, workflow);
      expect(entries
        .filter((entry) => entry.type === "publish")
        .every((entry) => entry.eventId === event.id)).toBe(true);
      completionLatencies.push(summary.completionLatencyMs);
      evidenceEntries = entries;
    }

    emitAuditMeasurement({
      scenario: "wired-browser-publish-partial-local-fixture",
      samples: completionLatencies.length,
      completionLatencyMs: summarizeSamples(completionLatencies),
      evidence: {
        publishedEventBytes: evidenceEntries
          .filter((entry) => entry.type === "publish")
          .map((entry) => entry.bytes),
      },
    });
  });

  it("reports full rejection and survives a disconnected peer", async () => {
    const session = new RelayTranscriptSession();
    const rejectedRelay = await RelayTranscriptHarness.listen({
      session,
      onPublish(publish) {
        publish.acknowledge(false, "rejected");
      },
    });
    const disconnectedRelay = await RelayTranscriptHarness.listen({
      session,
      onPublish(publish) {
        publish.closeConnection(1);
      },
    });
    harnesses.push(rejectedRelay, disconnectedRelay);
    const pool = new RelayPool();
    await pool.connect([rejectedRelay.url, disconnectedRelay.url]);
    const workflow = session.beginWorkflow("browser-publish-reject-disconnect");
    expect(await pool.publish(event)).toEqual(new Set());
    workflow.complete();

    expect(session.summary(workflow)).toMatchObject({
      publishes: 2,
      acknowledgements: 0,
      rejections: 1,
      relayFanout: 2,
    });
  });

  it("does not complete an unacknowledged publish until the relay disconnects", async () => {
    const session = new RelayTranscriptSession();
    const acceptedRelay = await RelayTranscriptHarness.listen({
      session,
      onPublish(publish) {
        publish.acknowledge(true, "", 5);
      },
    });
    const silentRelay = await RelayTranscriptHarness.listen({
      session,
      onPublish() {},
    });
    harnesses.push(acceptedRelay, silentRelay);
    const pool = new RelayPool();
    await pool.connect([acceptedRelay.url, silentRelay.url]);
    const workflow = session.beginWorkflow("browser-publish-silent-relay");
    const publish = pool.publish(event);
    const outcome = await Promise.race([
      publish.then(() => "completed" as const),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 50)),
    ]);
    expect(outcome).toBe("pending");
    await silentRelay.close();
    expect(await publish).toEqual(new Set([acceptedRelay.url]));
    workflow.complete();

    expect(session.summary(workflow)).toMatchObject({
      publishes: 2,
      acknowledgements: 1,
      rejections: 0,
      relayFanout: 2,
    });
  });

  it("coalesces concurrent publishes of the same event", async () => {
    const session = new RelayTranscriptSession();
    const runHarnesses = [
      await RelayTranscriptHarness.listen({
        session,
        onPublish(publish) {
          publish.acknowledge(true);
        },
      }),
      await RelayTranscriptHarness.listen({
        session,
        onPublish(publish) {
          publish.acknowledge(true);
        },
      }),
    ];
    harnesses.push(...runHarnesses);
    const pool = new RelayPool();
    await pool.connect(runHarnesses.map((harness) => harness.url));
    const workflow = session.beginWorkflow("browser-publish-duplicate-invocation");
    const first = pool.publish(event);
    const duplicate = pool.publish(event);
    const results = await Promise.all([first, duplicate]);
    workflow.complete();

    expect(results).toEqual([
      new Set(runHarnesses.map((relay) => relay.url)),
      new Set(runHarnesses.map((relay) => relay.url)),
    ]);
    expect(session.summary(workflow)).toMatchObject({
      openedConnections: 0,
      connectionReuseCount: 0,
      publishes: 2,
      acknowledgements: 2,
      repeatedOperations: 1,
      relayFanout: 2,
    });

    const retryWorkflow = session.beginWorkflow("browser-publish-post-settlement-retry");
    const retry = await pool.publish(event);
    retryWorkflow.complete();

    expect(retry).toEqual(new Set(runHarnesses.map((relay) => relay.url)));
    expect(retry).not.toBe(results[0]);
    expect(session.summary(retryWorkflow)).toMatchObject({
      publishes: 2,
      acknowledgements: 2,
      repeatedOperations: 1,
      relayFanout: 2,
    });
  });
});
