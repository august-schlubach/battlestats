---
name: feedback
description: Check the production visitor-feedback queue and print any unreviewed submissions in full to the terminal — category, locale, realm, originating page, and the visitor's verbatim message. Use whenever the user says "/feedback", "any feedback?", "check feedback", "did anyone leave feedback", "what are users saying", "feedback queue", "any bug reports", "any feature requests", or asks whether visitors have reported anything — including a bare "anything come in?" in a session that has touched the feedback feature. Also use before or after shipping translation changes, since language-issue reports are the only signal telling you a shipped string is wrong. Read-only: it never marks anything reviewed, never writes, never restarts anything, unless the user explicitly asks to mark items reviewed.
---

# feedback

Reads the `Feedback` table on production and prints unreviewed submissions in
full. This is the visitor's only channel to the operator — there is no email, no
account, no reply path — so the queue is the entire signal, and a submission
nobody reads is a submission that never happened.

Volume is expected to be low. Optimise for **reading every word of what did
arrive**, not for summarising a firehose. Never truncate a visitor's message.

Background: the footer's **Leave feedback** link opens a modal with three
categories, `POST`s to `/api/feedback/`, and the row lands `status='pending'`.
Moderation is Django admin only — nothing notifies anyone, which is exactly why
this skill exists. Spec, including the wire contract:
`agents/work-items/feedback-submission-spec.md`.

**Scope.** This reads visitor feedback. It is not an ops health check: for worker
and queue health use `event-check`, for the enrichment crawler use
`enrichment-status`, for capture-coverage readouts use `/observation`,
`/crawl-yield`, or `/recapture`.

## When to invoke

- "/feedback", "any feedback?", "check feedback", "did anyone leave feedback"
- "what are users saying", "any bug reports", "any feature requests"
- Before or after shipping i18n changes — a `language_issue` row is the only
  mechanism that tells you a translation is wrong, and the `NEEDS-NATIVE-CHECK`
  strings in `ko.ts`/`ja.ts` are shipped judgement calls awaiting exactly this
  signal.

## How to read it

One SSH call for the queue, one for the kill switch:

```bash
ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && /opt/battlestats-server/venv/bin/python manage.py shell -c "
from warships.models import Feedback
from django.db.models import Count
pending = list(Feedback.objects.filter(status=Feedback.STATUS_PENDING).order_by(\"-created_at\"))
print(\"PENDING\", len(pending))
for f in pending:
    print(\"---\")
    print(\"id\", f.id)
    print(\"when\", f.created_at.isoformat())
    print(\"category\", f.category)
    print(\"locale\", f.locale, \"realm\", f.realm or \"-\")
    print(\"path\", f.path or \"-\")
    print(\"message\", f.message)
print(\"=== totals by status ===\")
for r in Feedback.objects.values(\"status\").annotate(n=Count(\"id\")).order_by():
    print(r[\"status\"], r[\"n\"])
print(\"=== last 3 reviewed ===\")
for f in Feedback.objects.exclude(status=Feedback.STATUS_PENDING).order_by(\"-created_at\")[:3]:
    print(f.created_at.date(), f.status, f.category, (f.message[:80] + \"...\") if len(f.message) > 80 else f.message)
"' 2>&1 | grep -v "^Loading environment\|objects imported automatically"
ssh root@battlestats.online 'grep -E "^FEEDBACK_SUBMISSION_ENABLED" /etc/battlestats-server.env || echo "FEEDBACK_SUBMISSION_ENABLED unset (defaults to 1 = accepting)"'
```

## Reading the fields

- **`category`** — `language_issue`, `feature_suggestion`, or `bug_report`. Stable
  machine values; the visitor saw a translated label.
- **`locale`** — the UI language at submission (`en`/`ko`/`ja`). **For a
  `language_issue` this is the most important field on the row**: it names which
  dictionary (`client/app/i18n/ko.ts` or `ja.ts`) the complaint is about. A
  language issue without its locale is unactionable.
- **`realm`**, **`path`** — where they were when they submitted. `path` usually
  localises a bug report faster than the message does.
- **`status`** — `pending` until someone reviews it in Django admin. Nothing in
  the app ever moves it.

## Readout shape

**If the queue is empty**, say so in one line and stop. Do not pad it out with a
table of zeros — the user asked a yes/no question and the answer is no. Add a
second line only if something is genuinely off: if `FEEDBACK_SUBMISSION_ENABLED`
is `0`, then "no feedback" means "the endpoint is closed", not "nobody wrote", and
that distinction is the whole point of checking it.

**If anything is pending**, lead with the count and then print each submission in
full:

```
3 pending — 1 language issue (ko), 1 bug report, 1 feature suggestion

#7 · language_issue · ko · 2026-08-05 04:12Z · /player/Yamato_Fan?realm=asia
   "번역이 이상합니다 — 등급 should be 훈장"

#6 · bug_report · en · 2026-08-05 02:40Z · /ship/4179654640-Yamato
   "the win rate column sorts backwards on mobile"
```

Then two to four sentences of interpretation, in this order of usefulness:

1. **Language issues first, always.** They are cheap to act on, they decay (a
   wrong string stays wrong for every visitor in that locale), and they are the
   only external check on translations this project shipped without a native
   speaker. If one names a string, find the key in `en.ts` and say which
   dictionary entry it maps to, so the fix is one edit away.
2. **Bug reports** — pair the `path` with the message and say whether it
   reproduces or needs detail the visitor cannot be asked for. A report too vague
   to act on is a dead end; say so plainly rather than speculating at length.
3. **Feature suggestions** — note whether it duplicates something already in
   `agents/work-items/`, and resist designing it on the spot.

Close by naming what you would do next, rather than with an open question.

## Marking items reviewed

Read-only by default. Because nothing else in the app changes `status`, an
unreviewed row reappears in every future readout. That is correct — it is a queue,
not a feed — but it means the user will eventually want to clear handled items.

Only when the user explicitly asks — "mark these reviewed", "clear the queue",
"mark #7 approved" — run the write, scoped to the ids in question rather than the
whole table:

```bash
ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && /opt/battlestats-server/venv/bin/python manage.py shell -c "
from django.utils import timezone
from warships.models import Feedback
n = Feedback.objects.filter(id__in=[7]).update(status=Feedback.STATUS_APPROVED, reviewed_at=timezone.now())
print(\"updated\", n)
"'
```

`approved` means acted on or worth keeping; `rejected` means spam or noise. There
is no delete step — keep the rows. They are the only record of what visitors ever
said.
