# Bounty board: local multi-user matching POC

Status: working draft. This is a hackathon extension to [Phase 1](./phase-1-spec.md), not a production marketplace.

## 1. Product idea

DNM notices a concrete, bounded problem in a user's recent email, durable memory, or recent chat and turns it into a private **bounty draft**. Examples include:

- a recurring school or work carpool;
- picking up a package or supplies;
- help carrying boxes during an upcoming move;
- borrowing a tool for a weekend;
- covering a small, time-bound errand.

After the owner confirms the wording and audience, the bounty becomes visible on a local board. Other users' agents periodically compare open bounties with their own users' availability, capabilities, preferences, and recent context. If a plausible match exists, DNM asks the potential helper whether they want to offer help. The two people are introduced only after both consent.

The product promise is: **surface small ways people can help each other without silently volunteering anyone or publishing private context.**

## 2. Phase-1 demo

The smallest convincing demo uses the existing synthetic mailboxes and one Bun process:

1. Alex's email establishes a childcare gap tomorrow between 12:30pm and 2pm.
2. Bounty extraction creates a private draft such as “School pickup/short childcare coverage tomorrow, 12:30–2pm.”
3. DNM asks Alex to post, edit, or dismiss it. Nothing is shared before confirmation.
4. Alex confirms the sanitized version.
5. A one-shot matcher checks the other synthetic users. A seeded memory or chat states that Casey is nearby, has a car, and is free in that window.
6. DNM privately asks Casey whether they would like to help, giving only the minimum useful bounty details.
7. Casey opts in; DNM asks Alex to accept Casey's offer.
8. After Alex accepts, each receives the other's agreed contact details or a short introduction message.

For the hackathon, “periodically” can mean a timer in the running process plus a manual `bun run bounties:match` command. A durable scheduler, multiple workers, and autonomous outbound execution are not required.

## 3. Terms and trust boundaries

| Term | Meaning | Visibility |
|---|---|---|
| Problem signal | Source text suggesting that the user may need help | Private to that user |
| Bounty draft | A model-generated, editable proposal | Private to the owner |
| Open bounty | A user-confirmed, sanitized request for help | Visible to eligible matching agents |
| Helper signal | Evidence that another user might be able and willing to help | Private to the potential helper |
| Match | A scored pairing between one open bounty and one possible helper | Private system state until separately proposed |
| Offer | A helper's explicit opt-in to a specific bounty | Shared with the owner after helper consent |
| Introduction | Contact/context shared after the owner accepts an offer | Shared only with the two participants |

Important boundary: an agent matching for Casey may receive Casey's private profile plus the **sanitized open bounty**, but never Alex's raw email, chat history, private memories, or evidence excerpts. The matcher may use private facts to decide what to ask its own user, but must not reveal those facts to the other party.

## 4. Scope

### Build now

- A small set of local/synthetic users with stable user IDs.
- Candidate extraction from bounded recent email, active memories, and recent direct-message history.
- Private drafts, explicit publish/edit/dismiss commands, and open-bounty expiry.
- One-shot and interval-based matching in the existing Bun process.
- A conservative matching pass using hard filters followed by one structured model call.
- Separate opt-in from helper and owner before introduction.
- iMessage text prompts and replies through the existing Spectrum message stream.
- A small audit trail of state changes and source references.

### Defer

- A public marketplace or browsable web board.
- Money, rewards, bidding, escrow, ratings, or dispute handling. “Bounty” means a request, not payment.
- Automatic acceptance, contact sharing, calendar edits, purchases, email sends, or travel booking.
- Matching strangers, identity verification, background checks, emergency help, or high-risk services.
- Hosted infrastructure, distributed workers, durable queues, push notifications, or reliable cron.
- Sophisticated geospatial search, route optimization, or a general recurrence engine.
- Learning willingness from silence, inferred sensitive traits, or opaque reputation scores.

## 5. Current-code fit and required correction

The repository already has useful pieces:

