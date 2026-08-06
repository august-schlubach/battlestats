# "Leave feedback" — footer link + categorized submission modal

**Date:** 2026-08-04
**Status:** implemented 2026-08-05 (`feat/feedback-submission`, `Feedback` model + `POST /api/feedback/`); fix wave 2026-08-05 closed a clock-skew false-rejection, added the `FEEDBACK_SUBMISSION_ENABLED` kill switch, and a wire-contract test gap (see Wire contract below, now the durable copy — the original `.superpowers/sdd/feedback/backend-report.md` is gitignored session scratch, not a contract of record). Frontend (`FeedbackModal` + footer "Leave feedback" link, replacing the removed GitHub link) landed the same day — report in `.superpowers/sdd/feedback/frontend-report.md`. Both halves are now user-reachable; the streamer-submission runbook precedent for a landed-feature writeup is a follow-on, not done here (see that report's self-review).
**Surface:** footer (all routes) + new modal; new backend model/endpoint
**Depends on:** the locale toggle — the categories and the link text are localized

## Why

Two gaps close at once. There is no route for a visitor to report anything, and
the locale rollout specifically needs one: the `NEEDS-NATIVE-CHECK` residue in
`ko.ts` / `ja.ts` is exactly the kind of error only a native-speaking player will
notice, and today they have nowhere to say so. The **Report a language issue**
category is the feedback loop that finishes the translation work.

An earlier draft carried a fourth category, *Where am I?*, on the reasoning that
search and direct traffic dominate arrivals so some visitors land on a player page
with no idea what the site is. It was a joke in the original ask and is **dropped**.
The underlying observation still stands and may deserve its own affordance one day —
but a help link is not feedback, and conflating them serves neither.

## Shape

Mirrors the existing streamer-submission path end to end, which is the point —
that flow already works, is already moderated through Django admin, and needs no
new infrastructure pattern.

**Frontend:** a `FeedbackModal` modelled on `app/components/StreamerSubmissionModal.tsx`
(body-portaled fixed overlay, the treatment established in 4.0.1), opened by a
`Leave feedback` link in `Footer.tsx`.

**Placement (decided 2026-08-05):** it takes the exact slot the **`Fork me on
GitHub`** link occupies today — third in the byline row, between `CC BY-NC-SA 4.0`
and `Add a streamer!` — and **that GitHub link is removed**, not moved. The footer
row does not grow. Rationale: the repo link served contributors, a population this
project does not have; the slot is better spent on the one affordance that closes
a loop we actually need (the `NEEDS-NATIVE-CHECK` translation residue). Drop its
`outbound-link`/`target: github` Umami call with it.

- **Categories** (radio or select, one required): report a language issue ·
  suggest a feature · report a bug.
- **Free-text input**, required, with a length cap.
- Both the link text and the category labels come from the i18n dictionary and
  therefore **change with the locale selector**. These strings are part of the
  locale work's catalogue, not a separate vocabulary.

**Backend:** `POST /api/feedback/`, alongside
`/api/streamer-submissions/` in `battlestats/urls.py` (view at
`warships/views.py:2130` is the template). New `Feedback` model beside
`StreamerSubmission`, surfaced in `warships/admin.py`.

Fields worth capturing beyond category + text: the **active locale** (a language
report is meaningless without knowing which dictionary it refers to), the realm,
and the originating path. No account, no email, no PII.

## Wire contract (durable copy — read this, not the gitignored session report)

**Endpoint:** `POST /api/feedback/` (trailing slash) and `POST /api/feedback`
(no slash) — both registered, both route to `feedback_view`
(`warships/views.py`), matching the `streamer-submissions` twin registration.

**Kill switch:** `FEEDBACK_SUBMISSION_ENABLED` (code default **1** = on). When
set to `0`, the view returns `503` before the serializer runs — see the 503
row below. Documented alongside the other master kill switches in
`agents/runbooks/ops-env-reference.md`.

**Request JSON body:**

| key              | type   | required | notes |
|------------------|--------|----------|-------|
| `category`       | string | yes      | one of exactly: `language_issue`, `feature_suggestion`, `bug_report` |
| `message`        | string | yes      | 1–2000 chars after trim; whitespace-only rejected |
| `locale`         | string | yes      | one of: `en`, `ko`, `ja` (case-insensitive, lowercased on save). Real data, not placeholder — the language selector has been **live in production since v5.0.0** (`NEXT_PUBLIC_LOCALE_SELECTOR`), so submissions genuinely carry `ko`/`ja` and the translated category labels are reachable |
| `realm`          | string | no       | one of: `na`, `eu`, `asia` (case-insensitive, lowercased); omit or `''` → stored as `''` |
| `path`           | string | no       | originating route path; truncated to 255 chars if longer, never rejected for length |
| `website`        | string | no       | **honeypot** — leave blank/omit; any non-empty value is treated as spam and rejected |
| `form_loaded_at` | number | no       | epoch-ms timestamp of when the form/modal was opened; rejected as too-fast if `0 <= (server_now_ms - value) < 2000` (bot heuristic — fixed 2026-08-05: the gate previously had no lower bound, so a client clock running fast made the subtraction negative and **always** failed the `< 2000` check, permanently rejecting that visitor with no recoverable field error) |

`website` and `form_loaded_at` are **not stored** — they're write-only
anti-spam fields popped before save, mirroring `StreamerSubmissionSerializer`
exactly (which carries the identical timing-gate fix — same defect, same
one-line correction, same commit). Both are `required=False`, so the contract
still functions (honeypot/timing gate simply no-ops) if the frontend omits
them.

**Responses:**

- **201 Created** — `{"status": "queued"}` (identical shape to the streamer
  endpoint; no id or echo of the record is returned)
- **400 Bad Request** — field-keyed error dict + `"status_code": 400`
  (the global `custom_exception_handler` appends `status_code` to every DRF
  error body project-wide, e.g.:
  - `{"category": ["\"nope\" is not a valid choice."], "status_code": 400}`
  - `{"message": ["This field may not be blank."], "status_code": 400}`
  - `{"message": ["Ensure this field has no more than 2000 characters."], "status_code": 400}`
  - `{"locale": ["invalid locale"], "status_code": 400}`
  - `{"realm": ["invalid realm"], "status_code": 400}`
  - `{"website": ["spam"], "status_code": 400}`
  - `{"form_loaded_at": ["too_fast"], "status_code": 400}`
  - missing required fields → `{"category": ["This field is required."], "message": [...], "locale": [...], "status_code": 400}`)
  - Only `category`/`message` are surfaced as field-level errors by
    `FeedbackModal`; any other key (the common case is `form_loaded_at`)
    falls back to the generic error banner rather than the unannotated
    "Please correct the errors below." banner (fixed 2026-08-05).
- **429 Too Many Requests** — from `AnonRateThrottle`/`UserRateThrottle` once
  the shared DRF throttle rate is exceeded (same mechanism as every other
  public endpoint, body shape `{"detail": "Request was throttled. Expected
  available in N seconds.", "status_code": 429}` — not endpoint-specific,
  inherited from `PUBLIC_API_THROTTLES`)
- **503 Service Unavailable** — `{"detail": "Feedback submission is
  temporarily disabled."}` when `FEEDBACK_SUBMISSION_ENABLED=0`. **No**
  `status_code` key here — unlike the 400/429 bodies above, this `Response`
  is constructed directly rather than raised as a DRF exception, so it never
  passes through `custom_exception_handler` (verified empirically: `pytest`
  against a live `Client().post(...)` with the switch off returned exactly
  `{"detail": "..."}`, no second key). Checked before the serializer runs, so
  no other validation applies.

## Decisions (2026-08-05)

- **Three categories, not four.** *Where am I?* was a joke in the original ask and
  is **dropped**. Shipping categories: report a language issue · suggest a feature ·
  report a bug.
- **Rate limiting / spam control:** read the streamer endpoint's existing posture
  and match it. Do not invent a second policy for the same class of anonymous
  write.
- **Notification: Django admin only**, as with streamer submissions. No email, no
  webhook. Revisit if volume ever justifies it.
  **Superseded 2026-08-06:** it was not volume that justified it but the fact
  that a queue nobody is told about is a queue nobody reads. `notify_pending_feedback`
  now mails each pending submission exactly once, daily at 13:00 UTC. Moderation
  is still Django admin only; what changed is that the operator learns a
  submission exists without having to remember to look.
  Spec: `droplet-outbound-mail-spec.md`. Runbook:
  `agents/runbooks/runbook-droplet-outbound-mail-2026-08-06.md`.
