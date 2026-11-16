# Changesets

Each PR that changes the package adds a file here. It names the bump level and
describes the change in one sentence for the user of the package:

```md
---
'livekit-client': patch
---

Fix the reconnect when the signal connection drops during a publish.
```

`verwalter changeset --level patch` writes the file. [verwalter](https://github.com/livekit/verwalter)
collects the files into one release PR. Merging that PR releases the package.
