#!/bin/sh
# Runs the public tests of the newest release tag against the current source (see tests/public).
# A restored test that fails is a breaking change: it passes only with a major changeset.
out=$(break-check \
  --tagPattern='refs/tags/v' \
  --pattern='tests/public/**/*' \
  --testCommand='BREAK_CHECK=1 pnpm test:public' \
  --certifyCommand="grep -qsE '^.?livekit-client.?: major' .changeset/*.md" 2>&1)
code=$?
echo "$out"
# Until a release ships tests/public there is nothing to restore. Remove this guard after it.
if [ "$code" -eq 2 ] && echo "$out" | grep -q 'testsWereFound: false'; then
  echo 'The last release has no public tests: nothing to compare.'
  exit 0
fi
exit "$code"
