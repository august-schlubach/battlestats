# Feedback submission — frontend report

Branch: `feat/feedback-submission`
Spec: `agents/work-items/feedback-submission-spec.md`
Wire contract consumed: `.superpowers/sdd/feedback/backend-report.md`
Mirrored pattern: `client/app/components/StreamerSubmissionModal.tsx`

## What shipped

1. **`FeedbackModal.tsx`** (new) — a body-fixed overlay modal mirroring
   `StreamerSubmissionModal.tsx`'s structure exactly (same `fixed inset-0`
   dialog shell, Escape-to-close, backdrop-click-to-close, honeypot,
   idle/submitting/success/error state machine, 2s auto-close after success).
   - Three categories, one required, rendered as vertically stacked radio
     buttons (not chips — see "CJK wrap" below for why): `language_issue`,
     `feature_suggestion`, `bug_report`. The **machine value** is what's held
     in state and sent on the wire; the translated label is only ever passed
     to `t()` for display, via a `CATEGORY_LABEL_KEY: Record<Category,
     StringKey>` map.
   - Required `<textarea>` with `maxLength={2000}` (the backend's cap) plus a
     live `{length}/2000` counter. Submit is disabled until `category !== ''
     && message.trim().length > 0` — closes the whitespace-only hole
     `required` alone leaves open (backend rejects `"   "`, so the client now
     matches).
   - `website` honeypot (hidden text input, always empty for real users) and
     `form_loaded_at` (`Date.now()` captured in the `open`-transition effect,
     the same lifecycle point Streamer's `loadedAtRef` uses) sent on every
     submit, per the wire contract.
   - `locale` from `useLocale().locale` (the **live** value, not
     `useDisplayLocale()` — this is a data field, not rendered text, same
     split `RealmContext`'s doc comment calls out for `useRealm()` vs
     `useDisplayRealm()`), `realm` from `useRealm().realm`, `path` from
     `usePathname()`.
   - Field errors: `category`/`message` from the 400 body render under their
     own field; any other error key (locale/realm/path/website/
     form_loaded_at — none of them user-editable) collapses to the generic
     "Please correct the errors below." banner, mirroring
     `StreamerSubmissionModal`'s `fieldErrors` + `genericError` split (its
     `non_field_errors` has no analogue here, since the backend report names
     no such field for this endpoint).
   - Verified explicitly (this was the advisor's flagged risk): the reachable
     too-fast case — open, paste, click within 2s — returns
     `{"form_loaded_at": ["too_fast"]}`, which isn't in the surfaced field
     set, so it renders as the generic error banner while `category`/
     `message` state is untouched (the reset-to-blank effect only runs on the
     `open` transition, never on an error). A retry a moment later succeeds.

2. **`Footer.tsx`** — three changes, exactly as scoped:
   - (a) The `Fork me on GitHub` link and its `outbound-link`/`target:
     github` tracking call are **removed**, not moved.
   - (b) `Leave feedback` (translated via `t('footer.leaveFeedback')`) sits
     in that freed slot — third in the row, between `CC BY-NC-SA 4.0` and
     the (now-conditional) streamer link — opening `FeedbackModal` and
     firing `trackEvent('feedback-open')` with no payload, structurally
     identical to the existing `trackEvent('streamer-open')` call.
   - (c) `Add a streamer!` is now gated on `STREAMER_SUBMISSION_ENABLED`,
     both the button and the `<StreamerSubmissionModal>` render, with the
     leading `{' · '}` separator inside the same conditional block (so
     disabling it never leaves a dangling separator).

3. **Kill switch location — `STREAMER_SUBMISSION_ENABLED`** lives in
   `StreamerSubmissionModal.tsx` itself (exported, top of file, comment
   explaining why it's off and that flipping it restores the affordance),
   **not** in `Footer.tsx`. This matches `PveEnjoyerIcon.tsx`'s precedent
   exactly: the constant lives with the component being hidden, call sites
   just check it. `StreamerSubmissionModal.tsx`'s component body, the
   endpoint, and the backend model are all untouched — only the constant was
   added and the Footer call site now checks it.

4. **i18n** — 14 new keys (`footer.leaveFeedback`, `feedback.modal.title`,
   3× `feedback.category.*`, `feedback.messagePlaceholder`,
   `feedback.submit`, `feedback.submitting`, `feedback.cancel`,
   `feedback.close`, `feedback.success`, 3× `feedback.error.*`), populated
   in `en.ts` (total), `ko.ts` and `ja.ts` (both `Partial`, no gaps left).
   Admitted under the terminology research doc's generic-UI-chrome tier
   (form chrome, not WoWS vocabulary) — see the new entries in
   `agents/work-items/i18n-terminology-research.md`'s admission table and
   its new "Added 2026-08-05" paragraph.
   - `feedback.category.languageIssue` carries a `NEEDS-NATIVE-CHECK`
     comment in both `ko.ts`/`ja.ts` (same precedent as `common.award`):
     rendered as "report a translation error/problem" (번역 오류 신고 /
     翻訳問題の報告) rather than a literal calque of "language," on the
     reasoning that the category exists to report *our own* translation
     mistakes, not the game's language settings — a judgment call, flagged
     rather than shipped as a confident guess.

## CJK wrap handling

Per the task's explicit warning (chip-style controls have broken twice on
this project): `whitespace-nowrap` is applied **only** to the footer link
and the modal's Cancel/Submit buttons — short labels sitting in fixed-width
controls where a mid-word break would look broken. It is **not** applied to
the category radio labels, the success message, or the error prose — those
are full sentences in a 480px-max modal (≈303px of usable width at 375px),
and nowrap there would just relocate the clipping problem instead of solving
it. Category selection is rendered as vertically stacked radios (not
horizontal chips) specifically to sidestep the failure mode altogether —
verified in the screenshots below, nothing clips or scrolls at 375px in
either language.

## Byte-identity evidence

Three things together, not just an assertion:

- `npm test` — **595 passed / 595 total**, up from the stated 587-test
  baseline (net +8: Footer gained 2 tests after losing/gaining assertions,
  FeedbackModal added 6). Nothing outside `Footer.test.tsx` needed a single
  assertion edit.
- `git diff -U0 client/app/i18n/en.ts client/app/i18n/keys.ts` — every
  changed line is a `+`; zero existing English value was touched (confirmed
  by inspecting the diff directly, not inferred).
- `git diff --stat` shows only the 3 Footer.tsx edits (GitHub removal,
  feedback link, streamer gate) as behavior changes to existing English
  surface; every other touched file is either a new file (`FeedbackModal.*`)
  or an additive dictionary/doc change.

## Test / lint / build output

```
$ npm test -- --silent
Test Suites: 77 passed, 77 total
Tests:       595 passed, 595 total

$ npm run lint
(clean, no output)

$ npm run build
✓ Compiled successfully in 1774ms
  Running TypeScript ...
  Finished TypeScript in 3.1s ...
✓ Generating static pages using 13 workers (9/9) in 278ms
```

New/changed test files:
- `client/app/components/__tests__/FeedbackModal.test.tsx` (new, 6 tests) —
  machine-value-on-the-wire assertion (parses the actual POST body rather
  than trusting a mock call shape), tracked-event coverage for
  success/invalid/error mirroring `StreamerSubmissionModal.test.tsx`'s
  pattern, and a client-side validation test (disabled-until-valid,
  including the whitespace-only case).
- `client/app/components/__tests__/Footer.test.tsx` (edited) — the GitHub
  and "Add a streamer!" assertions are **replaced** with positive-absence
  assertions (`queryByRole(...).not.toBeInTheDocument()`), not deleted
  outright, so the kill switch and the removal both have a regression net.
  A new test confirms `feedback-open` fires and the modal actually opens
  (not just that the button renders).

## Screenshots

`.superpowers/sdd/feedback/shots/`, 30 images — `{footer,modal-empty,
modal-filled,modal-error,modal-success}-{en,ko,ja}-{1280,375}.png`. Driven
via `?lang=ko`/`?lang=ja` (not the selector dropdown — more reliable in
Playwright per the mechanism CLAUDE.md documents as already live). The
`/api/feedback/**` route was **stubbed** with Playwright's `page.route()` for
every submit click (400 then 201) — no request ever reached
`https://battlestats.online`; the dev server's `BATTLESTATS_API_ORIGIN`
proxy was only exercised for read traffic (the ship-leaderboard page
underneath the modal).

**Reading:**
- **Footer, 1280px, all 3 locales**: GitHub link gone, streamer link gone,
  `Leave feedback` / `피드백 남기기` / `フィードバックを送る` sits cleanly in
  the freed slot, single line, no wrap.
- **Footer, 375px**: the link wraps to its own line as a whole unit (normal
  flex-wrap of the `·`-separated group) — no per-character CJK breaking.
  (A floating "N" badge in the bottom-left corner of every mobile shot is
  the Next.js dev-mode indicator, not app content.)
- **Modal, 375px, all 3 locales**: category radios, placeholder, and
  Cancel/Submit buttons all render fully. Korean/Japanese button labels
  (취소/제출, キャンセル/送信) stay single-line via the targeted
  `whitespace-nowrap`. Nothing clips, nothing introduces a scrollbar.
- **Modal-error, all 3 locales**: the backend's field-error text
  ("Ensure this field has no more than 2000 characters.") is **always
  English** — that's the Django serializer's literal validation message,
  which is not part of the client i18n dictionary in either this change or
  `StreamerSubmissionModal`'s existing identical behavior; only the
  surrounding chrome (banner text, buttons) is translated. Worth flagging,
  not a regression.
- **Modal-success, all 3 locales**: the two-sentence success message wraps
  onto two lines in the 480px modal at both widths without clipping.
- **Modal, 1280px**: same content, more breathing room; confirmed the
  desktop layout isn't why the mobile shots look clean (i.e., this isn't a
  narrow-viewport-only pass).

## Self-review

- Confirmed via `advisor()` before writing code (see below for what
  changed as a result) and again is the basis for this report's structure.
- **Advisor-flagged corrections applied**, not just noted:
  1. Kill switch moved from a Footer-local constant to
     `STREAMER_SUBMISSION_ENABLED` exported from `StreamerSubmissionModal.tsx`
     — matches `PveEnjoyerIcon`'s "lives with the thing being hidden" pattern
     literally, not just in spirit.
  2. `whitespace-nowrap` scoped to footer link + Cancel/Submit only, verified
     against screenshots that nothing else needed it (and would have clipped
     if given it).
  3. `message.trim()` gates the submit button, closing the whitespace-only
     hole `required` alone leaves.
  4. Confirmed (not just assumed) that an error response doesn't clear the
     typed message — the reset effect is keyed on the `open` transition only.
  5. The `{' · '}` separator for the streamer link is inside its own
     conditional block, not orphaned when the flag is false.
  6. `Footer.test.tsx` got positive-absence assertions for both removed/hidden
     links, not just deleted test bodies.
  7. Screenshots driven by `?lang=`, feedback POST stubbed via
     `page.route()` — zero risk of a real submission reaching production.
- **Doc reconciliation done**: `feedback-submission-spec.md`'s Status line
  updated (frontend no longer "pending"); `CLAUDE.md`'s `Feedback` data-model
  clause updated to describe the live surface instead of "frontend modal
  pending"; the `LocaleContext`/i18n bullet under Key frontend patterns
  extended in place (not a new bullet — `scripts/check_claude_md.sh`'s
  precommit hook caps env-var-catalog-style bullets at 8 and CLAUDE.md was
  already at the cap; folding the sentence into an existing bullet stayed
  under it without losing the information); `i18n-terminology-research.md`'s
  admission table and prose extended for the 14 new keys;
  `runbook-streamer-submission-feature-2026-04-07.md` annotated with the
  kill-switch note (not archived — the feature isn't superseded, only its
  entry point is currently gated).
- **Not done, flagged as a follow-on rather than silently skipped**: the
  backend report explicitly parked writing a runbook until both halves
  shipped ("treating this as a follow-on once both halves ship together").
  Both have now shipped on this branch, but I did not write one — that's a
  judgment call for you, not something this task asked for, and doctrine
  rule (4)/(6) is about archiving/reconciling existing runbooks and specs,
  not authoring a new one unprompted for a feature that hasn't been deployed
  yet.
- **Not done, deliberately out of scope**: no `release.sh` run, no deploy —
  task scope was commits on the feature branch.
- Ran `npm test`, `npm run lint`, and `npm run build` as the final gate
  after all edits, all clean, in that order, matching the task's explicit
  sequencing instruction.
