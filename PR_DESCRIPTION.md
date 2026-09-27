# Fix refresh of stale sync PR branches

## Problem

Open Dependabot-config and `file-sync` PRs could be based on an outdated default branch after the target branch moves forward.

Previously, an already-current managed file could cause the action to treat the PR as up to date even when its branch was no longer based on the current default tip. The PR then kept an outdated diff and could be blocked from merging.

After a target commit (`B`) was added, the old PR branch still looked like this:

```
main:        A -- B
sync branch: A -- S
```

Refreshing now moves the sync branch onto `B` and creates a new sync commit (`S'`):

```
main:        A -- B
sync branch:      B -- S'
```

So the refreshed branch contains the new target commit and the new sync commit; the PR diff against the current target remains limited to `S'`.

## Changes

### Fix stale sync PR branches

- Refresh action-owned sync PRs from the current default branch when that tip is not an ancestor of the PR branch.
- Rebuild the managed-file diff on the current default tree, so unrelated changes from the old target history do not remain in the PR.

### New behavior: protect externally modified PR branches

- Follow Dependabot's safety model for externally changed bot branches: if the PR-only history contains a commit not made by the action account, do not refresh or auto-close the PR.
- Report these externally modified PR branches as warnings, while leaving the branch and PR open for review.

### Internal cleanup

- Share sync-PR ownership and lifecycle checks across file-sync and single-file sync paths.

## Validation and related work

- Adds unit coverage here for stale and ancestor branch handling.
- A corresponding PR in `bulk-github-repo-settings-sync-action-live-tests` adds live coverage for diverged branches, ancestor branches, external commits, and protected stale PRs.
