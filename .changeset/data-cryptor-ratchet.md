---
'livekit-client': patch
---

Fix data packet decryption after the sender ratchets its key: `DataCryptor` now retries with the ratcheted key instead of the stored one
