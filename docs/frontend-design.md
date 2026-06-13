# Wired Frontend Visual Refactor — Design Document

**Project:** Wired (getwired.app)  
**Scope:** Presentation layer only — no changes to feature architecture, hooks, Nostr layer, or workers  
**Concept:** Signal in the Void  
**Stack:** React 18, TypeScript, Vite 6, Tailwind 3.4, Bun  
**Date:** 2026-06-13  
**Revision:** 3 (post-review round 2)

---

## 1. Vision and Principles

### Vision

Wired is an anonymous Nostr social feed where proof-of-work filters noise. The interface should feel like tuning into a faint transmission: sparse, legible, slightly uncanny. Not a terminal cosplay, not a cyberpunk theme park — a quiet room where text arrives from elsewhere and resolves into meaning.

The refactor replaces dated visual habits (terminal prompt header, rainbow avatars, ambient pulse, inconsistent blues) with a single coherent atmosphere: **brutal minimalism with one cryptic accent**.

### Design Principles

| Principle | Meaning | Implementation constraint |
|-----------|---------|---------------------------|
| **Stillness over spectacle** | Motion is rare and purposeful | One signature load animation on initial feed batch only; no looping ambient effects |
| **Signal, not decoration** | Every visual element earns its place | Single accent color; metadata whispers on fine-pointer hover, AA-readable elsewhere |
| **Hierarchy through weight, not color** | Read posts first, telemetry second | Three type scales; PoW/time/replies at lowest contrast on hover-capable devices only |
| **Plain text is sacred** | No clickable URLs, IDs, or rich embeds | `TextContent` remains plain `whitespace-pre-wrap`; links stay non-interactive |
| **Depth without chrome** | Thread structure via space and fade, not boxes | Indent + opacity; no card borders on feed |
| **Architecture untouched** | Visual refactor only | New primitives live in flat `src/shared/ui/`; features consume them; no hook/Nostr changes |

### Plain Text Constraint (Preserved Behaviors)

- `TextContent` renders post body as non-interactive plain text — unchanged.
- Quote compose still appends `nostr:note…` to textarea content (existing `PostForm` behavior) — presentation refactor does not alter this.
- Poll creation (kind 1068) and `PollResponder` voting UI remain functionally unchanged; only primitives and styling update. Poll buttons are interactive controls inside posts, not hyperlinks in body text.

### Success Criteria

- Initial feed batch resolves with ~600ms animation (owned by **PR 6**), then static; infinite-scroll appends do not re-resolve
- WCAG 2.1 AA for body text, nav, buttons, and metadata when informative (see §3.2 touch/hover strategy); decorative metadata at rest exempt on `(hover: hover)` devices only
- `prefers-reduced-motion: reduce` disables resolve animation; no blur or transform flash
- All toggles replaced with `SegmentedControl`
- PoW displayed as `signal N` not `PoW N`
- Header no longer uses `~/WIRED/path>` terminal cosplay
- Navigable `PostCard` instances expose a dedicated `open` control in `MetadataRow` (no `role="link"` on articles with nested interactives)
- Feature pages use inherited `bg-void`; no local `bg-black` overrides

---

## 2. Aesthetic Reference Board

### Serial Experiments Lain → UI Mapping

| Lain motif | Wired translation | UI expression |
|------------|-------------------|---------------|
| The Wired as ambient network | Anonymous feed as received transmission | Dark void background, faint grain, no UI chrome |
| Static / signal acquisition | Posts resolving from noise | One-time `resolve-in` on initial feed batch only |
| Layered reality / depth | Thread nesting | `padding-left` + decreasing opacity per depth |
| Whispered identity | Pubkey fragments, no profiles | `SignalAvatar` — deterministic glyph, not gradient blob |
| Technology as invisible infrastructure | PoW as telemetry | `signal 847` in accent; full detail on hover (fine pointer) or always on touch |
| Loneliness, sparse rooms | Empty space | Wide margins, narrow column (`max-w-content`), no card shells |

### Anti-Patterns (Do Not Ship)

| Anti-pattern | Current offender | Replacement |
|--------------|------------------|-------------|
| Terminal cosplay | `~/WIRED/settings>` header | Path-as-signal header (§4.2) |
| CRT / scanlines | N/A today | Never add — grain only at 2–3% opacity |
| Rainbow gradient avatars | `getIconFromHash` in `cardUtils.ts` | `SignalAvatar` with pubkey-derived monochrome pattern |
| Ambient pulse | 4s `animate-pulse` on entire feed (`FeedPage.tsx`) | Remove; per-post resolve on initial batch only |
| Inconsistent accent blues | `sky-800`, `blue-400`, `blue-300`, caret `#0026ff` | Single `--signal` token everywhere |
| Fake loading skeleton | `Placeholder.tsx` | Text-only `acquiring signal…` — no skeleton, no pulse |
| Hand-rolled vertical toggles | `FeedSortToggle`, `NotificationsPage` | `SegmentedControl` |
| Card boxes with invisible borders | `.card` in `index.css` | Borderless post surfaces |
| Monospace at `text-xs` everywhere | `TextContent`, metadata rows | Scale: body 15px, meta 12px, display 18px |
| Hashrate in mining UI | `42kH/s` in PostForm | `computing signal… ~12s` only |

### Mood Keywords

`void`, `resolve`, `whisper`, `telemetry`, `indent`, `stillness`, `anonymous`, `received`

### Visual Weight Distribution

```
████████████████████  Post body text (highest contrast)
████████░░░░░░░░░░░░  Nav links, compose placeholder
████░░░░░░░░░░░░░░░░  Metadata row (default, hover-capable only)
████████░░░░░░░░░░░░  Metadata on touch / coarse pointer (AA secondary)
██░░░░░░░░░░░░░░░░░░  Thread depth fade, grain overlay
█░░░░░░░░░░░░░░░░░░░  Accent signal (sparse use)
```

---

## 3. Design Tokens

### 3.1 CSS Custom Properties

Add to `src/styles/index.css` under `:root`:

```css
:root {
  /* Surfaces */
  --void: #050508;
  --surface: #0a0a0f;
  --surface-raised: #111118;
  --border-ghost: rgba(255, 255, 255, 0.06);
  --border-focus: rgba(94, 234, 212, 0.35);

  /* Text */
  --text-primary: #e8e8ec;
  --text-secondary: #8a8a96;
  --text-muted: #4a4a56;
  --text-ghost: #2e2e38;

  /* Signal accent — resolved: teal */
  --signal: #5eead4;
  --signal-dim: rgba(94, 234, 212, 0.45);
  --signal-ghost: rgba(94, 234, 212, 0.12);

  /* Semantic */
  --danger: #f87171;
  --danger-dim: rgba(248, 113, 113, 0.6);

  /* Typography */
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --font-size-display: 1.125rem;
  --font-size-body: 0.9375rem;
  --font-size-meta: 0.75rem;
  --font-size-micro: 0.6875rem;
  --line-height-body: 1.65;
  --line-height-meta: 1.4;
  --letter-spacing-meta: 0.02em;

  /* Spacing (4px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* Layout */
  --content-max: 36rem;
  --header-height: 3rem;
  --compose-min-height: 5rem;

  /* Motion */
  --duration-resolve: 600ms;
  --duration-fade-in: 200ms;
  --duration-hover: 150ms;
  --duration-focus: 100ms;
  --ease-resolve: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out: cubic-bezier(0.33, 1, 0.68, 1);

  /* Atmosphere */
  --grain-opacity: 0.025;
}
```

### 3.2 Color Palette Reference

| Token | Hex / Value | Usage | Contrast on `--void` |
|-------|-------------|-------|----------------------|
| `--void` | `#050508` | Page background | — |
| `--surface` | `#0a0a0f` | Compose area, inputs | — |
| `--text-primary` | `#e8e8ec` | Post body | **15.2:1** (AAA) |
| `--text-secondary` | `#8a8a96` | Nav, labels, touch metadata | **5.8:1** (AA) |
| `--text-muted` | `#4a4a56` | Decorative metadata (hover devices) | **3.2:1** (decorative only) |
| `--signal` | `#5eead4` | PoW, focus ring, active nav | **9.1:1** (AA) |
| `--signal-dim` | `rgba(94,234,212,0.45)` | Focus ring | **~4.1:1** on void (meets 3:1 UI component) |
| `--danger` | `#f87171` | Form errors | **5.4:1** (AA) |

#### Metadata Contrast Strategy (Touch + Hover)

Metadata is informative (timestamp, signal count) but secondary. Strategy:

| Context | Default metadata contrast | On interaction |
|---------|---------------------------|----------------|
| `@media (hover: hover)` (desktop) | `--text-muted` (decorative) | `--text-secondary` on `:hover` / `:focus-within` of post |
| `@media (hover: none)` (touch) | `--text-secondary` (AA) always | Same; no hover dependency |
| Keyboard focus on navigable post | `--text-secondary` via `:focus-within` | N/A |

```css
/* MetadataRow default */
.metadata-row { color: var(--text-secondary); }

@media (hover: hover) {
  .metadata-row { color: var(--text-muted); }
  .group:hover .metadata-row,
  .group:focus-within .metadata-row {
    color: var(--text-secondary);
  }
}
```

Navigable posts expose summary via `aria-label` including signal and timestamp for screen readers regardless of visual contrast tier.

### 3.3 Typography — Monospace Comparison

| Font | Character | Pros | Cons | Verdict |
|------|-----------|------|------|---------|
| **IBM Plex Mono** | Industrial, neutral, slightly wide | Excellent readability at 15px; mature OSS; good tabular nums | Slightly less "hacker" than alternatives | **Chosen** |
| **JetBrains Mono** | Developer-native | Familiar to builders | Ligatures feel "IDE"; denser at 12px | Alternate (post-v1 only) |
| **SF Mono** (current) | Apple system | Zero load cost on macOS | Inconsistent cross-platform; terminal cosplay | **Remove** |

**Font delivery (resolved):** Self-hosted IBM Plex Mono woff2 in `public/fonts/` with `@font-face` and `font-display: swap`. No Google Fonts in production or PR 1. Weights: 400, 500.

```css
@font-face {
  font-family: 'IBM Plex Mono';
  src: url('/fonts/ibm-plex-mono-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* Repeat for 500 */
```

### 3.4 Tailwind Extension (`tailwind.config.js`)

```js
theme: {
  extend: {
    colors: {
      void: 'var(--void)',
      surface: { DEFAULT: 'var(--surface)', raised: 'var(--surface-raised)' },
      signal: { DEFAULT: 'var(--signal)', dim: 'var(--signal-dim)', ghost: 'var(--signal-ghost)' },
      primary: 'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted: 'var(--text-muted)',
    },
    fontFamily: { mono: ['var(--font-mono)'] },
    fontSize: {
      body: ['var(--font-size-body)', { lineHeight: 'var(--line-height-body)' }],
      meta: ['var(--font-size-meta)', { lineHeight: 'var(--line-height-meta)', letterSpacing: 'var(--letter-spacing-meta)' }],
      display: ['var(--font-size-display)', { lineHeight: '1.4' }],
    },
    maxWidth: { content: 'var(--content-max)' },
    keyframes: {
      resolveIn: {
        '0%': { opacity: '0', filter: 'blur(4px)', transform: 'translateY(2px)' },
        '40%': { opacity: '0.6', filter: 'blur(1px)' },
        '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
      },
      fadeIn: {
        '0%': { opacity: '0' },
        '100%': { opacity: '1' },
      },
    },
    animation: {
      'resolve-in': 'resolveIn var(--duration-resolve) var(--ease-resolve) forwards',
      'fade-in': 'fadeIn var(--duration-fade-in) var(--ease-out) forwards',
    },
  },
},
```

**Note:** `resolve-in` keyframes ship in PR 1 (tokens). PR 6 wires usage. PR 8 does not own motion.

### 3.5 Motion Specification

