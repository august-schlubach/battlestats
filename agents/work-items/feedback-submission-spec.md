# "Leave feedback" — footer link + categorized submission modal

**Date:** 2026-08-04
**Status:** queued (next step after `client-locale-toggle-spec.md`)
**Surface:** footer (all routes) + new modal; new backend model/endpoint
**Depends on:** the locale toggle — the categories and the link text are localized

## Why

Two gaps close at once. There is no route for a visitor to report anything, and
the locale rollout specifically needs one: the `NEEDS-NATIVE-CHECK` residue in
`ko.ts` / `ja.ts` is exactly the kind of error only a native-speaking player will
notice, and today they have nowhere to say so. The **Report a language issue**
category is the feedback loop that finishes the translation work.

*Where am I?* is deliberately included. Search and direct traffic dominate
arrivals, so a share of visitors land on a player page with no idea what this site
is; that confusion is a measurable product signal, not a support burden.

## Shape

Mirrors the existing streamer-submission path end to end, which is the point —
that flow already works, is already moderated through Django admin, and needs no
new infrastructure pattern.

**Frontend:** a `FeedbackModal` modelled on `app/components/StreamerSubmissionModal.tsx`
(body-portaled fixed overlay, the treatment established in 4.0.1), opened by a
`Leave feedback` link in `Footer.tsx`.

- **Categories** (radio or select, one required): report a language issue ·
  suggest a feature · report a bug · where am I?
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

## Open questions

- Rate limiting / spam control. The streamer endpoint's existing posture should be
  read first and matched rather than invented.
- Whether *where am I?* should answer itself inline — a one-paragraph "what this
  site is" shown on selection — instead of only filing a report. Cheaper for the
  visitor and probably the better product answer.
- Notification: does a submission need to reach the operator actively, or is
  Django admin sufficient (as it is for streamer submissions)?
