/**
 * Generated structured JSON test data for RPC benchmarking.
 *
 * Each line is a self-contained JSON object representing realistic structured
 * data (user profiles, events, metrics, etc.). This data compresses roughly
 * as well as typical structured payloads.
 */

const TEST_DATA_LINES: string[] = [
  '{"id":"usr_a1b2c3","name":"Alice Chen","email":"alice.chen@example.com","role":"engineer","department":"platform","projects":["livekit-core","media-pipeline","signaling"],"metrics":{"commits":342,"reviews":128,"deployments":57},"location":"San Francisco, CA","joined":"2022-03-15T08:30:00Z"}',
  '{"event":"room.participant_joined","timestamp":"2025-01-15T14:22:33.456Z","room_sid":"RM_xK9mPq2nR4","participant_sid":"PA_j7hLw3vYm1","identity":"speaker-042","metadata":{"display_name":"Dr. Sarah Mitchell","avatar_url":"https://cdn.example.com/avatars/sm042.jpg","hand_raised":false}}',
  '{"sensor_id":"temp-rack-07b","readings":[{"ts":1705312800,"value":23.4,"unit":"celsius"},{"ts":1705312860,"value":23.6,"unit":"celsius"},{"ts":1705312920,"value":24.1,"unit":"celsius"},{"ts":1705312980,"value":23.8,"unit":"celsius"}],"status":"nominal","location":"datacenter-west-3"}',
  '{"order_id":"ORD-2025-00847","customer":{"id":"cust_9f8e7d","name":"Bob Williams","tier":"premium"},"items":[{"sku":"WDG-1042","name":"Wireless Adapter Pro","qty":2,"price":49.99},{"sku":"CBL-3001","name":"USB-C Cable 2m","qty":5,"price":12.99}],"total":164.93,"currency":"USD","status":"processing"}',
  '{"trace_id":"abc123def456","spans":[{"name":"http.request","duration_ms":245,"status":"ok","attributes":{"http.method":"POST","http.url":"/api/v2/rooms","http.status_code":201}},{"name":"db.query","duration_ms":12,"status":"ok","attributes":{"db.system":"postgresql","db.statement":"INSERT INTO rooms"}}]}',
  '{"log_level":"warn","service":"media-router","instance":"mr-us-east-07","message":"Track subscription delayed due to network congestion","context":{"room_sid":"RM_pQ8nL2mK5x","track_sid":"TR_w4jR7vN9y3","participant_sid":"PA_k2mX5bH8r1","delay_ms":1847,"retry_count":3,"bandwidth_estimate_bps":2450000}}',
  '{"config":{"video":{"codecs":["VP8","H264","AV1"],"simulcast":{"enabled":true,"layers":[{"rid":"f","maxBitrate":2500000,"maxFramerate":30},{"rid":"h","maxBitrate":800000,"maxFramerate":15},{"rid":"q","maxBitrate":200000,"maxFramerate":7}]},"dynacast":true},"audio":{"codecs":["opus"],"dtx":true,"red":true,"stereo":false}}}',
  '{"benchmark":{"test":"rpc-throughput","iteration":1547,"payload_bytes":15360,"compress_ratio":0.42,"latency_ms":23.7,"path":"compressed","timestamp":"2025-06-20T10:15:33.891Z","caller":"bench-caller-01","receiver":"bench-receiver-01","room":"benchmark-room-8f3a"}}',
  '{"user_id":"u_7k3m9p","session":{"id":"sess_abc123","started":"2025-01-15T09:00:00Z","duration_minutes":47,"pages_viewed":12,"actions":[{"type":"click","target":"#start-call","ts":1705308120},{"type":"input","target":"#chat-message","ts":1705308245},{"type":"click","target":"#share-screen","ts":1705308390}],"device":{"browser":"Chrome 121","os":"macOS 14.2","screen":"2560x1440"}}}',
  '{"pipeline_id":"pipe_rtc_042","stages":[{"name":"capture","codec":"VP8","resolution":"1920x1080","fps":30,"bitrate_kbps":2500},{"name":"encode","profile":"constrained-baseline","hardware_accel":true,"latency_ms":4.2},{"name":"packetize","mtu":1200,"fec_enabled":true,"nack_enabled":true},{"name":"transport","protocol":"UDP","ice_candidates":3,"dtls_setup":"actpass"}]}',
  '{"notification":{"id":"notif_x8k2m","type":"room_recording_ready","recipient":"user_j4n7p","channel":"webhook","payload":{"room_name":"team-standup-2025-01-15","recording_url":"https://storage.example.com/recordings/rec_abc123.mp4","duration_seconds":1847,"file_size_bytes":245760000,"format":"mp4","resolution":"1920x1080"},"created_at":"2025-01-15T10:35:00Z"}}',
  '{"cluster":{"id":"lk-us-east-1","region":"us-east-1","nodes":[{"id":"node-01","type":"media","status":"healthy","load":0.67,"rooms":42,"participants":318,"cpu_pct":54.2,"mem_pct":71.8},{"id":"node-02","type":"media","status":"healthy","load":0.43,"rooms":31,"participants":201,"cpu_pct":38.1,"mem_pct":55.4}],"total_rooms":73,"total_participants":519}}',
  '{"invoice":{"number":"INV-2025-003847","date":"2025-01-15","due_date":"2025-02-14","vendor":{"name":"Cloud Services Inc.","address":"100 Tech Blvd, Austin, TX 78701","tax_id":"US-847291035"},"line_items":[{"description":"Media Server Instances (720 hrs)","quantity":720,"unit_price":0.085,"amount":61.20},{"description":"Bandwidth (2.4 TB)","quantity":2400,"unit_price":0.02,"amount":48.00},{"description":"TURN Relay (180 hrs)","quantity":180,"unit_price":0.04,"amount":7.20}],"subtotal":116.40,"tax":9.31,"total":125.71}}',
  '{"experiment":{"id":"exp_codec_comparison_042","hypothesis":"AV1 reduces bandwidth by 30% vs VP8 at equivalent quality","groups":[{"name":"control","codec":"VP8","participants":500,"avg_bitrate_kbps":2100,"avg_psnr":38.2,"avg_latency_ms":45},{"name":"treatment","codec":"AV1","participants":500,"avg_bitrate_kbps":1470,"avg_psnr":38.5,"avg_latency_ms":52}],"p_value":0.003,"significant":true,"start_date":"2025-01-01","end_date":"2025-01-14"}}',
  '{"deployment":{"id":"deploy_20250115_003","service":"livekit-server","version":"1.8.2","environment":"production","region":"eu-west-1","status":"completed","started_at":"2025-01-15T03:00:00Z","completed_at":"2025-01-15T03:12:47Z","changes":["fix: ice restart race condition","feat: improved simulcast layer selection","perf: reduce memory allocation in media forwarding"],"rollback_available":true,"health_check":"passing"}}',
  '{"analytics":{"room_id":"RM_daily_standup_042","period":"2025-01-15T09:00:00Z/2025-01-15T09:30:00Z","participants":{"total":8,"max_concurrent":7,"avg_duration_minutes":22.4},"media":{"audio":{"total_minutes":156.8,"avg_bitrate_kbps":32,"packet_loss_pct":0.02},"video":{"total_minutes":134.2,"avg_bitrate_kbps":1850,"packet_loss_pct":0.08,"avg_fps":28.7},"screen_share":{"total_minutes":15.3,"avg_bitrate_kbps":3200}},"quality_score":4.7}}',
  '{"ticket":{"id":"TICKET-8472","title":"Intermittent audio dropout in large rooms","priority":"high","status":"in_progress","assignee":"eng-media-team","reporter":"support-agent-12","created":"2025-01-14T16:30:00Z","updated":"2025-01-15T11:22:00Z","labels":["audio","production","p1"],"comments_count":7,"related_incidents":["INC-2025-0042","INC-2025-0039"],"description":"Users in rooms with 50+ participants report intermittent audio dropouts lasting 2-5 seconds"}}',
  '{"schema":{"table":"participants","columns":[{"name":"id","type":"uuid","primary_key":true},{"name":"room_id","type":"uuid","foreign_key":"rooms.id","index":true},{"name":"identity","type":"varchar(255)","not_null":true},{"name":"name","type":"varchar(500)"},{"name":"metadata","type":"jsonb"},{"name":"joined_at","type":"timestamptz","not_null":true,"default":"now()"},{"name":"left_at","type":"timestamptz"},{"name":"state","type":"enum(active,disconnected,migrating)","not_null":true,"default":"active"}],"indexes":["idx_participants_room_id","idx_participants_identity"]}}',
  '{"weather":{"station":"SFO-042","timestamp":"2025-01-15T12:00:00Z","temperature_c":14.2,"humidity_pct":72,"wind_speed_kmh":18.5,"wind_direction":"NW","pressure_hpa":1013.2,"conditions":"partly_cloudy","forecast":[{"hour":13,"temp_c":14.8,"precip_pct":10},{"hour":14,"temp_c":15.1,"precip_pct":5},{"hour":15,"temp_c":14.9,"precip_pct":15},{"hour":16,"temp_c":14.3,"precip_pct":25}]}}',
  '{"translation":{"request_id":"tr_9f8e7d6c","source_lang":"en","target_lang":"ja","model":"nmt-v4","segments":[{"source":"The meeting will start in 5 minutes.","target":"\u4f1a\u8b70\u306f5\u5206\u5f8c\u306b\u59cb\u307e\u308a\u307e\u3059\u3002","confidence":0.97},{"source":"Please enable your camera.","target":"\u30ab\u30e1\u30e9\u3092\u6709\u52b9\u306b\u3057\u3066\u304f\u3060\u3055\u3044\u3002","confidence":0.95}],"total_chars":78,"latency_ms":142,"cached":false}}',
];

