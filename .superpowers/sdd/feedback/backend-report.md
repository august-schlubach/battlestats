# Feedback submission — backend report

Branch: `feat/feedback-submission` (forked from `main` @ v5.0.1)
Spec: `agents/work-items/feedback-submission-spec.md`
Mirrored flow: `StreamerSubmission` (model in `warships/models.py`, serializer in
`warships/serializers.py`, view `streamer_submission_view` in `warships/views.py`,
admin `StreamerSubmissionAdmin` in `warships/admin.py`, URLs in
`battlestats/urls.py`, tests `StreamerSubmissionViewTests` in
`warships/tests/test_views.py`).

## Wire contract (frontend-facing, verbatim)

**Endpoint:** `POST /api/feedback/` (trailing slash) and `POST /api/feedback`
(no slash) — both registered, both route to the same view, matching the
`streamer-submissions` twin registration.

**Request JSON body:**

| key              | type   | required | notes |
|------------------|--------|----------|-------|
| `category`       | string | yes      | one of exactly: `language_issue`, `feature_suggestion`, `bug_report` |
| `message`        | string | yes      | 1–2000 chars after trim; whitespace-only rejected |
| `locale`         | string | yes      | one of: `en`, `ko`, `ja` (case-insensitive, lowercased on save) |
| `realm`          | string | no       | one of: `na`, `eu`, `asia` (case-insensitive, lowercased); omit or `''` → stored as `''` |
| `path`           | string | no       | originating route path; truncated to 255 chars if longer, never rejected for length |
| `website`        | string | no       | **honeypot** — leave blank/omit; any non-empty value is treated as spam and rejected |
| `form_loaded_at` | number | no       | epoch-ms timestamp of when the form/modal was opened; if the gap to submit time is < 2000ms, rejected as too-fast (bot heuristic) |

`website` and `form_loaded_at` are **not stored** — they're write-only
anti-spam fields popped before save, mirroring `StreamerSubmissionSerializer`
exactly. Frontend should send `form_loaded_at: Date.now()` captured at modal-open
time, and include a genuinely-hidden `website` field that stays empty for real
users. Both are `required=False`, so the contract still functions (honeypot/timing
gate simply no-ops) if the frontend omits them — but the recommendation is to
send both, to get the same spam floor the streamer form has.

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
- **429 Too Many Requests** — from `AnonRateThrottle`/`UserRateThrottle` once
  the shared DRF throttle rate is exceeded (same mechanism as every other
  public endpoint, body shape `{"detail": "Request was throttled. Expected
  available in N seconds.", "status_code": 429}` — not endpoint-specific,
  inherited from `PUBLIC_API_THROTTLES`)

All of the above were verified empirically against the live serializer (see
Self-review below), not inferred from reading code.

## Model — `Feedback` (`warships/models.py`, beside `StreamerSubmission`)

```python
class Feedback(models.Model):
    class Category(models.TextChoices):
        LANGUAGE_ISSUE = 'language_issue', 'Report a language issue'
        FEATURE_SUGGESTION = 'feature_suggestion', 'Suggest a feature'
        BUG_REPORT = 'bug_report', 'Report a bug'

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [...]  # same list-of-tuples idiom as StreamerSubmission

    category = models.CharField(max_length=32, choices=Category.choices)
    message = models.CharField(max_length=2000)
    locale = models.CharField(max_length=8)
    realm = models.CharField(max_length=8, blank=True, default='')
    path = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='feedback_reviewed')
```

`Meta.ordering = ['-created_at']`; one index `feedback_status_idx` on
`(status, created_at)`, same shape as `streamer_sub_status_idx`.

Migration: `warships/migrations/0086_add_feedback.py`, generated with
`makemigrations` (not hand-written), depends on `0085_shippopdailyagg` — no
collision with anything on `main`.

## What was mirrored, and where/why it deviates

**Mirrored exactly:**
- `STATUS_PENDING/APPROVED/REJECTED` as plain class attributes +
  `STATUS_CHOICES` list-of-tuples (not `TextChoices`) — kept distinct from
  `category`'s `TextChoices` per the task's explicit instruction to use
  `TextChoices` only for the machine-value enum; `status` keeps the existing
  pattern so there's exactly one new idiom introduced (category), not two.
- `created_at`/`reviewed_at`/`reviewed_by` fields and the
  `Meta.indexes`/`ordering` shape.