- `email_messages`, FTS chunks, bounded Gmail/mock imports, and source metadata;
- `memories`, lifecycle operations, suppression, and generated profile projections;
- `chat_messages` and recent conversation history;
- four seeded mock mailboxes with stable email and phone identities;
- one Spectrum iMessage stream in `src/index.ts`;
- local SQLite with short transactions and a tested FTS fallback.

The present schema is not yet safe for multi-user matching. `email_messages` contains a mailbox address, but `memories`, `memory_suppressions`, the generated `.data/memory.md` profile, and most memory APIs are global. They were built around the earlier one-owner scope and would allow cross-user retrieval in this feature. Before enabling bounty matching:

1. Add a canonical `users` table.
2. Scope every mailbox, email, memory, suppression, generated profile, chat, bounty, and query by `user_id`.
3. Resolve an inbound Spectrum sender to one user before loading any private state.
4. Reject unknown senders and group chats before model or database retrieval.
5. Add negative tests proving that one user cannot retrieve another user's memories, evidence, drafts, or chats.

Because this is a POC, a destructive local reset and reseed is preferable to a complex data migration.

## 6. Proposed architecture

```text
email import ---------+
memory profile -------+--> candidate extractor --> private bounty draft
recent DM history ----+                              |
                                                     | owner confirms
                                                     v
                                               open bounty board
                                                     |
                   +---------------------------------+------------------+
                   | for each other opted-in user                       |
                   v                                                     |
       helper's private profile + recent chat + sanitized bounty         |
                   |                                                     |
                   v                                                     |
             hard filters + model ranker                                 |
                   |                                                     |
                   v                                                     |
        ask helper -> helper opts in -> ask owner -> mutual introduction
```

All of this can run in the existing Bun process. Network/model calls happen outside SQLite transactions. A matcher run reads a bounded snapshot, evaluates it, and writes results in a short transaction.

## 7. Data model

Use ordinary SQLite tables as canonical state. JSON is acceptable for bounded POC fields, but identity and ownership must be relational.

### `users`

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  spectrum_sender_id TEXT NOT NULL UNIQUE,
  phone TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('active', 'paused')),
  bounty_discovery_enabled INTEGER NOT NULL DEFAULT 0,
  helper_matching_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

The sender ID is the trusted lookup key for inbound messages; display names and model output never select a user. The mock-mailbox rows should seed or reference these users. Real and fixture users must not be mixed in the same demo run without an explicit mode flag.

### `mailboxes`

```sql
CREATE TABLE mailboxes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('gmail', 'mock')),
  status TEXT NOT NULL CHECK(status IN ('active', 'disconnected')),
  consent_confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source, email)
);
```

A mailbox belongs to exactly one user. Gmail credentials remain outside SQLite at a private user-specific path such as `.data/users/<opaque-user-id>/gmail-token.json`; the database stores connection metadata only. Imports require both `user_id` and `mailbox_id`, and verify the authenticated mailbox address before writing.

### `user_profiles`

```sql
CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL,
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  source_memory_ids_json TEXT NOT NULL CHECK(json_valid(source_memory_ids_json)),
  model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  is_current INTEGER NOT NULL CHECK(is_current IN (0, 1)),
  UNIQUE(user_id, version)
);

CREATE UNIQUE INDEX user_profiles_current_idx
  ON user_profiles(user_id) WHERE is_current = 1;
```

Profiles are private, derived snapshots—not a shared directory. Each is generated solely from that user's active memories. Regeneration inserts a new version and retires the previous current version in one transaction. The current `.data/memory.md` debug projection becomes optional `.data/users/<opaque-user-id>/memory.md`; SQLite remains canonical.

### Trusted circles

```sql
CREATE TABLE circles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'paused')),
  created_at TEXT NOT NULL
);

CREATE TABLE circle_members (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('active', 'left')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (circle_id, user_id)
);
```

The first demo has one manually curated circle containing the synthetic users. Registration does not automatically join a circle. This keeps “all users in the Photon project” from accidentally becoming a global matching pool.