| Interaction | Animation | Duration | Trigger | Reduced motion |
|-------------|-----------|----------|---------|----------------|
| Initial feed batch | `resolve-in` | 600ms | First mount of first 20 posts; stagger 40ms | `.motion-safe:animate-resolve-in` only |
| Infinite-scroll append | `fade-in` or none | 200ms / 0 | Posts beyond initial batch | Instant opacity 1 |
| Metadata row | color transition | 150ms | hover/focus-within (hover devices) | Instant |
| Nav link active | color + border | 150ms | route match | Same |
| Focus ring | box-shadow | 100ms | `:focus-visible` | Same |
| PoW mining | text swap | — | `doingWorkProp` | No pulse |
| Placeholder | **None** | — | Static copy | — |

#### Infinite Scroll Animation Rule

Resolve applies **once per session** to the first 20 posts visible on initial feed mount. Posts revealed later by `useInfiniteScroll` never resolve.

```tsx
// FeedPage.tsx
const INITIAL_RESOLVE_COUNT = 20;
const RESOLVE_DURATION_MS = 600;
const STAGGER_MS = 40;
const MAX_STAGGER_MS = INITIAL_RESOLVE_COUNT * STAGGER_MS; // 760ms

const [resolveWindowOpen, setResolveWindowOpen] = useState(true);
const prevVisibleCount = useRef(visibleCount);

useEffect(() => {
  const timer = setTimeout(
    () => setResolveWindowOpen(false),
    RESOLVE_DURATION_MS + MAX_STAGGER_MS,
  );
  return () => clearTimeout(timer);
}, []);

useEffect(() => {
  if (prevVisibleCount.current < visibleCount && !resolveWindowOpen) {
    // Infinite scroll fired after resolve window — appended posts stay static
  }
  prevVisibleCount.current = visibleCount;
}, [visibleCount, resolveWindowOpen]);

// Per post:
const animate = resolveWindowOpen && index < INITIAL_RESOLVE_COUNT;

<PostCard animate={animate} animationIndex={index} … />
```

| State | Semantics |
|-------|-----------|
| `resolveWindowOpen` | `true` for ~1360ms after mount (`600ms + 20×40ms`); then `false` permanently |
| `index < 20` | Only first 20 slots in sorted list qualify |
| `animate={false}` | Appended posts render at `opacity: 1`; optional `animate-fade-in` 200ms (no blur) |

Do **not** tie resolve to scroll events or `visibleCount` increases — timer-only closure prevents re-resolve on append.

#### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .animate-resolve-in,
  .animate-fade-in {
    animation: none !important;
    opacity: 1 !important;
    filter: none !important;
    transform: none !important;
  }
}
```

Do not rely solely on global `0.01ms` duration override — explicitly nullify `filter` and `transform` on resolve classes.

### 3.6 Noise Overlay (Atmosphere)

```css
.noise-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: var(--grain-opacity);
  background-image: url('/noise.png');
  background-repeat: repeat;
}
```

- Avoid `will-change: opacity` — unnecessary layer promotion
- Optional: disable grain under `@media (prefers-reduced-motion: reduce)` for vestibular sensitivity (`opacity: 0`)
- 256×256 tile PNG in `public/noise.png`

---

## 4. Layout and Page Specs

### 4.1 Global Shell

```
┌─────────────────────────────────────────────────────────────┐
│  signal /route                         activity    settings   │  ← h-12
│  [skip to content — sr-only, focus visible]                   │
├─────────────────────────────────────────────────────────────┤
│                    ┌─────────────────┐                      │
│                    │  max-w-content  │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

- `body`: `bg-void text-primary font-mono text-body antialiased`
- **No page-level `bg-black`** anywhere — feature pages and `providers.tsx` loading shell use `bg-void`
- `NoiseOverlay` in `App.tsx`
- Skip link in `Header.tsx` (PR 3): `<a href="#main-content" className="sr-only focus:not-sr-only …">skip to content</a>`
- **Skip link + landmarks ship together in PR 3:** every route container uses `<main id="main-content">` before the skip link merges (see PR 3 file list)

### 4.2 Header — Path-as-Signal (v1 Final)

**v1 ships Option A only.** Option B (WIRED wordmark) is documented as a **post-v1** alternative — no `--header-variant` toggle in v1.

#### Route Label Map

URL paths are unchanged (architecture constraint). Display segments decouple from pathname:

```ts
// src/shared/ui/routeLabelMap.ts
const ROUTE_LABEL_MAP: Record<string, string> = {
  '/': '',
  '/notifications': 'activity',
  '/settings': 'settings',
  '/thread': 'thread',
};

function getDisplaySegment(pathname: string): string {
  if (pathname.startsWith('/thread/')) return 'thread';
  return ROUTE_LABEL_MAP[pathname] ?? pathname.slice(1);
}
```

| URL path | Display |
|----------|---------|
| `/` | `signal /` |
| `/thread/:id` | `signal /thread` |
| `/settings` | `signal /settings` |
| `/notifications` | `signal /activity` |

- Format: `signal` in `text-secondary` + `/{segment}` in `text-primary`
- Active route: segment `text-signal font-medium` + `border-b-2 border-signal`
- Nav links: `activity`, `settings` — lowercase, `text-meta text-secondary`, active `text-signal font-medium`
- `aria-current="page"` on active `Link` components
- No `~`, `>`, `WIRED`

#### Post-v1 Alternative (Not in Scope)

Option B fixed wordmark + ghost breadcrumb — revisit if marketing requires branded identity.

### 4.3 Feed Page (`FeedPage.tsx`)

```
┌─ max-w-content mx-auto ─────────────────┐
│  ┌───┐                                   │
│  │ s │  compose textarea                 │
│  │ i │                                   │
│  │ g │  signal 21 [- +]      [transmit] │
│  │ n │                                   │
│  │ a │                                   │
│  │ l │                                   │
│  │   │                                   │
│  │ t │                                   │
│  │ i │                                   │
│  │ m │                                   │
│  │ e │                                   │
│  └───┘                                   │
└──────────────────────────────────────────┘

┌─ max-w-content mx-auto ─────────────────┐
│  Post body, 15px                        │
│  ◌ ab12cd34 · signal 847 · 3 · 2h      │
└──────────────────────────────────────────┘
```

