# Feedback submission — review fix wave report

Branch: `feat/feedback-submission`
Applied against the review findings F1–F6 (see task). One pass, all six items.

**Locale correction carried into this work:** `NEXT_PUBLIC_LOCALE_SELECTOR` is
live in production since v5.0.0, not dark. The `locale` field on `Feedback`
submissions carries real `ko`/`ja` values and the translated category labels
are reachable. This is stated explicitly in the new wire-contract table in
`agents/work-items/feedback-submission-spec.md` so it can't be misread as
inert again. No doc text written in this pass implies the locale surface is
inactive.

---

## F1 (Important) — missing `message` wire-contract assertion

**File:** `client/app/components/__tests__/FeedbackModal.test.tsx`

The test at (former) lines 48–54 parsed the real POST body and asserted six
of the seven fields (`category`, `locale` presence, `realm` presence, `path`,
`website`, `form_loaded_at`) but never asserted `message` — the field
carrying the actual feedback text. Added:

```ts
expect(body.message).toBe('The Activity tab chart is blank on my profile.');
```

**Mutation-testing evidence (both directions run, not just the fix):**

1. Added the assertion above. Ran `npm test -- app/components/__tests__/FeedbackModal.test.tsx`
   — **595/595 green** (assertion passes against the correct field name).
2. Renamed the wire key in `FeedbackModal.tsx:95` from `message: trimmedMessage`
   to `msg: trimmedMessage` (the exact defect class F1 describes — a silent
   rename that would 400 every real submission while every other assertion in
   the suite stays green).
3. Re-ran the same test file — **1 failed, 594 passed**:
   ```
   FAIL app/components/__tests__/FeedbackModal.test.tsx
     ● FeedbackModal submit tracking › sends the machine category value, never the display label, in the request body
       expect(received).toBe(expected)
       Expected: "The Activity tab chart is blank on my profile."
       Received: undefined
   ```
   Confirms the new assertion is load-bearing — it is the only one in the
   file that would have caught this class of regression.
4. Restored `message: trimmedMessage`. Re-ran — **595/595 green** again.

The assertion binds. `FeedbackModal.tsx` itself is otherwise unchanged by F1
(only the test file changed; the component was mutated and restored purely
as verification, not left mutated).

---

## F2 (Important) — `FEEDBACK_SUBMISSION_ENABLED` kill switch

**Files:** `server/warships/views.py`, `server/warships/tests/test_views.py`,
`agents/runbooks/ops-env-reference.md`

Read the repo's existing default-ON kill-switch idiom
(`SNAPSHOT_ACTIVE_PLAYERS_ENABLED`, `ENRICHMENT_POOL_MAINTENANCE_ENABLED`:
`os.getenv("X_ENABLED", "1") != "1"`, early-return) and matched it in
`feedback_view`:

```python
if os.getenv("FEEDBACK_SUBMISSION_ENABLED", "1") != "1":
    return Response(
        {'detail': 'Feedback submission is temporarily disabled.'},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )
```

Checked before the serializer runs, so a disabled endpoint never touches the
DB or the honeypot/timing logic. `os` was already imported at module level in
`views.py`; no new import needed.