### Ownership changes

Add `user_id NOT NULL REFERENCES users(id)` to `email_messages`, `memories`, `memory_suppressions`, `chat_messages`, and `import_runs`; email/import rows also reference `mailbox_id`. Uniqueness that is logically per-user should include `user_id`; for example, memory fingerprints become unique on `(user_id, fingerprint, origin)`. Every repository function accepts `userId` explicitly rather than reading a global current user.

### `bounties`

```sql
CREATE TABLE bounties (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  audience_circle_id TEXT NOT NULL REFERENCES circles(id),
  status TEXT NOT NULL CHECK(status IN (
    'draft', 'open', 'paused', 'matched', 'completed', 'dismissed', 'expired'
  )),
  category TEXT NOT NULL CHECK(category IN (
    'ride', 'pickup', 'moving', 'errand', 'borrow', 'pet', 'event', 'other'
  )),
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  public_description TEXT NOT NULL,
  timing_text TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  recurrence_json TEXT CHECK(recurrence_json IS NULL OR json_valid(recurrence_json)),
  area_text TEXT,
  requirements_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(requirements_json)),
  source_summary TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX bounties_board_idx ON bounties(status, expires_at, starts_at);
CREATE INDEX bounties_circle_board_idx
  ON bounties(audience_circle_id, status, expires_at, starts_at);
CREATE INDEX bounties_owner_idx ON bounties(owner_user_id, status, updated_at DESC);
CREATE UNIQUE INDEX bounties_live_dedupe_idx
  ON bounties(owner_user_id, dedupe_key)
  WHERE status IN ('draft', 'open', 'paused', 'matched');
```

The `dedupe_key` is an application-generated hash of stable normalized attributes such as owner, category, time window, recurrence, coarse area, and semantic task label. It prevents concurrent or repeated scans from creating two live versions of the same request.

Only sanitized board fields are exposed to an active member's matching pass: category, title, public description, timing/dates, recurrence, coarse area, requirements, and expiry. `owner_user_id`, `source_summary`, evidence, and private state are not included. `source_summary` should say why DNM generated the draft without copying unnecessary email text.

`recurrence_json` stays intentionally simple, for example:

```json
{"cadence":"weekly","days":["wed"],"localTime":"12:30","until":"2026-11-01"}
```

Do not implement arbitrary RRULE parsing for the demo.

### `bounty_evidence`

```sql
CREATE TABLE bounty_evidence (
  bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('email', 'memory', 'chat')),
  source_id TEXT NOT NULL,
  PRIMARY KEY (bounty_id, source_type, source_id)
);
```

The duplicated `owner_user_id` makes ownership checks explicit. Application validation must verify that each referenced source belongs to the same user. Evidence is never part of a board listing.

### `bounty_matches`

```sql
CREATE TABLE bounty_matches (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  helper_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN (
    'candidate', 'asked_helper', 'helper_declined', 'helper_interested',
    'asked_owner', 'owner_declined', 'accepted', 'expired'
  )),
  score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
  private_reason TEXT NOT NULL,
  helper_blurb TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(bounty_id, helper_user_id)
);
```

`private_reason` can refer to helper-private context and must not be shown to the bounty owner. `helper_blurb` is a sanitized explanation shown to the helper, such as “This matches the availability and driving preference you told me about.” It should not quote sensitive memory.

### `bounty_events`

```sql
CREATE TABLE bounty_events (
  id INTEGER PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL
);
```

Record state transitions such as `draft_created`, `owner_opened`, `helper_declined`, `owner_accepted`, and `expired`. Do not store raw prompts, full emails, or model context in this table.

The application owns the state machine:

```text
draft -> open | dismissed | expired
open -> paused | matched | completed | dismissed | expired
paused -> open | dismissed | expired
matched -> completed | open

candidate -> asked_helper | expired
asked_helper -> helper_interested | helper_declined | expired
helper_interested -> asked_owner | expired
asked_owner -> accepted | owner_declined | expired
```

