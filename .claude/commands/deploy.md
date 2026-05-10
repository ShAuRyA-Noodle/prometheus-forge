---
name: deploy
description: Run scripts/deploy.sh after confirming env. Tags release on success.
argument-hint: <env: dev|staging|prod>
---

You are deploying PROMETHEUS to one of: `dev`, `staging`, `prod`.

## Process

1. **Confirm env.** If the user did not pass `dev|staging|prod`, ask. Do NOT default to prod.

2. **Pre-flight check.** Run these in parallel via Bash:
   - `git status` — must be clean
   - `git log -1 --oneline` — show what is being deployed
   - `git diff --stat HEAD~1` — show diff at-a-glance
   - `gh run list --limit 5 --json name,status,conclusion` — confirm CI is green on this commit

3. **If `prod`**, also confirm:
   - User explicitly typed `prod` (not just "production" — exact match)
   - The current branch is `main`
   - No P0/P1 issues are open with the `pipeline` or `security` label
   - Ask the user once: "About to deploy `<sha>` to **production**. Confirm? (yes/no)"

4. **Run the deploy.** Pass env as the first arg:

   ```bash
   ./scripts/deploy.sh <env>
   ```

   The script handles: build, push, sigstore-sign, deploy gateway + worker, apply Firestore rules + indexes, frontend Firebase hosting, smoke tests, and (for prod) canary 10→100%.

5. **On success**, tag the release:

   ```bash
   git tag "deploy/<env>/$(date -u +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)"
   git push --tags
   ```

6. **Report back** in the final message:
   - Env deployed
   - SHA + tag
   - Smoke test result
   - Link to the Cloud Run revision

## On failure

If the deploy fails:
- Print the relevant tail of `scripts/deploy.sh` output
- DO NOT auto-rollback unless the user requests it (rollback is in `docs/RUNBOOK.md` Playbook A)
- Surface the failure cause + the recommended next step (rollback, hotfix, or investigate)
