# Runbook: outbound mail from the droplet

**Date:** 2026-08-06
**Status:** live
**Scope:** the `sysop@tamezz.com` sending identity, the feedback notifier, and the ops digest
**Spec:** `agents/work-items/droplet-outbound-mail-spec.md` · **Plan:** `agents/work-items/droplet-outbound-mail-plan.md`

## What this is

Two systemd timers on the droplet send mail to the operator:

| Unit | Schedule (UTC) | What it does |
|---|---|---|
| `battlestats-feedback-notify.timer` | daily 13:00 | Mails unreviewed `Feedback` rows, each exactly once. Silent when there is nothing new. |
| `battlestats-ops-digest.timer` | daily 11:30 | Runs `scripts/daily_ops_email.py`: the LLM-synthesized observation / crawl-yield / recapture digest. |

The droplet hosts these rather than a laptop for one reason: it is always on. A
scheduler that only fires when someone's machine happens to be awake is not a
scheduler.

## The sending identity

`sysop@tamezz.com`, a Purelymail mailbox created 2026-08-06. Password lives in
Pass at `shared/purelymail-sysop-smtp`; the droplet's
`/etc/battlestats-ops-email.env` is generated from it. Pass is the authority.

Mail goes out as **`Zeta Region CloudOps <sysop@tamezz.com>`**. The display name
comes from `MAIL_FROM_NAME` and is applied with `email.utils.formataddr`, so a
name containing a comma or a non-ASCII character is quoted and encoded rather
than producing a malformed `From` header that some clients would read as two
recipients. Set `MAIL_FROM_NAME=""` to fall back to a bare address.

