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

## Decisions (2026-08-05)

- **Three categories, not four.** *Where am I?* was a joke in the original ask and
  is **dropped**. Shipping categories: report a language issue · suggest a feature ·
  report a bug.
- **Rate limiting / spam control:** read the streamer endpoint's existing posture
  and match it. Do not invent a second policy for the same class of anonymous
  write.
- **Notification: Django admin only**, as with streamer submissions. No email, no
  webhook. Revisit if volume ever justifies it.
