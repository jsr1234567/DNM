# Phase 1: local hackathon POC

Status: working draft. **This is a local, multi-user hackathon demo, not a production launch or public pilot.** This scope supersedes the earlier production-oriented plan.

Optimize for one convincing end-to-end experience across a small, explicitly allowlisted cohort running on a developer's machine. Manual setup, limited coverage, and manual recovery are acceptable. Do not build infrastructure merely because a future product might need it.

## 1. Demo goal

Each allowlisted user can text the agent on iMessage. The agent resolves the sender to one canonical user before retrieval, then uses only that user's consented email corpus, memories, generated profile, and chat history. It can recall people, plans, and commitments, answer with evidence, and remember an explicit preference across conversations without crossing user boundaries.

Example demo:

1. “What did Maya and I last discuss?” → summarize a thread with its subject/date.
2. “Who have I been meaning to follow up with?” → suggest follow-ups from sourced commitments, clearly marking uncertainty.
3. “Remember that I prefer somewhere quiet.” → save a preference.
4. “Help me draft a reply about dinner.” → use the email context and preference; return a draft in chat, without sending email.
5. “Actually, forget that preference.” → remove it from active memory.

**Email index, durable memory, and permission to act remain separate concepts.** The POC demonstrates the first two; external actions come later.

## 2. Scope and deliberate shortcuts

| Area | Build for the hackathon | Defer |
|---|---|---|
| Users | Small explicitly allowlisted cohort; one isolated profile and one synthetic or consented mailbox per user | Public accounts, self-serve tenancy, cross-channel linking |
| Chat | iMessage DMs through the existing Spectrum setup | WhatsApp, groups, voice, proactive messaging |
| Email connection | Synthetic mailboxes first; developer-assisted Google OAuth separately for each consenting test user if needed | Public onboarding, account-management website |
| Ingestion | One-shot import, up to 30 days / 500 messages initially | History cursors, push subscriptions, periodic reconciliation |
| Search | SQLite FTS5 + `sqlite-vec` | Separate vector service, approximate indexing, search infrastructure |
| Memory | Small source-backed records, explicit remember/correct/forget | Entity graph, elaborate lifecycle/scoring pipelines |
| Execution | One Bun process; in-process turn serialization | Durable queues, leases, outboxes, distributed workers |
| Recovery | Show errors, restart/re-run manually | Automatic crash recovery, delivery guarantees |
| Operations | Local console status, a few smoke tests, local reset script | Dashboards, metrics platform, hosted deployment, backup service |

Synthetic fixtures are an acceptable development/demo fallback, but label them honestly. Demonstrating fixtures does not count as implementing live Gmail access.

## 3. Architecture

```text
 iMessage -> Spectrum -> sender gate -> user resolver -> scoped agent/tool loop
                                                        |
                                      email search + memory/profile tools
                                                        |
                              user-scoped local SQLite (FTS5 + sqlite-vec)
                                                        ^
                                         per-user manual import script
```

- Bun + TypeScript, preserving the existing application.
- `bun:sqlite` for canonical email text, chunks, memories, and chat history.
- FTS5 for keyword search and `sqlite-vec` for semantic search. An embedding model generates vectors; the SQLite extension does not.
- One model provider and one embedding model. Use small context and tool-call limits to keep cost/latency predictable.
- A handful of modules such as `users`, `db`, `gmail`, `search`, `memory`, and `agent`; no generic integration framework. “One agent per user” is a logical data/privacy scope inside the same process, not a distributed runtime.
- A local script handles connection/import/reset. No web app beyond a localhost OAuth callback if the selected supported OAuth flow needs one.

### Local storage

- Keep the database and credentials in a gitignored local data directory with restrictive permissions. Also ignore SQLite WAL/SHM files, mail exports, and token files.
- Enable foreign keys, WAL, and a busy timeout; keep transactions short and outside network/model calls.
- Check `sqlite-vec` loading with the installed Bun version on the development machine. macOS may require a compatible custom SQLite library. If blocked, get the full keyword-search path working first rather than derail the demo.
- Store the embedding model/dimensions and re-index if they change. Exact vector search is fine for this corpus size.
- SQLite is not encrypted by default. Use a trusted machine with disk encryption; do not upload the database or call this an encrypted vault.
- No hosted deployment or live database sharing across machines is required.

## 4. Demo setup and identity