**Layout rules (resolved):**
- Compose row **and** post list both `max-w-content mx-auto` — replaces current `sm:max-w-4xl` compose row
- `FeedSortToggle` → `SegmentedControl` with responsive orientation (see below)
- Remove `isAnimating` and 4s `animate-pulse`
- Post list: `flex flex-col`
- Initial batch: `animationIndex` stagger; see §3.5

#### Feed Sort — Responsive Orientation

`FeedSortToggle` owns orientation logic via `matchMedia` (no duplicate controls):

```tsx
// src/features/feed/FeedSortToggle.tsx
import { useSyncExternalStore } from 'react';

function subscribeSm(cb: () => void) {
  const mq = window.matchMedia('(min-width: 640px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function getSm() {
  return window.matchMedia('(min-width: 640px)').matches;
}

export function FeedSortToggle({ sortByPow, onToggle }: FeedSortToggleProps) {
  const isSm = useSyncExternalStore(subscribeSm, getSm, () => false);

  return (
    <SegmentedControl
      aria-label="Sort feed"
      orientation={isSm ? 'vertical' : 'horizontal'}
      options={[
        { value: 'signal', label: 'signal' },
        { value: 'time', label: 'time' },
      ]}
      value={sortByPow ? 'signal' : 'time'}
      onChange={(v) => onToggle(v === 'time')}
    />
  );
}
```

- **`sm+` (≥640px):** vertical control in left column beside compose
- **`<sm`:** horizontal control in row above compose (`flex-col` wrapper in `FeedPage`)

### 4.4 Thread Page (`ThreadPage.tsx`)

```
[earlier context posts — variant="context", opacity 0.7]

┌─ OP post, variant="op" ─────────────────┐
│  no navigation; metadata text-secondary │
└─────────────────────────────────────────┘

     reply · repost · quote

┌─ composer (when open) ──────────────────┐

────────── border-ghost divider ────────────

     [ reveal low-signal ]   ← copy only; filter logic unchanged

    reply depth 1 — pl-4 opacity-92
        reply depth 2 — pl-8 opacity-84
```

#### Thread Depth Algorithm

```ts
// src/utils/getThreadDepth.ts

const MAX_DEPTH = 3;

/**
 * Walk e-tags to count hops from rootId.
 * Reposts (kind 6): depth of reposted event, not +1 for wrapper.
 */
export function getThreadDepth(
  event: Event,
  rootId: string,
  eventsById: Map<string, Event>,
): number {
  if (event.id === rootId) return 0;
  if (event.kind === 6) {
    const reposted = parseRepost(event);
    if (reposted) return getThreadDepth(reposted, rootId, eventsById);
  }

  let depth = 0;
  let current: Event | undefined = event;
  const visited = new Set<string>();

  while (current && depth < MAX_DEPTH + 2) {
    if (visited.has(current.id)) break; // cycle guard
    visited.add(current.id);

    const parentTag = current.tags.find(
      (t) => t[0] === 'e' && t[1] !== rootId,
    ) ?? current.tags.find((t) => t[0] === 'e');

    if (!parentTag?.[1]) break;
    if (parentTag[1] === rootId) return Math.min(depth + 1, MAX_DEPTH);

    current = eventsById.get(parentTag[1]);
    if (!current) return Math.min(depth + 1, MAX_DEPTH); // missing parent fallback
    depth++;
  }

  return Math.min(depth, MAX_DEPTH);
}
```

**Depth → layout:**

| Depth | Classes |
|-------|---------|
| 0 | `pl-0 opacity-100` |
| 1 | `pl-4 opacity-[0.92]` |
| 2 | `pl-8 opacity-[0.84]` |
| 3+ | `pl-12 opacity-[0.76]` |

`ThreadPage` builds `eventsById` from `allEvents` in `ThreadView` and passes `depth={getThreadDepth(...)}` to each reply `PostCard`.

**Low-signal filter:** Button copy changes only. Filter remains `Math.log2(event.totalWork) > 10` — presentation scope, no logic change.

**Error state:** Invalid note ID shows `invalid signal ref` + `Button` label `return` (navigates to `/`).

### 4.5 Compose (`PostForm.tsx`, `ThreadComposer.tsx`)

- `Textarea variant="compose"`, `Button`, `Input` primitives
- Submit: `transmit`
- Mining: `computing signal… ~12s` — **no hashrate** (drops kH/s telemetry cosplay)
- No `animate-pulse` during mining
- Poll creation UI: `Input` for options, existing logic unchanged

### 4.6 Settings Page (`SettingsPage.tsx`)

Vertical stack, `max-w-content`, primitives throughout. Section title `settings`. About copy unchanged in meaning, updated typography.

### 4.7 Notifications Page (`NotificationsPage.tsx`)

- Desktop: two columns — `your transmissions` | `mentions`
- Mobile: `SegmentedControl` — `yours` | `mentions` (shortened labels intentional; see §6)
- Nav/header remain `activity` / `settings`

### 4.8 Poll Surfaces

#### Poll Creation (`PostForm.tsx`)

- `add poll` / `remove poll` buttons → `Button variant="ghost"`
- Poll option fields → `Input`
- Minimum vote signal field → `Input type="number"` with label `minimum vote signal`
- No layout redesign; kind 1068 tag structure unchanged

#### Poll Responder (`PollResponder.tsx`)

Full control mapping — parity with §4.5 PostForm mining/copy rules:

```
┌─ poll options (per option) ─────────────┐
│  [ Option label ]          (count)     │  ← Button variant="ghost" size="sm"
│  selected: border-signal               │
└────────────────────────────────────────┘

signal [21] [- +]    [results]  [transmit]

computing signal… ~12s                  ← when doingWorkProp; no hashrate, no pulse
```