**Verified the 503 body empirically** (not assumed): the manually-constructed
`Response(...)` here never passes through `custom_exception_handler` (that
handler only fires for exceptions DRF's `exception_handler` catches), so the
body is exactly `{"detail": "..."}` — **no** `status_code` key, unlike the
400/429 bodies the serializer/throttle produce. Confirmed via a throwaway
`Client().post(...)` test run before writing this into the spec, to avoid
documenting an unverified guess.

**Tests added** (`FeedbackViewTests`):
- `test_enabled_by_default` — no env override, submission succeeds (201).
- `test_disabled_by_kill_switch` — `FEEDBACK_SUBMISSION_ENABLED=0` via
  `patch.dict(os.environ, ...)` (same pattern as the existing
  `test_cross_realm_fallback_disabled_stays_single_realm` test), asserts 503
  and that no `Feedback` row was created.

**Docs:** new bullet in `agents/runbooks/ops-env-reference.md` under "Player
request path", alongside `CROSS_REALM_FALLBACK_ENABLED`, naming the default,
the 503 behavior, and that it's independent of the frontend's
`STREAMER_SUBMISSION_ENABLED`-style component flag (hiding the footer link
does not close the endpoint — that was the whole point of this finding).

---

## F3 (Important) — Umami event-reference runbook reconciliation

**File:** `agents/runbooks/runbook-umami-event-reference-2026-06-18.md`

Three fixes, all in the "Footer & streamer funnel" table:

1. **`outbound-link` target enum** — removed `'github'` (the link itself was
   removed, not just left unclicked); noted historical `target:'github'` rows
   in the capture log predate the removal. Line references corrected
   (`Footer.tsx:32,44,91,101` — `50` dropped since it was the GitHub link;
   `footer-lil-boots`'s reference also corrected `20→24`).
2. **`streamer-open`** — kept the row (feature intact, not deleted) but
   marked ⛔ **gated off** behind `STREAMER_SUBMISSION_ENABLED` (the frontend
   constant in `StreamerSubmissionModal.tsx`, currently `false`): the
   button/modal don't render while off, so the event structurally cannot
   fire. Same treatment applied to the sibling `streamer-submit` row (both
   gated by the same flag). Neither is "broken" — they're unreachable by
   design, and the note says so instead of leaving a stale ✅.
3. **New rows: `feedback-open` / `feedback-submit`** — added with payload
   shapes, trigger descriptions, and source line refs
   (`Footer.tsx:54` / `FeedbackModal.tsx:104,116,121,125`), marked 🟡 pending
   captures (added 2026-08-05, not yet deployed to prod at review time).

All `Footer.tsx` line numbers in the table were re-checked against the
current file content, not carried over from the stale pre-branch line
numbers.

---

## F4 (Minor) — clock-skew false rejection

**Files:** `server/warships/serializers.py` (both
`StreamerSubmissionSerializer.validate_form_loaded_at` and
`FeedbackSerializer.validate_form_loaded_at`), `server/warships/tests/test_views.py`

Both gates changed identically:

```python
# before
if value and (time.time() * 1000 - value) < 2000:
# after
if value and 0 <= (time.time() * 1000 - value) < 2000:
```

A `form_loaded_at` in the future (client clock fast) made the subtraction
negative, which is `< 2000` for any skew — the visitor was rejected
unconditionally, with `too_fast` never in the surfaced field-error set, so
`FeedbackModal`/`StreamerSubmissionModal` rendered "Please correct the errors
below." with no annotated field and no way to retry into success. The `0 <=`
lower bound restores the intended meaning ("submitted implausibly soon after
load"), which only a non-negative small gap can mean. A bot omitting the
field still bypasses the gate entirely, unaffected.

Fixed both serializers deliberately, per the task's explicit scope
correction — it's the identical one-line defect in both, and leaving one
broken while fixing the other would be a worse end state than either
uniform choice.

**Tests added:** `test_future_skewed_clock_not_rejected` in both
`FeedbackViewTests` and `StreamerSubmissionViewTests` — `form_loaded_at` set
60s in the future, asserts 201 (previously would have 400'd before this fix;
confirmed by re-reading the pre-fix condition, not re-run against unfixed
code, since the fix and test were written together — see Self-review).

---

## F5 (Minor) — generic banner with nothing beneath it

**File:** `client/app/components/FeedbackModal.tsx`

The 400 handler always set the generic "Please correct the errors below."
banner regardless of whether `fieldErrors` actually got populated. Since only
`category`/`message` are mapped to field errors, any other rejection key
(`too_fast`, `spam`, `locale`, `realm`) produced that banner over a form with
no visible annotation — actively misleading ("look below" when there's
nothing below).

```tsx
setFieldErrors(errs);
setGenericError(
    Object.keys(errs).length > 0
        ? t('feedback.error.correctBelow')
        : t('feedback.error.generic'),
);
```

Reuses the existing `feedback.error.generic` key (already present in the
dictionary, used elsewhere in the same handler for non-400 failures) — no
new i18n strings, no English-text change to any *existing* render path.

**Test added:** a 400 body of `{ form_loaded_at: ['too_fast'] }` (no
`category`/`message` keys) asserts the generic message renders and
"Please correct the errors below." does **not**.

---

## F6 (Minor) — CLAUDE.md must not cite a session artifact as the contract of record

**Files:** `CLAUDE.md`, `agents/work-items/feedback-submission-spec.md`

`agents/work-items/feedback-submission-spec.md` gained a new **"Wire
contract"** section, folded in from `.superpowers/sdd/feedback/backend-report.md`:
endpoint (both slash/no-slash registrations), the kill switch, the full
request-field table, and every response shape/status code (201/400/429/503)
— including the 503 body's empirically-confirmed shape (see F2) and the
post-fix 400/F5 client-handling behavior, so the spec reflects this fix
wave's changes rather than the pre-fix state the session report described.

`CLAUDE.md`'s `Feedback` data-model clause was cut down to point at the spec
instead of the gitignored-scratch backend report, and shortened (dropped the
category-name enumeration and honeypot/timing prose, since that's now fully
covered in the spec):

```
Feedback (visitor feedback — category/message/locale/realm/path, moderated
through admin exactly like StreamerSubmission; **no submitter IP/UA, no
PII**; `POST /api/feedback/`, kill switch `FEEDBACK_SUBMISSION_ENABLED`,
live 2026-08-05 behind the footer's `Leave feedback` link — full wire
contract in `agents/work-items/feedback-submission-spec.md`),
```

Net effect on the always-loaded file: shorter than before, not longer.

**Note on `.superpowers/sdd/feedback/`:** the directory carries a local,
untracked `.superpowers/sdd/.gitignore` (`*`) that is itself not committed —
so it behaves as gitignored scratch going forward, even though
`backend-report.md`/`frontend-report.md` were already committed to history
in earlier commits on this branch before that local rule existed. Not
touched here (untracking/removing already-committed history was outside this
task's scope); flagging it as a loose end, not fixing it.

---

## Test / lint / build output

### Backend

```
cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 \
  /home/august/code/battlestats/server/.venv/bin/python -m pytest warships/tests/ --nomigrations --tb=short
...
867 passed, 2 skipped, 100 warnings, 3 subtests passed in 5.34s
```

Baseline 863 → 867 (+4: 2× clock-skew tests, 2× kill-switch tests). Zero
regressions.

Feedback/streamer-scoped subset, run in isolation to confirm the exact
touched classes:

```
python -m pytest warships/tests/test_views.py -k "FeedbackViewTests or StreamerSubmissionViewTests" --nomigrations --tb=short -q
.....................
21 passed, 117 deselected, 3 subtests passed in 0.44s
```

### Frontend

```
$ npm test
Test Suites: 77 passed, 77 total
Tests:       596 passed, 596 total

$ npm run lint
(clean, no output)

$ npm run build
✓ Compiled successfully in 1737ms
  Running TypeScript ...
  Finished TypeScript in 3.1s ...
✓ Generating static pages using 13 workers (9/9) in 903ms
```

Baseline 595 → 596 (+1: the F5 generic-fallback test). F1 added no net test
— it added an assertion inside an existing test.

---

## Self-review

- **F1 mutation evidence is real, not asserted** — ran the test file in all
  three states (assertion added/green, field renamed/red, restored/green)
  and quoted the actual failure output above, not a description of expected
  behavior.
- **F2's 503 body was verified empirically before being written into the
  spec** — initially assumed it would carry `status_code` like the 400/429
  bodies (by analogy with the backend report's documented pattern), wrote
  that into a draft, then actually ran it and found the assumption wrong
  (manually-constructed `Response` bypasses `custom_exception_handler`).
  Corrected before landing rather than shipping a documented guess. This is
  exactly the kind of unverified claim F6 exists to prevent recurring.
- **F4's "before" behavior was not re-run against pre-fix code** — the fix
  and its test were written together, so the red/green pair I have concrete
  evidence for is F1, not F4. I'm confident in F4 by inspection (the
  arithmetic is unambiguous: a negative gap fails a bare `< 2000` check) but
  flagging that I did not repeat F1's full mutation-proof ritual here, since
  the task only asked for that rigor on F1 specifically.
- **Locale correction respected as a constraint on new text, not treated as
  license to rewrite unrelated locale docs.** `CLAUDE.md`'s existing
  `LocaleContext` bullet still says the selector control "stays dark in prod
  behind the `NEXT_PUBLIC_LOCALE_SELECTOR` flag" — per the corrected fact
  given for this task, that line is now stale. It is **not** one of F1–F6
  and touching it was outside this task's explicit scope, so it was left
  alone; flagging it here rather than silently leaving it or silently fixing
  it.
- **Did not touch `StreamerSubmissionModal.tsx`'s equivalent F5-shaped gap**
  (it always shows the generic banner on non_field_errors OR falls back to
  the same "Please correct the errors below." text regardless of whether
  `fieldErrors` populated for e.g. a honeypot 400) — F5 named
  `FeedbackModal.tsx:108–118` specifically and, unlike F4, gave no
  instruction to extend scope to the streamer twin. Flagging the same-shaped
  gap rather than fixing it unprompted.
- **`.superpowers/sdd/feedback/backend-report.md` was not deleted or
  git-rm'd** — F6 asked to stop citing it as the contract of record and to
  make the spec self-sufficient, which is done; the file's git-tracked
  status despite the directory's local gitignore convention is a separate
  hygiene question, noted above, not resolved.
- Ran backend full suite, then the scoped subset, then frontend
  test/lint/build, in that order, before writing this report.
