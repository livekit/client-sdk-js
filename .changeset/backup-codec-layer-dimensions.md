---
'livekit-client': patch
---

Publishing a backup codec now sends correctly sized video layers on that codec's own entry. Before this fix the layers were zero sized, on a field the server ignores.