Updates use the expected prior state in the `WHERE` clause so duplicate or stale commands cannot repeat a transition.

## 8. Bounty extraction

### Inputs

Run extraction per user with a bounded context:

- email: recent threads or newly imported messages, with sender/direction and dates;
- memory: active, source-backed records for that same user;
- chat: the last 20 direct messages or messages since the last extraction checkpoint;
- existing active/draft bounties, to prevent duplicates.

For the demo, run after mock/Gmail import, after a relevant inbound chat turn, and on manual command. Do not continuously rescan the full corpus.

### Eligibility test

A candidate should satisfy all of these:

1. There is a specific unmet need, constraint, or gap—not merely an event or topic.
2. Another ordinary person could reasonably help.
3. The task is bounded by time, place, recurrence, or a clear completion condition.
4. The evidence supports that the owner needs help; an incoming solicitation alone is insufficient.
5. The need is not already resolved, volunteered for, or superseded in newer evidence.
6. It is safe and appropriate for this trusted-network POC.

Examples:

| Evidence | Result |
|---|---|
| “School ends at 12:30; care starts at 2” plus user says they cannot leave work | Draft a pickup/coverage bounty |
| “I can pick up the ice Saturday” | No bounty; the user already volunteered to do it |
| A package receipt | No bounty without evidence that pickup help is needed |
| “We're moving Oct 4 and could use two extra hands” | Draft a moving-help bounty |
| A medical appointment confirmation | No bounty by itself; do not infer disability or a ride need |
| “Can anyone drive me to the appointment?” from the user | A ride draft may be appropriate, with health details removed |

### Structured output

The extractor returns at most three candidates per pass:

```ts
type BountyCandidate = {
  shouldCreate: boolean;
  category: "ride" | "pickup" | "moving" | "errand" | "borrow" | "pet" | "event" | "other";
  title: string;
  publicDescription: string;
  timingText: string;
  startsAt: string | null;
  endsAt: string | null;
  recurrence: null | {
    cadence: "weekly";
    days: string[];
    localTime: string;
    until: string | null;
  };
  areaText: string | null;
  requirements: string[];
  sourceSummary: string;
  evidence: Array<{ type: "email" | "memory" | "chat"; id: string }>;
  confidence: number;
  sensitivityFlags: string[];
};
```

Application code validates enum values, lengths, timestamps, evidence ownership, and that cited IDs were present in the model input. The model cannot choose `owner_user_id` or write SQL.

### Draft policy

- Extraction may create `draft` rows automatically only when discovery is enabled.
- Drafts are private and expire after seven days if ignored.
- High-risk or sensitive candidates are skipped, not merely lowered in score.
- A draft cannot become `open` through model output. Only an authenticated inbound command from its owner can open it.
- Public wording removes names of children, medical details, exact addresses, email subjects, employer/client secrets, and the fact that a need was inferred from email.
- Exact pickup/drop-off addresses are exchanged only after mutual acceptance, directly between participants.

## 9. User interaction

Use short, explicit prompts that can be handled in the existing iMessage loop.

Draft prompt:

> It sounds like you may need help covering school pickup tomorrow from 12:30–2pm. I drafted: “Short pickup/childcare coverage tomorrow afternoon near Riverside.” Want me to post it to your trusted network? Reply **post**, **edit …**, or **dismiss**.

Helper prompt:

> Someone in your network needs help with a school pickup near Riverside tomorrow, 12:30–2pm. This may fit the availability and driving info you've shared. Want to offer help? Reply **offer** or **pass**.

Owner prompt after helper opt-in:

> Casey offered to help with your pickup request. Want me to connect you two? Reply **connect** or **decline**.

State-changing replies should bind to a specific pending draft or match. If more than one is pending, show short numbered choices. Do not let free-form model interpretation mutate an arbitrary row.

Useful commands for the demo:

- `my bounties`
- `post`, `edit …`, `dismiss`
- `pause bounty 2`, `close bounty 2`
- `offer`, `pass`
- `connect`, `decline`
- `stop matching me` and `stop finding help for me`

## 10. Matching

### Pass 1: deterministic filters

For each open, unexpired bounty, consider users only when:

- they are not the owner;
- they are an active member of the bounty's audience circle;
- `helper_matching_enabled = 1` and their account is active;
- they have not declined this bounty;
- the bounty has not already been accepted or closed;
- explicit constraints are not contradicted (time window, required car, approximate area, recurrence);
- the category is allowed by the safety policy.

No evidence means “unknown,” not “eligible.” The system may ask a user a low-pressure clarification, but must not state that they can help.

### Pass 2: model ranking

For each surviving pair, give the matcher:

- the bounty's sanitized board fields;
- a bounded helper-only profile built from that helper's active memories;
- recent helper chat context when it changes availability;
- explicit constraints and prior declines.

Ask for structured output:

```ts
type MatchAssessment = {
  eligible: boolean;
  score: number;
  reasons: string[];
  conflicts: string[];
  missingInformation: string[];
  helperBlurb: string;
};
```

The model ranks whether it is reasonable to **ask**, not whether the helper has committed. Only assessments above a configurable threshold (start at `0.75`) create a candidate match. Cap outreach to one new ask per helper per day and the top three helpers per bounty for the demo.

### Scheduling and idempotency

- Add `scripts/match-bounties.ts` for repeatable one-shot runs.
- Optionally call the same function from a coarse in-process interval while the app runs.
- Rely on `UNIQUE(bounty_id, helper_user_id)` and state checks to avoid duplicate asks.
- Store a `last_bounty_match_at` setting or a small `matching_runs` row for observability.
- Do not hold a database transaction during a model call or message send.
- If sending has an unknown result, log it and require manual retry rather than blindly sending twice.

## 11. Safety, privacy, and abuse rules

### Never generate or match

- emergencies or situations requiring professional emergency services;
- medical, legal, financial, intimate, or otherwise high-stakes assistance;
- childcare by unverified strangers; the POC must use an explicitly trusted synthetic/social network and clearly label that limitation;
- transport of controlled substances, weapons, illegal goods, or unknown packages;
- requests involving credentials, authentication codes, account access, surveillance, or impersonation;
- tasks that expose a child's identity, an exact home address, medical condition, or protected/sensitive trait;
- exploitative labor, harassment, or anything the user has asked the system to forget.

### Consent requirements

- Separate opt-ins for “find help for me” and “suggest ways I can help.”
- No inferred bounty is visible until its owner confirms it.
- No helper is represented as willing until they explicitly offer.
- No identity/contact exchange until the owner accepts that helper's offer.
- Either party can decline without the other seeing private reasons.
- A user can pause all matching and close or delete drafts at any time.

Retrieved email and chat are untrusted data. They may establish evidence but cannot override these rules, enable tools, publish a bounty, or authorize contact sharing.

## 12. Suggested modules

Keep the implementation narrow:

```text
src/users/index.ts             identity lookup and consent flags
src/bounties/index.ts          CRUD and validated state transitions
src/bounties/extract.ts        structured candidate extraction
src/bounties/match.ts          filters and helper-side ranking
src/bounties/present.ts        privacy-safe iMessage text
scripts/generate-bounties.ts   bounded one-shot extraction
scripts/match-bounties.ts      bounded one-shot matching
```

`src/index.ts` remains the orchestration point: filter outbound/self/group/unknown messages, resolve the user, record chat, handle explicit bounty commands, then invoke the bounded assistant loop. Avoid a generic multi-agent framework; “each user's agent” is a logical privacy scope within one process for this demo.

## 13. Build order

### A. Multi-user isolation

- Add `users` and `user_id` scoping.
- Add owned mailboxes, versioned per-user profiles, and one explicit demo circle.
- Seed the four fixture users.
- Require explicit user IDs in email, memory, chat, and profile APIs.
- Add cross-user negative tests.

