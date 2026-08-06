# Outbound mail from the droplet: feedback notifications + ops digest re-arm

**Date:** 2026-08-06
**Status:** specified; not implemented. QA pass 2026-08-06 verified every factual
claim against the live system (see *Claims verified*), proved the section-3
concurrency hazard by experiment, and corrected two wrong claims about systemd
installation.
**Surface:** production droplet only (no client, no API); one new Django management command, one shared mail module, two systemd timers
**Depends on:** the `Feedback` model and its `pending` status (`feedback-submission-spec.md`); the existing `server/scripts/daily_ops_email.py`

## Why

The visitor feedback queue has no reader. Nothing notifies anyone when a
submission lands; the `/feedback` skill is the only way the queue is ever seen,
and it runs when the operator happens to remember. That inverts the burden: the
person who wants to know has to poll, and a submission nobody reads is a
submission that never happened.

Mail shifts the burden the right way. The droplet is the correct host for it
because it is always on, where a laptop is frequently asleep; a scheduler that
only fires when someone happens to have a machine awake is not a scheduler.

A second consumer is already waiting. `server/scripts/daily_ops_email.py` was
written to mail a morning ops digest and has never once run on a schedule. It
comes back for the price of a unit file the moment outbound mail works.

## Current state

Outbound mail was already built here, and has never worked.

- `server/scripts/daily_ops_email.py` (496 lines) is on `main` and deployed to
  `/opt/battlestats-server/current/server/scripts/` (Jul 29).
