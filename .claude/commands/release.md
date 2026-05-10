---
name: release
description: Cut a semver release — bump version, tag, push tag (triggers cd.yml).
argument-hint: <bump: patch|minor|major>
---

You are cutting a PROMETHEUS release. Semver bump.

## Process

1. **Confirm bump.** If user did not pass `patch|minor|major`, ask. No default.

2. **Pre-flight** (Bash, parallel):
   - `git status` — must be clean
   - `git branch --show-current` — must be `main`
   - `git pull origin main` — confirm up-to-date
   - `git describe --tags --abbrev=0` — current tag (e.g. `v0.4.2`)
   - `gh run list --limit 5 --json name,status,conclusion` — CI green on HEAD

3. **Compute new version** from current tag + bump:
   - `v0.4.2` + `patch` → `v0.4.3`
   - `v0.4.2` + `minor` → `v0.5.0`
   - `v0.4.2` + `major` → `v1.0.0`

4. **Update CHANGELOG.md** (if it exists; else create) with the change list since last tag:
   ```bash
   git log <prev_tag>..HEAD --oneline --no-merges
   ```
   Group by Conventional Commit type (feat / fix / chore / etc.).

5. **Commit** the changelog change:
   ```
   chore(release): vX.Y.Z

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```

6. **Tag**:
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```

7. **Push** the commit + tag:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

8. **Confirm** `cd.yml` triggered:
   ```bash
   gh run list --limit 1 --json name,status,headBranch
   ```

## Output

Print the version, tag URL, and the link to the CD run.

## On failure

If pre-flight fails (dirty tree, behind main, CI red), STOP. Do not bump.

## Major-bump policy

Major bumps require:
- A migration doc in `docs/migrations/X.0.0.md`
- A backward-incompatibility note in CHANGELOG
- 2 reviewer sign-off on the merge that landed the breaking change
- Customer comms plan (email + status page note)