| Current control | Primitive | Label / copy |
|-----------------|-----------|--------------|
| Option vote `button` | `Button variant="ghost" size="sm"` | option text |
| Selected option border | `border-signal` (not `blue-500`) | — |
| `PoW` label + number input | `Input type="number"` compact + `text-meta` label `signal` | `signal` |
| `-` / `+` stepper | `Button variant="ghost" size="sm"` | `-` / `+` |
| `Show Results` | `Button variant="ghost" size="sm"` | `results` |
| `Submit` | `Button variant="primary" size="sm"` | `transmit` |
| `Doing Work:` + hashrate + `animate-pulse` | `text-meta text-secondary` static line | `computing signal… ~{timeToGoEst}` |
| Vote counts `(N)` | `text-meta text-muted` inline | unchanged logic |

```tsx
// Mining state — matches PostForm §4.5
{doingWorkProp && (
  <p className="text-meta text-secondary" role="status">
    computing signal… ~{timeToGoEst(difficulty, hashrate)}
  </p>
)}
```

- Remove all `animate-pulse`, `text-gray-300`, `blue-*`, `neutral-800` hand-rolled shells
- `min` on signal input: poll's `PoW` tag value (existing `minDiff` logic)
- Plain-text rule: poll prompt in `TextContent` is plain text; option controls are sibling form widgets inside `PollResponder`, **outside** any post navigation control (see §5.2 PostCard)

**PR ownership:** `PollResponder.tsx` in **PR 5**; poll create fields in `PostForm.tsx` (PR 5).

---

## 5. Component Catalog

All primitives in flat **`src/shared/ui/`** (no `primitives/` subfolder). Compositions in same directory.

### 5.1 Primitives

#### `Button`

```tsx
type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// All sizes: min-h-[24px] min-w-[24px] (WCAG 2.2 target size)
// sm: text-meta px-3 py-1.5 | md: text-body px-4 py-2
// focus-visible: ring per Appendix A
```

#### `Input`

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
}

// Error pattern:
// - aria-invalid={!!error}
// - aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
// - error <p id={`${id}-error`} role="alert" className="text-danger text-meta">
// Relay test failure in Settings: role="status" live region for result text
```

#### `Textarea`

```tsx
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'compose';
  label?: string;
}
```

#### `SegmentedControl`

```tsx
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  orientation?: 'horizontal' | 'vertical';
  'aria-label': string;
}

// APG radiogroup pattern — REQUIRED:
// - role="radiogroup" on container
// - role="radio" + aria-checked on segments
// - Arrow keys (Left/Right or Up/Down per orientation) move selection
// - Roving tabindex: selected=0, others=-1
// - Space/Enter selects
```

#### `MetadataRow`

```tsx
interface MetadataRowProps {
  pubkey: string;
  signal: number;
  replySignal?: number;
  replyCount: number;
  timestamp: string;
  repostSignal?: number;
  onOpenThread?: () => void;  // when set, renders navigational control
}
```

Format: `{avatar} {pubkey8} · signal {n} · {count} replies · {time}`

- `repostSignal`: append `· signal +{n}` (boost of reposted note's work — not "relay server")
- `signal === 0`: omit signal segment
- Contrast per §3.2 `@media (hover: hover)` strategy

#### `SignalAvatar`

```tsx
interface SignalAvatarProps {
  pubkey: string;
  size?: 'sm' | 'md'; // 20px | 24px
}
```

**Algorithm (resolved):**

```ts
// src/utils/pubkeyToGrid.ts — SYNC, no Web Crypto

export function pubkeyToGrid(pubkey: string): boolean[] {
  // FNV-1a 32-bit hash of pubkey hex string
  let hash = 0x811c9dc5;
  for (let i = 0; i < pubkey.length; i++) {
    hash ^= pubkey.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  const bits: boolean[] = [];
  for (let i = 0; i < 16; i++) {
    bits.push(((hash >> i) ^ (hash >> (i + 16))) & 1) === 1);
  }
  return bits;
}
```

**Rendering:** SVG only (not box-shadow). 4×4 `<rect>` elements, filled cells `fill="var(--signal-dim)"`, empty cells transparent.

**Test:** `src/utils/pubkeyToGrid.test.ts` — deterministic output for known pubkey vector; snapshot SVG string.

#### `NoiseOverlay`

Fixed grain layer, `aria-hidden="true"`.

### 5.2 Compositions

#### `PostCard`

```tsx
interface PostCardProps {
  event: Event;
  replies: Event[];
  repliedTo?: Event[];
  type?: 'OP' | 'Reply' | 'Post';
  variant?: 'default' | 'context' | 'op';
  depth?: number;
  animate?: boolean;
  animationIndex?: number;
}

// variant styles:
// default: normal opacity
// context: opacity-70 (earlier thread context)
// op: metadata always text-secondary; no navigation

// variant="context" | depth → apply indent/opacity from getThreadDepth if depth provided
```

**Interaction spec — click-target split (no `role="link"` on article):**

Posts may contain nested interactives (`TextContent` expand button, `PollResponder` vote/stepper/submit). ARIA forbids focusable controls inside `role="link"`. Use a **group** article with a **dedicated navigational control** in `MetadataRow`.

```tsx
const isNavigable = type !== 'OP' && variant !== 'op';

<article
  role="group"
  aria-label={`Post by ${pubkeySlice}, signal ${pow}, ${timeAgo}`}
  className="group py-4 …"
>
  {/* Content region — interactive descendants OK; no thread navigation */}
  <div className="post-content">
    <TextContent eventdata={parsedEvent} />
    {repliedTo && <ReplyContext events={repliedTo} />}
  </div>

  <MetadataRow
    pubkey={…}
    signal={…}
    …
    onOpenThread={isNavigable ? handleNavigate : undefined}
  />
</article>
```

**`MetadataRow` navigational control** (when `onOpenThread` set):

```tsx
<div className="metadata-row flex items-center gap-2 …" onClick={(e) => {
  // Pointer: click row chrome (not nested buttons) opens thread
  if (e.target === e.currentTarget) onOpenThread?.();
}}>
  <SignalAvatar … />
  <span className="flex-1 …">…telemetry…</span>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={onOpenThread}
    aria-label="open thread"
  >
    open
  </Button>