- The view: `@api_view(["POST"])` + `@throttle_classes(PUBLIC_API_THROTTLES)`,
  serializer validate-then-save, `Response({'status': 'queued'}, status=201)`.
- The URL registration: both slash and no-slash `path()` entries, same naming
  convention (`feedback` / `feedback_no_slash`).
- The serializer's honeypot (`website`) and timing-gate (`form_loaded_at`)
  fields and their `validate_*` methods, copied verbatim, and the `create()`
  pattern of popping both before `super().create()`.
- Admin: `list_display`/`list_filter`/`search_fields`/`readonly_fields`, plus
  `approve_selected`/`reject_selected` actions with the same
  `queryset.update(status=..., reviewed_at=timezone.now(), reviewed_by=request.user)`
  body. (Dropped the streamer action's extra step of promoting a `Player` row
  to streamer status — there's no analogous cross-model side effect for
  feedback, so `approve_selected` is just a status flip.)
- Test file location/class shape: `FeedbackViewTests(TestCase)` in
  `warships/tests/test_views.py`, `setUp` calling `cache.clear()`, a
  `_payload(**overrides)` helper, one test per required-invalid case.

**Deliberate deviations (each reasoned below):**

1. **No `submitter_ip` / `submitter_ua`.** `StreamerSubmission` captures both.
   The task instructions are explicit — "No account, no email, no PII" — and
   an IP address is PII. The task's own admin field list
   (`category, locale, realm, status, created-at`) also never mentions an IP
   column, unlike `StreamerSubmissionAdmin` which puts `submitter_ip` in both
   `list_display` and `search_fields`. Both signals point the same way, so
   `Feedback` has no IP/UA field at all — not blank, absent — and
   `FeedbackSerializer.create()` doesn't touch `request.META`. Covered by
   `test_no_pii_persisted`, which asserts the fields don't exist on the model
   rather than that they're empty.