**Done:** Casey's searches and generated profile cannot return Alex's data, and vice versa.

### B. Private bounty drafts

- Add bounty/evidence/event tables and repository functions.
- Implement bounded extraction over fixtures.
- Add post/edit/dismiss flows without proactive delivery.

**Done:** the childcare-gap evidence creates a private, sanitized draft; a receipt and Alex's existing ice commitment do not.

### C. Matching and two-sided consent

- Seed a clearly supported helper capability/availability memory.
- Implement hard filters, one structured ranker call, and idempotent match records.
- Implement helper offer and owner connect flows.

**Done:** the intended helper is asked once, declining reveals no reason, and contact is shared only after both opt in.

### D. Ambient demo loop

- Add manual extraction/matching scripts.
- Add a conservative in-process interval if useful for the presentation.
- Exercise restart, expiry, duplicate events, and unknown-send-result recovery.

**Done:** a new confirmed bounty is found on the next run without duplicate drafts, asks, or introductions.

## 14. Acceptance tests

1. **Isolation:** every private-source and profile query includes `user_id`; attempts to cite another user's source are rejected.
2. **Consent:** extraction creates only a draft. A model response alone cannot open it.
3. **Sanitization:** the board representation contains no raw source excerpt, exact address, child name, health fact, email address, or phone number.
4. **Grounding:** each draft cites at least one source owned by the bounty owner, and source IDs must have been in the extraction input.
5. **State:** only valid transitions are accepted; for example, `draft -> open`, not `draft -> accepted`.
6. **Duplicate control:** repeated extraction and matching do not create duplicate live bounties or helper asks.
7. **Recency:** newer evidence that resolves a need prevents or closes a stale draft.
8. **No false volunteering:** a helper profile makes the user eligible to be asked, never automatically committed.
9. **Mutual consent:** owner identity/contact is not exposed to a helper before the ask, and helper identity/contact is not exposed to the owner before an offer.
10. **Prompt injection:** instructions inside email, memory text, chat quotes, or bounty descriptions cannot publish, match, or disclose data.
11. **Sender gate:** unknown users, outbound echoes, and group messages cannot reach private tools.
12. **Restart:** open bounties and match state survive a process restart; a manual rerun continues safely.
13. **Circle boundary:** a user outside the bounty's audience circle is never considered or told that the bounty exists.

## 15. Demo metrics and diagnostics

Keep local counters or print a short run summary without private content:

- users scanned;
- source records considered;
- drafts created/skipped as duplicates/skipped as sensitive;
- open bounties scanned;
- helper pairs filtered/scored;
- match candidates created;
- asks attempted/succeeded/failed.

For the demo, manually review candidate precision and match quality. Do not present model confidence as calibrated probability.

## 16. Open product decisions

1. Do we need more than one manually curated circle for the demo, or is one trusted cohort enough?
2. Which categories are acceptable for the hackathon? A safer first cut is `ride`, `pickup`, `moving`, `errand`, and `borrow`, with childcare excluded unless the network is explicitly trusted.
3. Does the owner approve a helper by name, or should the first demo use anonymous capability blurbs until acceptance?
4. When should a recurring bounty expire and require reconfirmation? A weekly bounty should not stay open indefinitely.
5. Is “bounty” user-facing language, or should the interface say “request” or “favor” to avoid implying payment?

## 17. Recommended POC defaults

- Use synthetic users only for the first end-to-end demo.
- Treat the network as a manually curated trusted circle.
- Call the feature “requests” in user messages and “bounties” internally.
- Never auto-publish or auto-volunteer.
- Expire one-off drafts after 7 days, one-off open requests shortly after their end time, and recurring requests after 4 weeks.
- Share only coarse area before mutual acceptance.
- Run extraction and matching manually during development; add a 10-minute in-process interval only when the path is stable.
- Start with FTS and structured facts. Vector search is not required for the bounty demo.