</div>
```

| Concern | Rule |
|---------|------|
| Keyboard | `open` button is the **sole** tab-stop for thread navigation on navigable posts |
| Pointer | `open` button + metadata row background click navigate; content/poll regions do not |
| OP / `variant="op"` | `onOpenThread` omitted — no `open` button |
| `PollResponder` / expand | Live inside `post-content`; never wrapped by navigational role |
| Screen readers | `article aria-label` summarizes post; `open` button has explicit label |

#### `TextContent`

```tsx
// Type scale: text-xs → text-body text-primary
// Expand control (comments > 750 chars):
<Button
  type="button"
  variant="ghost"
  size="sm"
  onClick={() => setIsExpanded(!isExpanded)}
>
  {isExpanded ? 'collapse' : 'continue'}
</Button>
// Replaces raw <button> and "...Read more" / "...Read less" copy
```

#### `ReplyContext`

```tsx
interface ReplyContextProps {
  events: Event[]; // uniqBy pubkey
}

// Markup:
// <p className="text-meta text-muted mt-1">
//   re {pubkey8}
//   {additionalCount > 0 && ` +${additionalCount}`}
// </p>
// Shown when repliedTo prop present; multiple pubkeys: "re ab12cd34 +2"
```

#### `CardContainer`

**PR 4:** Delete or replace with fragment. Grep confirms zero `.card` / `card-body` references.

#### `Placeholder`

Text-only — no skeleton, no pulse:

```tsx
export function Placeholder() {
  return (
    <p className="text-meta text-muted text-center py-8" role="status">
      acquiring signal…
    </p>
  );
}
```

#### `FeedSortToggle`

See §4.3 for full `useSyncExternalStore` + `matchMedia('(min-width: 640px)')` implementation. Orientation is dynamic — not hardcoded.

---

## 6. Copy and Voice Guidelines

### Voice Attributes

- **Terse**, **lowercase** UI labels
- **Technical but not jargon-heavy** — no hashrate in mining UI
- **PoW → signal** everywhere user-facing

### Terminology Mapping

| Old | New |
|-----|-----|
| PoW 847 | signal 847 |
| + PoW {n} (repost) | signal +{n} |
| Submit | transmit |
| Doing Work: / 42kH/s | computing signal… ~12s |
| Reply to: ab12cd34 | re ab12cd34 |
| Activity / Settings | activity / settings |
| Your Recent Posts | your transmissions |
| Show All Replies | reveal low-signal |
| Hide 0 PoW Replies | hide low-signal |
| Show Results (poll) | results |
| Poll Submit | transmit |
| Invalid note ID | invalid signal ref |
| Back to feed | return |

### Mobile Label Shortening

| Desktop | Mobile |
|---------|--------|
| your transmissions | yours |
| mentions | mentions |

Intentional brevity for `SegmentedControl` segments on narrow viewports.

### Metadata Row Format

```
{avatar} {pubkey8} · signal {n} · {count} replies · {time}
```

- Repost: `· signal +{n}` — additional work from boosted note (not relay server metaphor)
- Zero signal: omit segment

---

## 7. Migration Strategy

**The PR sequence (§10) is the single source of truth.** Phase mapping for reference:

| Phase | PRs | Outcome |
|-------|-----|---------|
| Foundation | PR 1 | Tokens, font, grain |
| Primitives | PR 2 | Button, Input, Textarea, SegmentedControl |
| Shell | PR 3 | Header, skip link, routeLabelMap |
| Post surface | PR 4 | PostCard, MetadataRow, SignalAvatar, keyboard a11y |
| Feature pages | PR 5, 6, 7 | Compose, feed/thread, settings/notifications |
| Audit | PR 8 | Grep cleanup, contrast audit, dead code removal |

### Backward Compatibility

- No hook/Nostr API changes
- `PostCardProps` adds optional fields with safe defaults
- `getIconFromHash` removed in PR 8 after `SignalAvatar` ships (PR 4)

### Testing Checklist Per PR

- [ ] `bun run typecheck` && `bun run build`
- [ ] Visual: 375px, 768px, 1280px
- [ ] Keyboard: tab order, focus-visible, PostCard `open` button (PR 4+)
- [ ] `prefers-reduced-motion` emulation
- [ ] Touch: metadata AA on mobile viewport
- [ ] Contrast: primary text + interactive labels

---

## 8. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Final monospace font | **Resolved:** IBM Plex Mono |
| 2 | Header direction | **Resolved:** Option A path-as-signal for v1; Option B post-v1 |
| 3 | Accent hue | **Resolved:** Teal `#5eead4` |
| 4 | Font delivery | **Resolved:** Self-hosted woff2 in PR 1 |
| 5 | SignalAvatar algorithm | **Resolved:** FNV-1a sync hash, 4×4 SVG |
| 6 | Zero-signal posts | **Resolved:** Hide signal segment |
| 7 | Placeholder | **Resolved:** Text-only `acquiring signal…` |
| 8 | Poll UI scope | **Resolved:** In scope — PR 5, §4.8 |

### Metadata Visibility — Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Always muted | Strongest whisper | Fails touch/keyboard AA | Rejected |
| Always AA secondary | Full accessibility | Loses hierarchy; noisy feed | Rejected |
| **Responsive disclosure** | Whisper on desktop hover; AA on touch | Two CSS paths | **Chosen** — ties to Lain whisper without mobile regression |

### Post-v1 Appendix: Accent Hue Exploration

Violet `#a78bfa` and amber `#fbbf24` were considered; teal chosen for telemetry clarity and danger differentiation.

---

