import dotenv from 'dotenv';
import express from 'express';
import type { Express } from 'express';
import { EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';

dotenv.config({ path: ".env.local" });
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET = process.env.S3_SECRET;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;

const app = express();
app.use(express.json());

app.post("/api/start-recording", async (req, res) => {
  const { roomName } = req.body;
  // Upload the recording to S3 compatible storage
  const fileOutput = new EncodedFileOutput({
    filepath: "recording.mp4",
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: S3_ACCESS_KEY,
        secret: S3_SECRET,
        bucket: S3_BUCKET,
        forcePathStyle: true,
        endpoint: S3_ENDPOINT
      }),
    }
  });
  if(!LIVEKIT_URL) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }
  const egressClient = new EgressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const egressInfo = await egressClient.startRoomCompositeEgress(roomName, fileOutput);
  const egressId = egressInfo.egressId;
  res.json({
    egressId: egressId
  });
});

app.post("/api/stop-recording", async (req, res) => {
  const { egressId } = req.body;
  const egressClient = new EgressClient(LIVEKIT_URL!, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  await egressClient.stopEgress(egressId);
});

export const handler: Express = app;