/**
 * Generate a payload of the specified byte size by cycling through and
 * concatenating random lines from the test data set, then slicing to exact
 * size on a valid character boundary.
 */
export function generatePayload(targetBytes: number): string {
  if (targetBytes <= 0) return '';

  const encoder = new TextEncoder();
  let result = '';

  // Shuffle indices for realistic randomness
  const indices = Array.from({ length: TEST_DATA_LINES.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  let idx = 0;
  while (encoder.encode(result).length < targetBytes) {
    if (result.length > 0) {
      result += '\n';
    }
    result += TEST_DATA_LINES[indices[idx % indices.length]];
    idx += 1;
    // Re-shuffle when we've gone through all lines
    if (idx % indices.length === 0) {
      for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
  }

  // Trim to exact byte size on a valid character boundary
  const encoded = encoder.encode(result);
  if (encoded.length <= targetBytes) {
    // Pad with spaces if under target
    const padding = targetBytes - encoded.length;
    return result + ' '.repeat(padding);
  }

  // Binary search for the right character count that fits in targetBytes
  let low = 0;
  let high = result.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (encoder.encode(result.slice(0, mid)).length <= targetBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const trimmed = result.slice(0, low);
  const trimmedLen = encoder.encode(trimmed).length;
  // Pad remainder with spaces to hit exact target
  if (trimmedLen < targetBytes) {
    return trimmed + ' '.repeat(targetBytes - trimmedLen);
  }
  return trimmed;
}
