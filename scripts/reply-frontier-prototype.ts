import { emitKeypressEvents } from "node:readline";
import type { Event } from "nostr-tools";
import {
  runReplyFrontierPrototype,
  type ReplyFrontierCandidate,
  type ReplyFrontierRun,
} from "../src/nostr/prototypes/reply-frontier-prototype";

type FixtureName = "deep" | "wide" | "limit" | "handoff";

const id = (value: number) => value.toString(16).padStart(64, "0");
const event = (value: number, parentId: string): Event => ({
  id: id(value),
  pubkey: "a".repeat(64),
  created_at: 2_000_000_000,
  kind: 1,
  tags: [["e", parentId, "", "reply"]],
  content: `prototype reply ${value}`,
  sig: "b".repeat(128),
});

function fixture(name: FixtureName) {
  const rootId = id(0);
  if (name === "deep") {
    const events: Event[] = [];
    let parentId = rootId;
    for (let value = 1; value <= 5; value += 1) {
      const reply = event(value, parentId);
      events.push(reply);
      parentId = reply.id;
    }
    return { rootId, events };
  }
  if (name === "wide") {
    const direct = Array.from({ length: 60 }, (_, index) =>
      event(index + 1, rootId)
    );
    return {
      rootId,
      events: [
        ...direct,
        ...direct.map((reply, index) => event(index + 1_000, reply.id)),
      ],
    };
  }
  if (name === "limit") {
    return {
      rootId,
      events: Array.from({ length: 101 }, (_, index) =>
        event(index + 1, rootId)
      ),
    };
  }
  return { rootId, events: [event(1, rootId)] };
}

let selectedFixture: FixtureName = "deep";
let selectedCandidate: ReplyFrontierCandidate = "frontier-once";
let result: ReplyFrontierRun | null = null;

async function run() {
  const selected = fixture(selectedFixture);
  const events = [...selected.events];
  let injected = false;
  result = await runReplyFrontierPrototype({
    candidate: selectedCandidate,
    rootIds: [selected.rootId],
    query: async ({ parentIds, pass, onEvent }) => {
      if (selectedFixture === "handoff" && pass === 2 && !injected) {
        events.push(event(2, selected.rootId));
        injected = true;
      }
      events
        .filter((candidate) =>
          candidate.tags.some((tag) =>
            tag[0] === "e" && parentIds.includes(tag[1] ?? "")
          )
        )
        .forEach((candidate) => onEvent(candidate, "memory://prototype"));
      return { state: "complete" };
    },
  });
}

function render() {
  console.clear();
  console.log("\x1b[1mPROTOTYPE — reply frontier traversal\x1b[0m");
  console.log("\x1b[2mQuestion: which bounded parent-set strategy preserves exact closure?\x1b[0m\n");
  console.log(`\x1b[1mfixture\x1b[0m: ${selectedFixture}`);
  console.log(`\x1b[1mcandidate\x1b[0m: ${selectedCandidate}`);
  if (result) {
    console.log(`\x1b[1mcompletion\x1b[0m: ${result.state.completion}`);
    console.log(`\x1b[1mresolved replies\x1b[0m: ${result.eventIds.length}`);
    console.log(`\x1b[1mpasses\x1b[0m: ${result.state.pass}`);
    console.log(`\x1b[1mqueries\x1b[0m: ${result.queryCount}`);
    console.log(`\x1b[1mparent widths\x1b[0m: ${result.requestParentCounts.join(", ")}`);
    console.log(`\x1b[1mrepeated deliveries\x1b[0m: ${result.repeatedDeliveries}`);
  } else {
    console.log("\x1b[2mPress r to run the selected case.\x1b[0m");
  }
  console.log(
    "\n\x1b[1m[d]\x1b[0m deep  \x1b[1m[w]\x1b[0m wide  " +
      "\x1b[1m[l]\x1b[0m limit  \x1b[1m[h]\x1b[0m handoff",
  );
  console.log(
    "\x1b[1m[1]\x1b[0m frontier-once  " +
      "\x1b[1m[2]\x1b[0m cumulative-fixpoint  " +
      "\x1b[1m[r]\x1b[0m run  \x1b[1m[q]\x1b[0m quit",
  );
}

await run();
render();
if (!process.stdin.isTTY) process.exit(0);

emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("keypress", (_text, key) => {
  if (key.name === "q" || (key.ctrl && key.name === "c")) process.exit(0);
  const fixtures: Partial<Record<string, FixtureName>> = {
    d: "deep",
    w: "wide",
    l: "limit",
    h: "handoff",
  };
  if (key.name && fixtures[key.name]) selectedFixture = fixtures[key.name]!;
  if (key.name === "1") selectedCandidate = "frontier-once";
  if (key.name === "2") selectedCandidate = "cumulative-fixpoint";
  void run().then(render);
});