2. **`message` cap: 2000 chars, no direct precedent.** `StreamerSubmission`
   has no free-text field a user fills in — `notes` is admin-authored and
   unbounded (`TextField`). The nearest analogs are all short identifiers:
   `ign`/`twitch_handle` at 64, `submitter_ua` truncated to 300,
   `EntityVisitEvent.route_path` at 255. None of those are prose. 2000 is
   chosen as a ceiling generous enough for a real bug description or feature
   ask, small enough to bound abuse/storage. Enforced by the auto-generated
   `CharField(max_length=2000)` validator (DRF derives it from the model
   field since `message` isn't redeclared on the serializer), which 400s
   before `validate_message` even runs — verified empirically, see below.
   `validate_message` still strips and rejects a falsy/whitespace-only
   result as a second layer (DRF's `CharField` already trims whitespace by
   default, so `"   "` independently 400s as "may not be blank" — both paths
   converge on 400).

3. **`locale` is required, `realm` is not.** The spec's own rationale for
   capturing `locale` — "a language-issue report is meaningless without
   knowing which dictionary it refers to" — only holds if it's always
   present, so it does not get `realm`'s `blank=True, default=''` treatment.
   `realm` mirrors `StreamerSubmission.realm` exactly (optional, lowercased,
   validated against `{na, eu, asia}`).

4. **`path` truncates instead of rejecting on overflow.** The serializer
   field is redeclared as a plain `CharField(required=False, allow_blank=True)`
   without a `max_length`, so it doesn't inherit the model's automatic
   400-on-overflow validator; `validate_path` truncates to 255 instead. This
   mirrors the `submitter_ua[:300]` idiom (truncate metadata, don't fail the
   submission over it) rather than the `ign`/`twitch_handle` idiom (reject).
   Rationale: `path` is provenance the frontend supplies automatically
   (`window.location.pathname`), not something a user typed and could
   sensibly be asked to shorten — failing the whole submission over an
   unusually long URL would be the wrong tradeoff.

5. **`category` gets model-level `choices=` (auto `ChoiceField`); `locale`/
   `realm` don't (custom `validate_*` instead).** This follows the task's
   explicit instruction to use `TextChoices` with stable machine values for
   `category`, while keeping `locale`/`realm` on the same custom-validator
   shape `StreamerSubmission.realm` already established — one new pattern,
   not a second one layered over the old.

## Rate limiting / spam-control finding

The streamer endpoint's only posture is the **global DRF throttle classes**
(`PUBLIC_API_THROTTLES = [AnonRateThrottle, UserRateThrottle]`, rates from
`DRF_THROTTLE_ANON_RATE`/`DRF_THROTTLE_USER_RATE` env vars, default
`120/minute` anon / `600/minute` authenticated) plus the honeypot + timing
gate described above. `feedback_view` carries the identical
`@throttle_classes(PUBLIC_API_THROTTLES)` decorator and the identical
honeypot/timing fields — nothing invented, nothing added beyond what the
streamer path already does for this exact class of anonymous public write.
**No endpoint-specific rate limit exists for either path** (e.g. no
per-IP-per-hour cap on submission count) — if that's ever wanted it's a
follow-on, not something added here.

## Test output

```
cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 \
  /home/august/code/battlestats/server/.venv/bin/python -m pytest warships/tests/ --nomigrations --tb=short
...
862 passed, 2 skipped, 100 warnings, 3 subtests passed in 5.45s
```

Baseline before this change was ~850 passed; the new `FeedbackViewTests` class
contributes the delta (happy path runs as one test with 3 subtests, one per
category, plus 10 more individual tests) with zero regressions elsewhere.

New tests added (`warships/tests/test_views.py`, `FeedbackViewTests`):
happy path × 3 categories (subTest), invalid category, empty message,
whitespace-only message, over-cap message, invalid locale, missing locale,
invalid realm, locale/realm/path persistence, honeypot trip, too-fast
submission, and a no-PII structural assertion.

## Postgres migration verification

Ran against the local `battlestats-db` Docker Postgres container
(`postgres:15`, already running from the main checkout's `docker-compose.yml`,
port 5432 on localhost). Confirmed via `showmigrations` first that this
database had **zero migrations applied** (`\dt` showed no relations at all),
so running the full chain was a clean, non-destructive operation — no
existing dev data was at risk.

```
DJANGO_SECRET_KEY=k DB_ENGINE=postgresql_psycopg2 DB_HOST=127.0.0.1 DB_PORT=5432 \
DB_NAME=battlestats DB_USER=django DB_PASSWORD=<from docker inspect> \
/home/august/code/battlestats/server/.venv/bin/python manage.py migrate
...
Applying warships.0086_add_feedback... OK
```

All 86 `warships` migrations plus Django/DRF/celery-beat/session migrations
applied cleanly, in order, no errors. Confirmed the resulting table shape with
`psql \d warships_feedback` — columns, types, the `feedback_status_idx`
composite index, and the `reviewed_by_id` FK to `auth_user` all present as
expected. `switch_db_target.sh` was deliberately **not** used (it mutates
shared on-disk `.env` state and `cloud` would point at production); env vars
were passed inline to one-off `manage.py` invocations instead, and the
worktree's `server/` has no `.env` file to pick up accidentally.

## Self-review

- Verified every response shape in this report empirically against a live
  `Client().post(...)` call through the actual serializer/view (not just read
  from code), including the exact 400 body per validation failure and the
  `status_code` key the global exception handler injects.
- Confirmed `message`'s over-cap case genuinely 400s rather than reaching the
  database — this was flagged as a known DRF trap (a bare `TextField` on the
  model wouldn't have gotten a `max_length` validator for free; `CharField`
  does).
- Confirmed no regression: full suite before (~850) and after (862, +2
  skipped unrelated) both green.
- Confirmed the migration is generator-produced, not hand-written, and
  applies cleanly on a real (empty) Postgres instance, not just sqlite with
  `--nomigrations` (which would never have exercised it).
- Did **not** touch `agents/doc_registry.json`, `CLAUDE.md`'s data-models
  list, or author a runbook for this feature. The streamer submission feature
  has a landed runbook (`runbook-streamer-submission-feature-2026-04-07.md`)
  documenting a *shipped, user-reachable* flow; this backend half has no
  reachable surface yet (the frontend modal is a separate task not yet
  landed), so a runbook now would describe a feature nobody can use. Treating
  this as a follow-on once both halves ship together, rather than documenting
  an endpoint the doctrine's own "smallest safe vertical slice" principle
  suggests shouldn't be presented as a finished user-facing capability yet.
  Flagging this explicitly rather than silently skipping it.
- Did not add an endpoint-specific rate limiter beyond what streamer has —
  see the Rate limiting section above; this was a explicit instruction
  ("do not invent one... note it as a follow-on").
