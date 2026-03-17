# Archived Runbooks

This folder holds runbooks that are no longer the active source of truth for the current repository state.

Use the archive when you need implementation history, shipped-tranche context, or prior validation notes for a completed feature.

Keep a runbook in `agents/runbooks/` only when it is one of these:

- an active implementation or hardening plan,
- an operational guide that still reflects current behavior,
- an evergreen workflow or maintenance reference.

Move a runbook here when the feature has shipped and the document is primarily historical, or when the runbook's planning state no longer matches the live code.

This archive step is part of the repo's pre-commit doctrine: before every commit, remove superseded runbooks from `agents/runbooks/` so that active runbooks remain the current operational source of truth.
