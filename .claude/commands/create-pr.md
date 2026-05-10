---
name: create-pr
description: Create a Conventional-Commits PR with the co-author trailer and the project PR template.
argument-hint: [optional title hint]
---

You are creating a pull request for PROMETHEUS work. Follow the project's PR-creation protocol from `CLAUDE.md`.

## Process

1. **Run in parallel** (Bash):
   - `git status` — confirm clean except for the work to commit
   - `git diff --stat HEAD` — high-level diff
   - `git log -5 --oneline` — recent commits
   - `git branch --show-current`
   - `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — usually `main`

2. **If there are uncommitted changes**, ask the user whether to:
   - Commit them all on the current branch
   - Stash and switch branches
   - Abort

3. **Stage + commit** (only if needed). Use Conventional Commits subject + co-author trailer:

   ```
   <type>(<scope>): <imperative summary>

   <body — why, not what>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```

   NEVER use `--no-verify`. NEVER bypass GPG. If pre-commit fails, fix and **create a new commit** (not amend).

4. **Push** the branch (with `-u` if first push).

5. **Create PR** using `gh pr create`. Use HEREDOC for the body. Body must follow `.github/PULL_REQUEST_TEMPLATE.md` checklist:

   ```bash
   gh pr create --title "<conventional commit subject>" --body "$(cat <<'EOF'
   ## Summary
   <1-3 sentences>

   ## Test plan
   - [ ] All new code has unit tests
   - [ ] CI green
   - [ ] Manual test on staging (if user-facing): <describe>

   ## Schema + contract
   - [ ] No agent schema changes — OR — schema changes are documented and TS mirror updated
   - [ ] No prompt change — OR — docs/PROMPT_REGISTRY.md updated AND golden regression run
   - [ ] No topology change — OR — docs/ARCHITECTURE.md updated

   ## Security review
   - [ ] No service-account.json paths anywhere
   - [ ] OAuth scope drive.file only
   - [ ] No raw HTML/SVG to DOM without nh3 + DOMPurify
   - [ ] All iframes sandbox="allow-forms" only
   - [ ] No Gemini call for legal text
   - [ ] Every agent has response_schema set
   - [ ] idea_text hashed in logs

   ## Rollout
   <feature flag? infra change? rollback plan?>

   🤖 Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

6. **Return the PR URL** in your final message.

## Post-create

Do NOT auto-merge. Do NOT request review yet. The user reviews the PR description first.
