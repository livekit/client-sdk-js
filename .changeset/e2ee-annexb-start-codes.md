---
'livekit-client': patch
---

Fix E2EE H.264/H.265 decryption failing for encoders that emit 3-byte Annex B start codes (e.g. Intel Quick Sync on Windows). The sender now rewrites them to 4-byte start codes in the unencrypted header, matching what the receiver's depacketizer reconstructs.