- `/etc/battlestats-ops-email.env` exists, `chmod 600`, root-owned (Jul 1),
  carrying `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
  `MAIL_TO`, `BENCH_DIR`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
- **Nothing schedules it.** The root crontab holds exactly two entries, both
  benchmark snapshots (04:30 and 04:35 UTC); there is no systemd unit matching
  mail, ops, or feedback.

### Root cause of the failure

`SMTP_USER` is `sysop@tamezz.com`. **That mailbox does not exist.** The account's
users, per `listUser`, are `tjones86@tamezz.com` (derby), `boston@etro.email`
(metro), and `sbemagx@rethinkmail.com`. Authenticating as `sysop@tamezz.com`
returns `535 Authentication Failed`, which is a nonexistent sender identity
rather than a bad password.

The absent schedule is almost certainly the fossil of this: the digest was built,
it failed to send, and the schedule was pulled rather than debugged.

**The stored passwords are a confounded variable and will not be reconciled.**
`shared/purelymail-smtp` in Pass (15 characters) and the droplet's `SMTP_PASS`
(14 characters) both fail, but with the mailbox absent neither could have
succeeded, so neither failure attributes to the password. Both values are
abandoned; a fresh one is generated in step 1.

### What is healthy

Everything else. Account credit is $7.3492982623 (`checkAccountCredit`). Both
owned domains, `tamezz.com` and `etro.email`, pass MX, SPF, DKIM and DMARC, and
both report `isShared: false`. The API token in `shared/purelymail-api-token`
works.

## Shape

### 1. Identity repair (prerequisite; nothing else can be verified before it)

Create `sysop@tamezz.com` via `POST /api/v0/createUser` with a freshly generated
strong password. Store that password in Pass at `shared/purelymail-sysop-smtp`,
then regenerate `/etc/battlestats-ops-email.env` from Pass. Pass is the authority;
the on-disk file is generated, never hand-authored as the source of truth.

`shared/` rather than `battlestats/` is deliberate: `sysop` is a droplet-ops
identity, and oturu shares this droplet, so a second tenant should be able to
reuse it rather than mint a parallel mailbox.

No other key in the env file changes. `SMTP_USER` and `MAIL_FROM` already name
this address; only `SMTP_PASS` is rewritten.

#### `tamezz.com` is derby's mail domain, and the routing rule overrides mailboxes

**This must be handled in the same step as `createUser`, not after it.** `listRoutingRules` shows one
rule on `tamezz.com`:

```
domain=tamezz.com  matchUser=''  prefix=True  catchall=False  ->  ['tjones86@tamezz.com']
```

An empty `matchUser` with `prefix=True` matches every local-part on the domain,
and `catchall=False` means the rule fires **even when an exact mailbox exists**
(a catch-all, by Purelymail's definition, is the flag that makes a rule yield to
a real mailbox; this rule does not have it). So creating `sysop@tamezz.com` does
not by itself give that address its own inbox: mail addressed to it would still
route to `tjones86@tamezz.com`, which is derby's ingest mailbox.

Sending does not require receiving, so this does not block outbound mail. What it
does affect is everything that comes *back* to the envelope sender: bounces,
delivery status notifications, and any human who hits reply. Those would land in
derby's `INBOX`, which derby's classifier ingests. Derby would be reading mail it
was never built to see.

`etro.email` has the identical structure pointing at `boston@etro.email`, so it
is not an escape.

Purelymail's routing documentation confirms this directly, with an example that
is exactly our case: *"If you have a User at me@domain.com but a routing rule for
\*@domain.com, all mail will follow the rule. The me@domain.com inbox will stay
empty."* It also states the rule this design depends on: *"Exact match will
always take priority over a prefix match."*

**Decision: add an exact routing rule for `sysop@tamezz.com` targeting
`sysop@tamezz.com`.** Exact beats prefix, so the new mailbox receives its own
bounces and replies while derby's blanket prefix rule continues to carry
everything else to `tjones86@tamezz.com` unchanged. The change is **additive**:
derby's existing rule is not edited, so there is no way for this to alter
derby's current delivery.

Rejected alternatives:

- **Flip derby's existing rule to `catchall=True`.** Arguably the more correct
  configuration, since that flag means precisely "yield to a real mailbox", and
  it would fix the problem for every future mailbox at once. Rejected because it
  mutates another project's routing rule to serve this one; the additive fix
  achieves the same outcome here without touching derby.
- **Accept the coupling** and harden derby's classifier against bounce-shaped
  mail. Cheapest in mail configuration, but it puts battlestats' operational
  failure modes inside another project's ingest path.
- **Use a domain neither project ingests from.** Cleanest isolation; costs a new
  domain and DNS setup, disproportionate to a notification mailbox.

Step 1 is therefore **two** API calls, `createUser` then `createRoutingRule`,
and the rule must exist before the first send so that no bounce can reach derby.

Note that Purelymail's default "send from whoever they want" policy is **not**
relied upon by this design: `sysop@tamezz.com` authenticates and sends as
itself.

**Verification is two-staged and the second stage is not optional.** First,
`SMTP_SSL` connect plus `login()` against `smtp.purelymail.com:465`, proving
credentials without sending. Then one real message to `MAIL_TO`, confirmed to
land **in the inbox rather than in spam**. DNS is clean, so it should; but a
first send from a brand-new mailbox is exactly where that assumption earns a
check, and a design whose whole purpose is to stop the operator polling fails
completely if its mail is silently filtered.

### 2. `notify_pending_feedback` management command

A Django management command in `server/warships/management/commands/`, run under
the production venv because it needs the ORM.

Behaviour:

- Query `Feedback.objects.filter(status=Feedback.STATUS_PENDING)`, ordered by id.
- Subtract rows at or below the watermark (section 3).
- **Nothing new: exit 0 and send nothing.** Silence is the success case. One
  journal line records that the run happened; journald is not a channel the
  operator has to poll, so it costs nothing and makes "did it run at all?"
  answerable after the fact.
- **Something new: one email** carrying every new submission **in full**: id,
  timestamp, category, locale, realm, path, and the verbatim message. Messages
  are never truncated, mirroring the `/feedback` skill's own rule; volume is low
  and the visitor's exact words are the entire signal.
- Advance the watermark only after the send returns successfully, so a send
  failure does not silently consume the notification.

**Fail-loud.** Any exception sends a `FAILED`-tagged email carrying the traceback
and whatever was read before the error, then exits non-zero. Without this, a
broken checker (database unreachable, credentials expired, timer disabled)
produces exactly the same silence as a clean queue, and the silence is what the
operator has been taught to trust. This is the convention `daily_ops_email.py`
already established.

**Credit floor.** Each run reads `checkAccountCredit`. When the balance is below
**$5.00** the warning is folded into any outgoing feedback mail; and, this part
being load-bearing, **it also sends on its own when there is no feedback to
report**, rate-limited to at most once every seven days by a second watermark
file holding the last warning date.

Folding it only into feedback mail would have been a hole: the quiet stretches
are precisely when nobody is exercising the send path, so a balance draining to
zero during a month of no submissions would produce no warning at all, and the
first symptom would be the silent loss of the notifications this whole design
exists to deliver. The credit warning is the one message that must not inherit
quiet-on-empty. The account fee is
$4.00/year, so that threshold buys more than a year of warning rather than a
last-minute one; if the balance reaches zero, sending stops, and under a
quiet-on-success design that failure is indistinguishable from good news. A
threshold near zero would be useless precisely because the warning travels by
the mechanism that is failing. The balance parses as
`Decimal`, not `float`: Purelymail pro-rates to the byte and the second and
returns a long decimal string.

Kill switch `FEEDBACK_NOTIFY_ENABLED`, matching project convention.

### 3. Watermark (re-notification control)

Nothing in the application moves a row off `pending`; only a human does, in
Django admin. A naive daily run would therefore mail the same submission every
day until it is cleared, and a notifier that nags is a notifier that gets
filtered.

A state file at `/opt/battlestats-server/shared/state/feedback-notify-watermark`
holds a **JSON array of the `Feedback.id` values already mailed**. Each
submission mails exactly once. Deleting the file re-arms everything, which is the
whole recovery procedure.

**It stores a set, not a maximum, and that distinction is load-bearing.** A
max-id watermark is unsafe here. Postgres assigns a sequence value at `INSERT`
but a row only becomes visible at `COMMIT`, so two overlapping submissions can
commit out of order: T1 takes id 5, T2 takes id 6, T2 commits first. A run
landing in that window sees 6 and not 5, and a max-based watermark would move to
6; when T1 commits, row 5 is visible but permanently `<= watermark` and is never
mailed. Nothing would record that it existed. That is precisely the silent loss
this feature exists to prevent, on a public endpoint with no rate control over
submission timing.

Storing the id set removes the ordering hazard outright rather than narrowing it.
Volume is human-scale (single digits to date), so the file stays trivially small;
if it ever grows unreasonably, prune ids below the oldest still-`pending` row,
never by count.

**Rejected: a `notified_at` column.** Tidier, and it would survive a wiped
filesystem; but it costs a migration for state with no product meaning, and it
puts operational bookkeeping in a table that exists to hold what visitors said.
The watermark is recoverable by deleting a file, and the failure mode of losing
it is one duplicate email.

The `notified_at` column would also have been immune to the ordering hazard
above, since it marks the row rather than a boundary. The id set buys the same
immunity without a migration, which is why the rejection stands.

### 4. Scheduling

Two systemd timers, matching the repo convention. Only the two benchmark
snapshots still use cron, and the migration has been running the other way.

- `battlestats-feedback-notify.timer`: daily at **13:00 UTC** (09:00 US Eastern),
  clear of the 04:30/04:35 benchmark snapshots and the 11:30 digest so the three
  mail-adjacent jobs never contend.
- `battlestats-ops-digest.timer`: daily at 11:30 UTC, the time
  `daily_ops_email.py` documents. Re-armed unchanged, with the LLM path intact.

**Installation goes in `server/deploy/deploy_to_droplet.sh`, following the
pattern already there.** That script writes all six existing timers and their
services into `/etc/systemd/system/` via heredoc, then runs `systemctl
daemon-reload` (line 1248) followed by idempotent `systemctl enable --now` calls.
The new units are added the same way; no manual droplet step, and no separate
install mechanism.

Match the established unit shape rather than inventing one. Per
`battlestats-compact-observations`:

- The `.timer` carries `[Timer] OnCalendar=`, `Persistent=true`,
  `RandomizedDelaySec=300`, and `[Install] WantedBy=timers.target`. It does
  **not** carry `Unit=`; these units rely on systemd's default of activating the
  `.service` of the same name, and adding `Unit=` would depart from every
  existing pair.
- The `.service` is `Type=oneshot`, runs as `${APP_USER}` with
  `WorkingDirectory=${APP_ROOT}/current/server`, and invokes
  `${APP_ROOT}/venv/bin/python manage.py <command>`.
- Existing services load `EnvironmentFile=/etc/battlestats-server.env` and
  `/etc/battlestats-server.secrets.env`. The notifier needs a **third**,
  `/etc/battlestats-ops-email.env`, for the SMTP settings; that file is not
  currently read by any systemd unit, only by `daily_ops_email.py` at runtime.

**One genuinely new step:** `/opt/battlestats-server/shared/state/` does not
exist. `shared/` currently holds `archives`, `benchmarks`, `bin` and `logs`, and
the deploy script contains no `mkdir` for any of them, so there is no precedent
to copy. The script must `mkdir -p` the state directory, owned by `${APP_USER}`,
before either timer first fires.

### 5. Shared send path

`send_email` and `load_env_file` move out of `daily_ops_email.py` into one
stdlib-only module both consumers import, so an SMTP fix never has to be made
twice.

The module must remain **stdlib-only and import nothing from Django**. That
preserves `daily_ops_email.py`'s deliberate no-venv property: it reads JSON
snapshots off disk and must keep running without the virtualenv. A stdlib-only
module imports fine from that script via a `sys.path` insert, and imports
normally from the management command.

This is why the notifier is a management command rather than an extension of the
digest script: the digest reads files, the notifier needs the ORM, and the two
requirements cannot be satisfied by one entry point.

### 6. Tests

Against the sqlite harness (`DB_ENGINE=sqlite3 --nomigrations`), with `smtplib`
mocked:

- Empty queue: no send, exit 0.
- One pending row: exactly one send, and the message body contains the row's
  **full** text, verifying no truncation.
- Two runs, unchanged queue: the second sends nothing (watermark honoured).
- A new row after a notified one: only the new row appears.
- A row that becomes visible with an id **lower** than one already notified still
  mails. This is the out-of-order-commit case, and it is the test a max-id
  watermark fails.
- Raised exception mid-run: a `FAILED` mail is sent and the exit code is non-zero.
- Send failure: the watermark does **not** advance.
- Credit below the floor with an empty queue: a warning mail is sent anyway.
- Credit below the floor twice within seven days: only the first mails.

## Sending identity: alternatives considered

**Chosen: create `sysop@tamezz.com`.** The env file already names it, so no
droplet configuration changes beyond the password; the name is generic enough for
oturu to share.

**Rejected: authenticate as `tjones86@tamezz.com` and send as another address.**
Purelymail's default account policy is "Send from whoever they want", so this
works without a new mailbox. It was rejected because it couples battlestats ops
mail to derby's mailbox credential: rotating derby's password would silently
break notifications, and the failure would surface as absent mail, the one
symptom this design cannot afford to be ambiguous.

**Rejected: `battlestats@tamezz.com`.** Cleaner naming, but it requires editing
`SMTP_USER` and `MAIL_FROM` and does not generalise to the droplet's second
tenant.

## Cost

Creating the mailbox is free under **both** Purelymail plans, which is what makes
the open question about which plan this account is on safe to leave open:

- Simple ($10/year): "no hard limits. Not on users, custom domains, storage, or
  anything else."
- Advanced (pay-as-you-go): "There is no extra charge for users on domains you
  own." The per-username fee applies only to shared domains; `tamezz.com` is
  owned.

Under advanced pricing only, external sends cost $0.23 per 1000, so roughly
$0.0002 per feedback notification and about $0.08/year for a daily digest,
against a $4.00/year account fee. Under simple pricing, nothing.

The API exposes no plan or billing endpoint; `checkAccountCredit` returns a bare
balance and is the only money-adjacent call of the nineteen. The plan is visible
only on the Purelymail billing page in the web UI.

## Risks

- **Credit exhaustion.** Sending stops at zero balance, and quiet-on-success
  makes that silent. Mitigated by the credit floor in section 2; not eliminated,
  since a zero balance also blocks the warning mail itself. The floor threshold
  must therefore be high enough to warn well before exhaustion.
- **Spam placement on first send.** DNS passes on both domains, so this is
  unlikely, but it is verified explicitly in section 1 rather than assumed.
- **Two-factor authentication on the account.** If enabled, Purelymail requires
  an app password in place of the real one. `POST /api/v0/createAppPassword`
  exists (already wrapped as `create_app_password` in metro and derby), so this
  is a detour, not a blocker.
- **Watermark loss.** A wiped `shared/state/` re-sends already-seen submissions.
  Bounded, low-volume, and self-correcting after one run.

## Claims verified

Every factual assertion in this spec was checked against the live system on
2026-08-06 rather than taken on trust. Recorded so a later reader knows which
statements are evidence and which are judgement.

**Confirmed by measurement:**

- `daily_ops_email.py` is 496 lines, and the deployed copy is byte-identical to
  `main` (sha256 `a447eb8a542d4008…` on both). It is not a stale deploy.
- `/etc/battlestats-ops-email.env` exists at mode 600 with all nine keys listed.
- The root crontab holds exactly two non-comment entries; no systemd unit matches
  mail, ops or feedback.
- `/opt/battlestats-server/shared/` contains `archives`, `benchmarks`, `bin`,
  `logs`; `state` is absent.
- `Feedback.STATUS_PENDING` exists (`models.py:504`) and the model declares no
  explicit primary key, so `id` is an implicit `AutoField`.
- `server/warships/management/commands/` already exists.
- Purelymail: `sysop@tamezz.com` is absent from `listUser`; SMTP login as it
  returns `535`; credit is $7.3492982623; both domains pass MX/SPF/DKIM/DMARC and
  report `isShared: false`.

**Confirmed by experiment** (Postgres 15, three concurrent connections):

The commit-ordering hazard in section 3 is real, not theoretical. T1 was assigned
id 1 and T2 id 2; T2 committed first; a reader at that instant saw `[2]` only. A
max-id watermark set to 2 then **permanently skipped id 1** once it committed,
mailing nothing for it ever. The id-set form mailed id 1 on the next run. This is
the test that justifies the state file's shape.

**Confirmed by vendor documentation:** routing priority (exact beats prefix) and
the overlap behaviour that causes the `tamezz.com` collision, quoted in section 1.

**Corrected during QA:** an earlier draft claimed systemd unit files do not reach
the droplet via the deploy script and would need a manual install step. That was
wrong: the script writes all six existing timer/service pairs itself. It also
specified a `Unit=` directive that no existing timer here uses. Section 4 now
follows the actual convention.

## Acceptance

1. `SMTP_SSL` login as `sysop@tamezz.com` succeeds from the droplet.
2. A test message arrives in the Gmail **inbox**, not spam. **This is an operator
   step and cannot be verified from the droplet or by any automated check.** The
   implementation is not done until a human has confirmed placement; reporting
   completion with this unchecked would assert exactly the thing that has not
   been established.
3. `notify_pending_feedback` on an empty queue sends nothing and exits 0.
4. A newly submitted feedback row produces exactly one email containing its full
   verbatim message, and a second run produces none.
5. `listRoutingRules` shows an exact rule for `sysop@tamezz.com` targeting
   itself, and a message addressed to `sysop@tamezz.com` lands in that mailbox
   rather than in `tjones86@tamezz.com`. This is the check that proves derby is
   not receiving battlestats' bounces.
6. Both timers appear in `systemctl list-timers` with a populated `NEXT`.
7. The ops digest sends on its next scheduled fire.

## Follow-ups, explicitly not done here

- Deciding the Purelymail plan, and reading burn rate off the billing page.
- Extending `sysop@tamezz.com` to oturu's cron mail.
- Any notification path other than email (the Telegram channel already exists and
  would be a separate design).
