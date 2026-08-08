// PROTOTYPE — interactive shell for notification-history cursor decisions.

import { emitKeypressEvents } from "node:readline";
import {
  initialNotificationHistoryPrototypeState,
  notificationHistoryPrototypeReducer,
  visiblePrototypeEvents,
  type NotificationHistoryPrototypeAction,
  type NotificationHistoryPrototypeState,
  type NotificationStream,
  type PrototypeEvent,
} from "./notification-history-cursor.prototype";

const bold = "\x1b[1m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";
let state = initialNotificationHistoryPrototypeState();

function events(prefix: string, count: number, newest: number, floor?: number): PrototypeEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    createdAt: floor ?? newest - index,
  }));
}

function dispatch(action: NotificationHistoryPrototypeAction): void {
  state = notificationHistoryPrototypeReducer(state, action);
}

function driveWidePage(stream: NotificationStream): void {
  const limit = state.streams[stream].limit;
  dispatch({ type: "receive", stream, relay: "relay-a", events: events(`${stream}-a`, limit, 200) });
  dispatch({ type: "receive", stream, relay: "relay-b", events: events(`${stream}-b`, 4, 198) });
  dispatch({ type: "complete", stream, allTargetsEose: true });
}

function driveBoundary(stream: NotificationStream): void {
  const boundary = state.streams[stream].boundarySecond ?? 176;
  const activePrefix = state.streams[stream].activeBoundaryPrefix ?? "";
  const count = activePrefix === "" ? state.streams[stream].limit : 2;
  dispatch({
    type: "receive",
    stream,
    relay: "relay-a",
    events: events(`${activePrefix || "root"}-${stream}-spill`, count, boundary, boundary),
  });
  dispatch({
    type: "receive",
    stream,
    relay: "relay-b",
    events: [{ id: `${stream}-a-24`, createdAt: boundary }],
  });
  dispatch({ type: "complete", stream, allTargetsEose: true });
}

function finishBoundary(stream: NotificationStream): void {
  let guard = 0;
  while (state.streams[stream].phase === "boundary" && guard < 1_000) {
    driveBoundary(stream);
    guard += 1;
  }
}

function driveIncomplete(stream: NotificationStream): void {
  dispatch({
    type: "receive",
    stream,
    relay: "relay-a",
    events: events(`${stream}-partial`, 3, state.streams[stream].nextUntil ?? 150),
  });
  dispatch({ type: "complete", stream, allTargetsEose: false });
}

function render(): void {
  console.clear();
  console.log(`${bold}Notification history cursor prototype — FALSIFIED / NO-GO${reset}`);
  console.log(`${dim}ID-prefix partition is visualized here but is not legal under pinned NIP-01.${reset}\n`);
  (Object.entries(state.streams) as [NotificationStream, NotificationHistoryPrototypeState["streams"][NotificationStream]][])
    .forEach(([name, value]) => {
      console.log(`${bold}${name}${reset}`);
      console.log(`  phase: ${value.phase}`);
      console.log(`  limit: ${value.limit}`);
      console.log(`  boundarySecond: ${value.boundarySecond ?? "—"}`);
      console.log(`  activeBoundaryPrefix: ${value.activeBoundaryPrefix === null ? "—" : value.activeBoundaryPrefix || "<root>"}`);
      console.log(`  pendingBoundaryPrefixes: ${value.pendingBoundaryPrefixes.length}`);
      console.log(`  nextUntil: ${value.nextUntil ?? "—"}`);
      console.log(`  exhausted: ${value.exhausted}`);
      console.log(`  retryPhase: ${value.retryPhase ?? "—"}`);
    });
  const visible = visiblePrototypeEvents(state);
  console.log(`\n${bold}visible deduplicated events${reset}: ${visible.length}`);
  console.log(`${dim}${visible.slice(0, 8).map((event) => `${event.id}@${event.createdAt}`).join(", ") || "—"}${reset}`);
  console.log(`\n${bold}[a]${reset} authored wide page  ${bold}[m]${reset} mentions wide page`);
  console.log(`${bold}[s]${reset} authored boundary  ${bold}[t]${reset} mentions boundary`);
  console.log(`${bold}[f]${reset} finish authored boundary  ${bold}[g]${reset} finish mentions boundary`);
  console.log(`${bold}[i]${reset} authored incomplete  ${bold}[o]${reset} mentions incomplete`);
  console.log(`${bold}[r]${reset} retry authored  ${bold}[y]${reset} retry mentions`);
  console.log(`${bold}[n]${reset} next authored  ${bold}[p]${reset} next mentions  ${bold}[x]${reset} reset  ${bold}[q]${reset} quit`);
}

emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("keypress", (_input, key) => {
  if (key.name === "q" || (key.ctrl && key.name === "c")) process.exit(0);
  if (key.name === "a") driveWidePage("authored");
  if (key.name === "m") driveWidePage("mentions");
  if (key.name === "s") driveBoundary("authored");
  if (key.name === "t") driveBoundary("mentions");
  if (key.name === "f") finishBoundary("authored");
  if (key.name === "g") finishBoundary("mentions");
  if (key.name === "i") driveIncomplete("authored");
  if (key.name === "o") driveIncomplete("mentions");
  if (key.name === "r") dispatch({ type: "retry", stream: "authored" });
  if (key.name === "y") dispatch({ type: "retry", stream: "mentions" });
  if (key.name === "n") dispatch({ type: "load-next", stream: "authored" });
  if (key.name === "p") dispatch({ type: "load-next", stream: "mentions" });
  if (key.name === "x") state = initialNotificationHistoryPrototypeState();
  render();
});

render();
