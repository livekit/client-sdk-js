/**
 * Realistic structured JSON test data for the data-stream benchmark. Each line is a self-contained
 * JSON object resembling production payloads (user profiles, events, metrics, logs, etc.). All lines
 * are ASCII so that one character equals one byte, which lets us slice payloads to an exact byte
 * length without worrying about UTF-8 boundaries.
 */
const TEST_DATA_LINES: string[] = [
  '{"id":"usr_a1b2c3","name":"Alice Chen","email":"alice.chen@example.com","role":"engineer","department":"platform","projects":["livekit-core","media-pipeline","signaling"],"metrics":{"commits":342,"reviews":128,"deployments":57},"location":"San Francisco, CA","joined":"2022-03-15T08:30:00Z"}',
  '{"event":"room.participant_joined","timestamp":"2025-01-15T14:22:33.456Z","room_sid":"RM_xK9mPq2nR4","participant_sid":"PA_j7hLw3vYm1","identity":"speaker-042","metadata":{"display_name":"Dr. Sarah Mitchell","avatar_url":"https://cdn.example.com/avatars/sm042.jpg","hand_raised":false}}',
  '{"sensor_id":"temp-rack-07b","readings":[{"ts":1705312800,"value":23.4,"unit":"celsius"},{"ts":1705312860,"value":23.6,"unit":"celsius"},{"ts":1705312920,"value":24.1,"unit":"celsius"},{"ts":1705312980,"value":23.8,"unit":"celsius"}],"status":"nominal","location":"datacenter-west-3"}',
  '{"order_id":"ORD-2025-00847","customer":{"id":"cust_9f8e7d","name":"Bob Williams","tier":"premium"},"items":[{"sku":"WDG-1042","name":"Wireless Adapter Pro","qty":2,"price":49.99},{"sku":"CBL-3001","name":"USB-C Cable 2m","qty":5,"price":12.99}],"total":164.93,"currency":"USD","status":"processing"}',
  '{"trace_id":"abc123def456","spans":[{"name":"http.request","duration_ms":245,"status":"ok","attributes":{"http.method":"POST","http.url":"/api/v2/rooms","http.status_code":201}},{"name":"db.query","duration_ms":12,"status":"ok","attributes":{"db.system":"postgresql","db.statement":"INSERT INTO rooms"}}]}',
  '{"log_level":"warn","service":"media-router","instance":"mr-us-east-07","message":"Track subscription delayed due to network congestion","context":{"room_sid":"RM_pQ8nL2mK5x","track_sid":"TR_w4jR7vN9y3","participant_sid":"PA_k2mX5bH8r1","delay_ms":1847,"retry_count":3,"bandwidth_estimate_bps":2450000}}',
  '{"config":{"video":{"codecs":["VP8","H264","AV1"],"simulcast":{"enabled":true,"layers":[{"rid":"f","maxBitrate":2500000,"maxFramerate":30},{"rid":"h","maxBitrate":800000,"maxFramerate":15},{"rid":"q","maxBitrate":200000,"maxFramerate":7}]},"dynacast":true},"audio":{"codecs":["opus"],"dtx":true,"red":true,"stereo":false}}}',
  '{"benchmark":{"test":"data-stream-throughput","iteration":1547,"payload_bytes":15360,"latency_ms":23.7,"path":"inline","timestamp":"2025-06-20T10:15:33.891Z","sender":"bench-sender","receiver":"bench-receiver","room":"benchmark-room-8f3a"}}',
  '{"user_id":"u_7k3m9p","session":{"id":"sess_abc123","started":"2025-01-15T09:00:00Z","duration_minutes":47,"pages_viewed":12,"actions":[{"type":"click","target":"#start-call","ts":1705308120},{"type":"input","target":"#chat-message","ts":1705308245},{"type":"click","target":"#share-screen","ts":1705308390}],"device":{"browser":"Chrome 121","os":"macOS 14.2","screen":"2560x1440"}}}',
  '{"pipeline_id":"pipe_rtc_042","stages":[{"name":"capture","codec":"VP8","resolution":"1920x1080","fps":30,"bitrate_kbps":2500},{"name":"encode","profile":"constrained-baseline","hardware_accel":true,"latency_ms":4.2},{"name":"packetize","mtu":1200,"fec_enabled":true,"nack_enabled":true},{"name":"transport","protocol":"UDP","ice_candidates":3,"dtls_setup":"actpass"}]}',
  '{"cluster":{"id":"lk-us-east-1","region":"us-east-1","nodes":[{"id":"node-01","type":"media","status":"healthy","load":0.67,"rooms":42,"participants":318,"cpu_pct":54.2,"mem_pct":71.8},{"id":"node-02","type":"media","status":"healthy","load":0.43,"rooms":31,"participants":201,"cpu_pct":38.1,"mem_pct":55.4}],"total_rooms":73,"total_participants":519}}',
  '{"deployment":{"id":"deploy_20250115_003","service":"livekit-server","version":"1.8.2","environment":"production","region":"eu-west-1","status":"completed","started_at":"2025-01-15T03:00:00Z","completed_at":"2025-01-15T03:12:47Z","changes":["fix: ice restart race condition","feat: improved simulcast layer selection","perf: reduce memory allocation in media forwarding"],"rollback_available":true,"health_check":"passing"}}',
  '{"analytics":{"room_id":"RM_daily_standup_042","period":"2025-01-15T09:00:00Z/2025-01-15T09:30:00Z","participants":{"total":8,"max_concurrent":7,"avg_duration_minutes":22.4},"media":{"audio":{"total_minutes":156.8,"avg_bitrate_kbps":32,"packet_loss_pct":0.02},"video":{"total_minutes":134.2,"avg_bitrate_kbps":1850,"packet_loss_pct":0.08,"avg_fps":28.7}},"quality_score":4.7}}',
  '{"ticket":{"id":"TICKET-8472","title":"Intermittent audio dropout in large rooms","priority":"high","status":"in_progress","assignee":"eng-media-team","reporter":"support-agent-12","created":"2025-01-14T16:30:00Z","updated":"2025-01-15T11:22:00Z","labels":["audio","production","p1"],"comments_count":7,"related_incidents":["INC-2025-0042","INC-2025-0039"]}}',
];

let cachedBase: string | null = null;

/**
 * Builds (once) a large ASCII string by repeatedly joining the test data lines until it comfortably
 * exceeds the largest payload we benchmark, so payloads can be sliced out of it.
 */
function getBase(): string {
  if (cachedBase !== null) {
    return cachedBase;
  }
  const minLength = 1_100_000;
  const parts: string[] = [];
  let length = 0;
  let idx = 0;
  while (length < minLength) {
    const line = TEST_DATA_LINES[idx % TEST_DATA_LINES.length];
    parts.push(line);
    length += line.length + 1; // +1 for the '\n' join separator
    idx += 1;
  }
  cachedBase = parts.join('\n');
  return cachedBase;
}

/**
 * Returns a JSON-ish payload of exactly `targetBytes` bytes, sliced from a random offset of the
 * shared base string (ASCII, so byte length === character length).
 */
export function generatePayload(targetBytes: number): string {
  const base = getBase();
  if (targetBytes >= base.length) {
    throw new Error(`requested payload (${targetBytes}) larger than base data (${base.length})`);
  }
  const maxOffset = base.length - targetBytes;
  const offset = Math.floor(Math.random() * maxOffset);
  return base.slice(offset, offset + targetBytes);
}

export function checksum(str: string) {
  let sum = 0;
  for (let i = 0; i < str.length; i += 1) {
    sum += str.charCodeAt(i);
  }
  return sum;
}