## 9. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Architecture scope** | Presentation only | User requirement |
| **Design concept** | Signal in the Void | Unifies grain, resolve, telemetry copy |
| **Accent color** | `--signal: #5eead4` (teal) | **Resolved** — AA on void; distinct from danger |
| **Primary font** | IBM Plex Mono, self-hosted | **Resolved** — one delivery path in PR 1 |
| **Header pattern** | Option A path-as-signal | v1 final; `routeLabelMap` for `/notifications` → `activity` |
| **Option B wordmark** | Post-v1 only | No variant toggle in v1 |
| **Component location** | Flat `src/shared/ui/` | **Resolved** — no subfolder |
| **Card model** | Borderless surfaces | Brutal minimal |
| **Avatar** | `SignalAvatar` FNV-1a + SVG | Sync, testable, crisp at 20px |
| **Motion ownership** | PR 6 ships resolve; PR 8 audit only | Eliminates PR 6/8 conflict |
| **Metadata contrast** | Responsive disclosure + `aria-label` | Whisper on `(hover: hover)`; AA on touch; keyboard via focus-within |
| **PostCard navigation** | `role="group"` + `MetadataRow` `open` button | Avoids nested interactives in `role="link"`; keyboard via dedicated control |
| **Thread depth** | `getThreadDepth()` util | Explicit algorithm; max depth 3 |
| **Infinite scroll motion** | Resolve initial 20 only | Matches "then stillness" principle |
| **Plain text constraint** | Preserved; quote/poll behavior unchanged | Product identity |
| **Mining copy** | No hashrate | Avoids terminal telemetry cosplay |
| **Page backgrounds** | `bg-void` inherited only | No local `bg-black` |

---

## 10. PR Plan

Ordered, independently mergeable. Motion ships in **PR 6**, not PR 8.

---

### PR 1: `design-tokens-and-atmosphere`

**Dependencies:** None

**Files:**
- `public/fonts/ibm-plex-mono-{400,500}.woff2` — **required**
- `public/noise.png`
- `index.html` — no Google Fonts link
- `src/styles/index.css` — `:root`, `@font-face`, noise, reduced-motion utilities, resolve keyframes (defined but unused until PR 6)
- `src/styles/Form.css` — caret → `var(--signal)`
- `tailwind.config.js`
- `src/App.tsx` — `<NoiseOverlay />`
- `src/shared/ui/NoiseOverlay.tsx` — **new**
- `src/app/providers.tsx` — loading shell `bg-black` → `bg-void`

**Acceptance:**
- Self-hosted IBM Plex Mono loads; `font-display: swap`
- `--void` background; grain at 2.5%
- `providers.tsx` loading state uses `bg-void` (not `bg-black`)
- `.card` styles commented deprecated (removed PR 4)

---

### PR 2: `ui-primitives`

**Dependencies:** PR 1

**Files:**
- `src/shared/ui/Button.tsx` — **new**
- `src/shared/ui/Input.tsx` — **new**
- `src/shared/ui/Textarea.tsx` — **new**
- `src/shared/ui/SegmentedControl.tsx` — **new**
- `src/features/settings/SettingsPage.tsx` — swap **Save Settings** button to `Button` (required smoke test)

**Acceptance:**
- All primitives: `focus-visible` ring, `min-h-[24px] min-w-[24px]`
- `SegmentedControl`: arrow keys **required** per APG radiogroup; `aria-checked` on segments
- `Input`: `aria-invalid` + `role="alert"` error pattern demonstrated on one field
- In-app smoke: Settings save button uses `Button`

---

### PR 3: `shell-and-navigation`

**Dependencies:** PR 1

**Files:**
- `src/shared/ui/Header.tsx` — rewrite + skip link
- `src/shared/ui/routeLabelMap.ts` — **new**
- `src/features/feed/FeedPage.tsx` — wrap in `<main id="main-content">`
- `src/features/thread/ThreadPage.tsx` — `<main id="main-content">`, remove `bg-black`
- `src/features/settings/SettingsPage.tsx` — convert root to `<main id="main-content">`
- `src/features/notifications/NotificationsPage.tsx` — `<main id="main-content">`

**Acceptance:**
- `signal /{segment}` with `routeLabelMap` (`/notifications` → `activity`)
- Nav: `activity`, `settings` lowercase
- `aria-current="page"` + `font-medium` on active nav
- Skip link in Header → `#main-content` **functional on all routes** (landmarks ship same PR)
- Every route page: exactly one `<main id="main-content">` landmark
- No `~/WIRED`, `>`

---

### PR 4: `post-surface`

**Dependencies:** PR 1, PR 2

**Files:**
- `src/shared/ui/SignalAvatar.tsx` — **new**
- `src/shared/ui/MetadataRow.tsx` — **new**
- `src/shared/ui/ReplyContext.tsx` — **new**
- `src/shared/ui/PostCard.tsx` — click-target split, variants, MetadataRow `onOpenThread`
- `src/shared/ui/TextContent.tsx` — type scale + `continue`/`collapse` Button
- `src/utils/pubkeyToGrid.ts` — **new**
- `src/utils/pubkeyToGrid.test.ts` — **new**
- `src/styles/index.css` — remove `.card` layer
- Delete `src/shared/ui/CardContainer.tsx` OR passthrough fragment with no classes

**Acceptance:**
- Navigable PostCard: `role="group"` on `article`; **no** `role="link"` on article
- `MetadataRow` `open` button is sole keyboard navigational control; Enter/Space on focused `open` opens thread
- `PollResponder` and expand `Button` remain focusable inside `post-content` without ARIA nesting violation
- `article aria-label` includes signal + timestamp
- `TextContent`: `Button variant="ghost"` labels `continue` / `collapse`
- `SignalAvatar` SVG; unit test passes
- `variant="context"` at opacity-70
- Metadata `@media (hover: hover)` strategy implemented
- Grep: zero `card-body`, zero `.card` usage
- `getIconFromHash` unused in PostCard

---

### PR 5: `compose-and-pow-ux`

**Dependencies:** PR 2, PR 4

**Files:**
- `src/features/compose/PostForm.tsx`
- `src/features/compose/ThreadComposer.tsx`
- `src/features/compose/RepostForm.tsx`
- `src/shared/ui/PollResponder.tsx`
- `src/styles/Form.css` — merge into index.css optional

**Acceptance:**
- Primitives throughout; `transmit` submit
- Mining: `computing signal… ~12s` — no hashrate, no pulse
- `PollResponder`: full §4.8 mapping — all controls use primitives; `results` / `transmit` labels; signal stepper via `Input`; mining line matches PostForm (no hashrate, no pulse)
- Grep `PollResponder.tsx`: zero `animate-pulse`, `gray-*`, `blue-*`, `Doing Work`