**`tamezz.com` is shared with derby, and that constrains the routing.** The
domain carries a blanket rule sending every local-part to `tjones86@tamezz.com`
(derby's ingest mailbox) with `catchall=False`, which per Purelymail's own
documentation fires *even when a real mailbox exists*: "If you have a User at
me@domain.com but a routing rule for \*@domain.com, all mail will follow the
rule. The me@domain.com inbox will stay empty."

So `sysop@tamezz.com` has a second, **exact** routing rule targeting itself.
Exact match always beats prefix match, so bounces, delivery notifications and
replies reach the sysop mailbox instead of landing in derby's classifier.

> **Do not delete the exact `sysop` routing rule.** Removing it silently routes
> battlestats' bounces into derby's ingest inbox, where derby will process mail
> it was never built to see. Nothing will alert you; the symptom is derby
> behaving oddly, days later.

Verify both rules with:

```bash
TOKEN=$(pass show shared/purelymail-api-token | head -1) python3 -c "
import os,json,urllib.request
r=urllib.request.Request('https://purelymail.com/api/v0/listRoutingRules',data=b'{}',
  headers={'Purelymail-Api-Token':os.environ['TOKEN'],'Content-Type':'application/json'})
for x in json.loads(urllib.request.urlopen(r,timeout=20).read())['result']['rules']:
    if x['domainName']=='tamezz.com': print(x)
"
```

Expect two: the blanket prefix rule to `tjones86@`, and the exact `sysop` rule to
`sysop@`.

## State files

`/opt/battlestats-server/shared/state/`, owned by the `battlestats` user:

- **`feedback-notify-watermark`** — JSON array of `Feedback` ids already mailed.
- **`feedback-credit-warning`** — ISO date of the last low-credit warning.

**It stores a set, not a maximum.** Postgres assigns a sequence value at `INSERT`
but a row only becomes visible at `COMMIT`, so two overlapping submissions can
commit out of order. A max-id watermark would step over the slower one
permanently and that visitor's message would never be mailed, with nothing
recording that it existed. Reproduced against Postgres 15; see the spec's
"Claims verified".

**To re-send everything:** delete `feedback-notify-watermark`. That is the whole
recovery procedure. Reads are forgiving, so a corrupt file re-arms rather than
wedging the notifier.

**Ownership matters.** The files must be owned by `battlestats`, not `root`. If
you run the command by hand as root, `chown battlestats:battlestats` the state
directory afterwards or the next timer run fails.

## Running by hand

```bash
ssh root@battlestats.online 'systemctl start battlestats-feedback-notify.service'
ssh root@battlestats.online 'journalctl -u battlestats-feedback-notify.service -n 20 --no-pager -o cat'
```

Use `systemctl start`, not a direct `manage.py` invocation. The unit runs as the
`battlestats` user with three `EnvironmentFile` entries; reproducing that by hand
is fiddly and running as root leaves root-owned state files behind.

For a look with no side effects, `--dry-run` reports counts and the credit
balance without sending or recording anything.

## What the mail means

- **Subject `N new feedback submission(s)`** — normal. Full verbatim messages in
  the body, never truncated.
- **Subject containing `FAILED`** — the notifier hit an exception. The body
  carries the traceback. The command also exits non-zero, so
  `systemctl status` shows it.
- **Subject `Purelymail credit is low`** — the balance is under $5.00. This mail
  sends on its own weekly schedule even when the queue is empty, because the
  quiet stretches are exactly when a draining balance would otherwise go unseen.
- **Silence** — nothing new. This is the success case, by design.

## Credit

Purelymail account credit was $7.35 on 2026-08-06 against a $4.00/year account
fee, so roughly eighteen months of runway. External sends cost $0.23 per 1000,
which is noise at this volume.

If the balance reaches zero, **sending stops** and the notifications go silent,
which looks identical to a clean queue. That is why the floor warns at $5.00
rather than near zero: the warning has to travel by the mechanism that is
failing. Top up on the Purelymail billing page.

```bash
TOKEN=$(pass show shared/purelymail-api-token | head -1) python3 -c "
import os,json,urllib.request
r=urllib.request.Request('https://purelymail.com/api/v0/checkAccountCredit',data=b'{}',
  headers={'Purelymail-Api-Token':os.environ['TOKEN'],'Content-Type':'application/json'})
print(json.loads(urllib.request.urlopen(r,timeout=20).read())['result']['credit'][:8])
"
```

## Kill switches

- `FEEDBACK_NOTIFY_ENABLED` (default `1`) in `/etc/battlestats-server.env`. Set
  to `0` and the command no-ops; the timer still fires and exits 0.
- The ops digest has no kill switch. Disable its timer instead:
  `systemctl disable --now battlestats-ops-digest.timer`.

## Gotchas found the hard way

**The env file is deliberately unreadable by the app user.**
`/etc/battlestats-ops-email.env` is mode 600, root-owned. systemd reads it as
root via `EnvironmentFile=` and injects the values before dropping privileges, so
the variables are present in the process environment while the file itself stays
out of reach. `opsmail.load_env_file` therefore treats an unreadable file as a
no-op. Do not "fix" this by making the file group-readable: that would hand the
app user standing read access to the SMTP credentials, the Purelymail API token
and the Anthropic key. If the variables really are missing, `send_email` raises a
named error listing which ones.

**`daily_ops_email.py` must keep running without the virtualenv.** It imports
`warships.opsmail` through a `sys.path` insert, which works only because that
module is stdlib-only. `test_opsmail.test_module_imports_no_django` parses the
module's AST and fails if a Django import ever appears. Its systemd unit runs it
under `/usr/bin/python3` rather than the venv, deliberately, so the property is
exercised rather than merely documented.

**Why the notifier is a management command and the digest is not.** The digest
reads JSON snapshots off disk and needs no ORM; the notifier queries `Feedback`
and does. One entry point cannot satisfy both, which is why they share only the
send path.

## History

Outbound mail was built on 2026-07-01 and never worked. `daily_ops_email.py` and
its env file were deployed, but nothing scheduled them, because `SMTP_USER` named
`sysop@tamezz.com` and that mailbox did not exist: the `535 Authentication
Failed` was a nonexistent sender identity, not a bad password. Two stored
passwords were abandoned rather than reconciled, since with the mailbox absent
neither could ever have worked. Fixed 2026-08-06 by creating the mailbox, adding
the exact routing rule, and generating a fresh password into Pass.
