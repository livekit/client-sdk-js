---
'livekit-client': patch
---

Accept incoming text streams that an agent sends on behalf of another participant, such as a user's speech-to-text on `lk.transcription`. The server keeps the participant's identity on the stream header but delivers the chunks and trailer under the agent's identity, so the sender check dropped every chunk and these streams never completed.