---

### PR 6: `feed-and-thread-pages` (includes motion)

**Dependencies:** PR 3, PR 4 — **NOT PR 5** (feed may ship with legacy compose styling)

**Files:**
- `src/features/feed/FeedPage.tsx` — remove pulse, resolve stagger, `max-w-content`, `resolveWindowOpen` state (§3.5)
- `src/features/feed/FeedSortToggle.tsx` — responsive `SegmentedControl` orientation (§4.3)
- `src/features/thread/ThreadPage.tsx` — depth, error state, `bg-void`, divider, low-signal copy
- `src/utils/getThreadDepth.ts` — **new**
- `src/utils/getThreadDepth.test.ts` — **new**
- `src/shared/ui/Placeholder.tsx` — text-only
- `src/shared/ui/PostCard.tsx` — `animate` / `animationIndex` props

**Acceptance:**
- **Resolve animation ships here:** initial 20 posts, 600ms stagger, reduced-motion safe
- Infinite-scroll appends: no resolve (optional 200ms fade-in)
- `getThreadDepth` wired; indent + opacity per depth
- Compose row `max-w-content` (not `max-w-4xl`)
- Error state: `invalid signal ref`, `return` button
- No `bg-black` on thread main
- Low-signal button: copy only, threshold unchanged
- `earlierEvents.map` → `PostCard variant="context"`; OP → `variant="op"`
- `FeedSortToggle`: `useSyncExternalStore` orientation per §4.3
- `resolveWindowOpen` timer semantics per §3.5

---

### PR 7: `settings-and-notifications`

**Dependencies:** PR 2, PR 4

**Files:**
- `src/features/settings/SettingsPage.tsx` — full primitive swap (landmark already `<main id="main-content">` from PR 3)
- `src/features/notifications/NotificationsPage.tsx` — primitives only (landmark from PR 3)

**Acceptance:**
- All fields `Input` + `Button`; relay test uses `role="status"`
- Notifications mobile `SegmentedControl`: `yours` / `mentions`
- Copy per §6; `bg-void` only

---

### PR 8: `audit-and-cleanup` (no new motion)

**Dependencies:** PR 5, PR 6, PR 7

**Files:**
- Grep sweep across `src/`
- `src/utils/cardUtils.ts` — remove `getIconFromHash` and gradient arrays
- `src/app/providers.tsx` — verify `bg-void` (fallback if PR 1 missed)
- Any remaining legacy color classes

**Acceptance:**
- **No motion work** — verify PR 6 resolve behavior only
- Keyboard navigation audit documented in PR description
- WCAG AA verified for body, nav, buttons, touch metadata

#### Grep Allowlist / Denylist

| Pattern | Action |
|---------|--------|
| `sky-800`, `blue-300`, `blue-400`, `text-gray-300`, `bg-black` | **Remove** all |
| `animate-pulse` | **Remove** all — zero exceptions |
| `getIconFromHash` | **Remove** |
| `.card`, `card-body` | **Remove** |
| `--signal`, `text-signal` | **Keep** |
| `animate-resolve-in`, `animate-fade-in` | **Keep** (PR 6) |

---

### PR Dependency Graph

```
PR1
 ├── PR2
 ├── PR3
 └── PR4 ← PR2
      ├── PR5 ← PR2 (parallel with PR6)
      └── PR7 ← PR2 (parallel with PR5, PR6)
PR3 + PR4 → PR6 (motion here; no PR5 dep)
PR5 + PR6 + PR7 → PR8 (audit)
```

**Recommended merge order:** PR1 → PR2 → PR3 → PR4 → PR7 ∥ PR5 → PR6 → PR8

---

## Appendix A: Accessibility Specification

### WCAG 2.1 AA Requirements

| Element | Requirement | Implementation |
|---------|-------------|----------------|
| Body text | ≥ 4.5:1 | `--text-primary` on `--void` |
| Nav links | ≥ 4.5:1 | `--text-secondary`; active `--signal` + `aria-current` + `font-medium` |
| Touch metadata | ≥ 4.5:1 | `--text-secondary` always on `(hover: none)` |
| Focus indicators | ≥ 3:1 vs adjacent | `--signal-dim` ring: **4.1:1** on void, **3.6:1** on `--surface-raised` |
| Target size | ≥ 24×24px | `min-h-[24px] min-w-[24px]` on Button, SegmentedControl segments |
| Form errors | Programmatic | `aria-invalid`, `aria-describedby`, `role="alert"` |
| PostCard | Keyboard operable | `open` button in MetadataRow; `role="group"` on article (§5.2) |
| SegmentedControl | APG radiogroup | Arrow keys required |
| Skip link | Bypass block | PR 3, first focusable element |
| Motion | Reduced motion | Explicit `filter: none; transform: none` |

### Focus-Visible Pattern

```css
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--void), 0 0 0 4px var(--signal-dim);
}
```

On `--surface-raised` buttons, use `ring-offset-surface` instead of `ring-offset-void` to maintain 3:1 ring-to-background separation.

### Keyboard Navigation

1. Skip link → header nav → main content → compose → feed posts (tab order)
2. PostCard (navigable): Tab to `open` button in MetadataRow → Enter/Space opens thread
3. Post content controls (expand, poll vote, transmit): tab stops independent of `open` button
4. SegmentedControl: Arrow keys + Space/Enter per APG
5. Content region clicks do not navigate; only `open` button and metadata row chrome

---

## Appendix B: File Inventory

```
src/
├── app/              # NO CHANGES
├── features/         # STYLE ONLY
├── shared/ui/        # ALL primitives + compositions (flat)
├── utils/            # pubkeyToGrid, getThreadDepth; cardUtils cleanup PR 8
├── hooks/            # NO CHANGES
├── nostr/            # NO CHANGES
├── workers/          # NO CHANGES
└── styles/
```

---

*End of design document — revision 3.*