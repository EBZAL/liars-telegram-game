# Git Safety

Before repository mutation:
- confirm repository root;
- confirm branch/HEAD;
- inspect worktree;
- stop on unrelated existing changes.

Do not automatically stash/reset/discard unknown user work.

Unless explicitly authorized, do not:
- force-push;
- reset --hard;
- rebase;
- amend;
- delete branches/tags;
- destructive clean;
- rewrite published history.

Stage only intended files; avoid broad staging when unrelated files may exist.

Before commit, inspect staged changes and prevent secret exposure.

Implementation normally uses:
1. task-start state commit;
2. implementation commit;
3. Evidence/state commit.

State Sync uses a separate state commit.

Never claim PUSHED unless push actually succeeded.