1. Developer configures a small set of permitted Spectrum sender identities and maps each one to a stable local `user_id`.
2. Each mailbox connection belongs to exactly one user. Explicitly confirm that the mailbox belongs to that consenting user before enabling retrieval.
3. Reject unknown senders and group chats **before** reading history, querying private data, or invoking the model. Use provider identity, not a display name, for the allowlist.
4. Resolve `user_id` in trusted application code and pass it explicitly to every private-data API. Do not let the model select a user or mailbox.
5. Keep fixture and real users in separate demo modes. A user may never inherit another user's credentials, memory, generated profile, chat history, or retrieval results.

There is no public sign-up, forwarded connection link, account merging, or public-network promise in this version. Adding a Photon project user is not by itself permission to ingest their mailbox or include them in matching.

## 5. Gmail import

- Use a supported Google OAuth flow and Gmail read-only access. Developer-assisted authorization is fine; do not collect passwords or use copied browser cookies.
- Configure the consent screen/test user as required by Google. Test-mode restrictions or token expiration can be handled with manual reconnect. Local execution does not waive Google's data-use requirements.
- Store each user's tokens separately under a user-specific private path (or an OS keychain if easy); never put them in SQLite, git, logs, chat, or model prompts. No managed key service is required for this POC.
- Fetch a bounded recent set, including sent mail and relevant received/archived mail; exclude spam/trash. Show message count and import time.
- Preserve provider message/thread IDs, participants, dates, subject, and visible text. Strip unsafe HTML and obvious repeated quoted text; skip attachments and external image/link fetching.
- Upsert on provider message ID so rerunning an import does not duplicate messages. Chunk/index and extract memories in simple bounded batches.
- Treat the corpus as a snapshot: no automatic fresh-mail or deletion tracking. State its import time when freshness matters. Manual reset/re-import is acceptable.
- Surface authorization/rate-limit/import failures plainly. A partial import must not be presented as a complete mailbox.

## 6. Search and memory

### Search

Keep canonical email text in ordinary tables and FTS/vector indexes as rebuildable derivatives. Retrieve a small set from each search method, merge/deduplicate by chunk, and load enough thread context to answer. Simple rank fusion is sufficient; skip a separate reranking service initially.

Source-backed answers include sender, subject, and date (and a safe Gmail link if convenient). Say when evidence is missing, stale, or contradictory; do not invent citations.

### Memory

Start with one `memories` table whose rows are all owned by `user_id`, containing:

- ID, kind (`preference`, `person`, `plan`, `commitment`, `episode`), and short claim.
- Evidence references to email or user chat messages.
- Origin (`user-stated` or `email-extracted`), recorded time, and relevant event date if present.
- Status (`active`, `superseded`, `forgotten`).

Extract a small number of useful atomic memories after import. Prefer direct statements over speculative inference. “Maya proposed dinner Friday” is not “dinner is booked”; one email author's statement is not automatically a fact about the user.

Generate a separate profile projection for each user from only that user's active memories. Store the canonical profile snapshot in SQLite and, if a Markdown artifact is useful for debugging, write it beneath a user-specific gitignored directory. Profile generation, retrieval, correction, forgetting, and suppression all require `user_id`; there is no global active-memory view.

Support explicit remember, correction, and forgetting. User corrections take precedence over extracted claims. Forgetting removes the claim from active retrieval and any derived memory index; retain only a minimal source/fingerprint suppression marker to prevent unchanged email from recreating it on rerun. Explain that the source email still exists and may be searchable. A full local reset clears both sources and memories.

Skip a knowledge graph, fancy confidence calibration, automatic sensitive-trait inference, and exhaustive entity resolution. Do not extract credentials/authentication codes into memory.

## 7. Agent and messaging loop

- Filter self-originated events and allow only configured users' direct messages. Resolve the sender to `user_id` before loading conversation history or private tools.
- Persist a small chat history and processed provider message IDs to suppress obvious duplicate events. No exactly-once claim: a crash may require manual recovery.
- Serialize turns in-process; a short burst debounce is optional if it improves the demo. Queue follow-ups rather than implementing cancellation/carry-forward infrastructure.
- Expose a few validated tools: email search, thread fetch, memory search, remember, correct, and forget. Import status can be ordinary context rather than another tool.
- Bound tool iterations, model context, and API timeouts. Display a useful error instead of hanging silently.
- Send concise replies directly through Spectrum. No durable outbox; do not blindly retry a send whose outcome is unknown.
- Email/tool text is untrusted data, not instructions. Do not expose arbitrary SQL, shell execution, generic URL fetching, or email-send tools to the model.
- Draft replies are text in chat only. No calendar writes, purchases, outreach, or mailbox modification.

The app uses Spectrum `^12.8.0`; the bundled skill examples target 12.2.0. Check the installed provider contract when implementing. Confirm the demo recipient is allowed by the project's iMessage plan and quotas. WhatsApp policy/integration work is deferred until that channel is actually in scope.

## 8. Minimum data model

Start with only what the demo needs:

- `users`: stable ID, Spectrum sender identity, display label, status, and separate consent flags.
- `mailboxes`: mailbox/account identity, owning user, source type, and consent/import status.
- `email_messages`: owning user/mailbox, provider IDs, thread ID, headers, dates, normalized body.
- `chunks`: source ID, text, index/version metadata, plus FTS/vector indexes.
- `memories`: owning user, claims, provenance, status, plus user-scoped suppression metadata.
- `user_profiles`: one versioned generated projection per user, with generation/model metadata.
- `chat_messages`: owning user, conversation/message IDs, direction, content, timestamp, processing status.
- Small user-scoped settings/import-status records for mailbox coverage and model versions.

Evidence can be JSON references initially; no need to normalize every relationship. Use a checked-in schema and simple setup script. An explicit destructive reset is acceptable during development; do not silently delete existing data on startup.

## 9. Basic protections we keep

- Use synthetic or explicitly consented email; prefer synthetic data for public screen recordings/demos.
- Keep `.env` untouched by coding agents, as required by `AGENTS.md`; never commit credentials or private data.
- Keep OAuth/local control endpoints on localhost. Do not expose them through an unauthenticated public tunnel for convenience.
- Explain that email excerpts may reach the model vendor and replies travel through Spectrum/iMessage. Local SQLite does not mean offline processing or end-to-end privacy through the backend.
- Do not log email bodies, tokens, full prompts, or private tool outputs by default.
- Provide manual reset procedures for one user and for the whole local demo: stop the app/imports, clear the selected sources/indexes/memories/profiles/history and token files, and document how to revoke Google access. This is a local reset, not a claim of forensic erasure or deletion from external providers.
- Do not build automated backups of private demo data by default; use fixtures to recreate the demo where possible.

Public-launch OAuth verification, production encryption/key management, automated deletion workflows, disaster recovery, and formal security assessments are future work. Basic multi-user isolation and adversarial cross-user tests are local demo gates. Applicable provider policies still apply now.

## 10. Build order and demo acceptance

### A. Chat + local database

Replace echo with a bounded model loop, sender gate, small persistent history, and SQLite setup. Smoke-test vector extension loading; permit temporary FTS-only search if necessary.

**Done:** at least two allowed users get replies scoped to their own data; neither can retrieve the other's history or memory; an unknown sender/group cannot reach private tools; history survives restart.

### B. Email retrieval

Start with a synthetic fixture, then connect the consenting test Gmail account and import a small snapshot.

**Done:** answer prepared mailbox questions for at least two users with correct source references; a deliberate cross-user question returns no private result; an unanswerable question produces an honest “I couldn't find that”; rerunning an import creates no duplicate emails. Label any fixture-only or keyword-only fallback.

### C. Memory + follow-through demo

Add import-time memory extraction, remember/correct/forget, and drafting in chat.

**Done:** recall an explicit preference after restart, use it in a relevant draft, honor a correction, and stop retrieving a forgotten memory. Re-import does not recreate the same forgotten claim.

### D. Rehearse and document

Run the five-step demo, one email prompt-injection test, one disallowed-sender test, and the reset procedure. Note known limitations, external service setup, and manual recovery steps.

**Success means a working local demo—not a production readiness checklist.** Choose the next integration only after this path works.

## 11. Remaining product choices

1. Which storyline makes the strongest demo: relationship follow-through or social planning?
2. Which synthetic cohort should anchor the demo, and do we need any live consenting mailboxes?
3. Which model/embedding provider do we want for the POC?
4. After the core demo works, is the highest-value stretch goal reminders, calendar context, or another read-only integration?

## 12. Multi-user bounty board

The multi-user, two-sided-consent bounty-board concept is specified separately in
[Bounty board: local multi-user matching POC](./bounty-board-spec.md). User-scoped
email, memory, profiles, and chat are now foundation work for that feature, not a
future architecture exercise. Bounty extraction and matching follow once those
isolation tests pass.
