# RPC v2 Specification

## Overview

RPC (Remote Procedure Call) allows participants in a LiveKit room to invoke methods on each other
and receive responses. RPC v1 used inline protobuf packets (`RpcRequest` / `RpcResponse`) with a
hard 15 KB payload limit.

RPC v2 lifts this limit by transporting request and response payloads over **data streams**, while
retaining v1 as a fallback for legacy clients. This removes the previously set 15kb request /
response payload size limitation, making both effectively limitless.

A v2 client should seamlessly communicate with v1 clients by detecting the remote participant's
client protocol version and falling back to v1 packets if it doesn't support rpc v2.

---

## Part 1: Client protocol

### What is client protocol?

`clientProtocol` is a new integer that each participant advertises in their `ParticipantInfo` via
the LiveKit signaling channel. It tells other participants what client-to-client features this SDK
supports. It is distinct from the existing `protocol` field (which tracks signaling protocol
version) - `clientProtocol` specifically governs peer-to-peer feature negotiation.

| Value | Constant name | Meaning |
|-------|---------------|---------|
| `0` | `CLIENT_PROTOCOL_DEFAULT` | Legacy client. Only supports RPC v1. |
| `1` | `CLIENT_PROTOCOL_DATA_STREAM_RPC` | Supports RPC v2 (data stream-based payloads). |

### What SDKs need to do

1. **Advertise**: Set your SDK's `clientProtocol` to `1` (`CLIENT_PROTOCOL_DATA_STREAM_RPC`) in the
   `ParticipantInfo` sent during the join handshake.

2. **Read**: When a remote participant joins or updates, store their `clientProtocol` value. This is
   available on the `ParticipantInfo` protobuf. If the field is absent or unrecognized, treat it as
   `0` (`CLIENT_PROTOCOL_DEFAULT`).

3. **Use**: Before sending an RPC request or response, look up the remote participant's
   `clientProtocol` to decide whether to use the v1 (packet) or v2 (data stream) transport.

---

## Part 2: RPC protocol updates

As a review, here is how RPC v1 works today:

```
Caller                              Handler
  |                                    |
  |--- RpcRequest (DataPacket) ------->|
  |                                    |  (looks up handler, invokes it)
  |<-- RpcAck (DataPacket) -----------|
  |<-- RpcResponse (DataPacket) ------|
  |                                    |
```

1. The **caller** sends a `DataPacket` containing a `RpcRequest` protobuf:
   - `id`: a UUID identifying this request
   - `method`: the method name
   - `payload`: the request payload string (must be <= 15 KB)
   - `responseTimeoutMs`: the effective timeout in milliseconds
   - `version`: `1`
   - Packet kind: `RELIABLE`
   - Destination: the handler's identity

2. The **handler** receives the `RpcRequest` packet and immediately sends an **ack** - a
   `DataPacket` containing a `RpcAck` protobuf with the `requestId`. This tells the caller that
   the handler is alive and processing.

3. The handler invokes the registered method handler. When it completes, the handler sends a
   `DataPacket` containing a `RpcResponse` protobuf:
   - `requestId`: matches the original request
   - `value`: either `{ case: 'payload', value: responseString }` for success, or
     `{ case: 'error', value: RpcError protobuf }` for failure
   - The response payload is also subject to the 15 KB limit.

4. The **caller** receives the `RpcResponse` and resolves or rejects the pending promise.

### RPC v2 Example

v2 replaces the `RpcRequest` and `RpcResponse` protobuf packets with **text data streams** for
carrying payloads. The ack mechanism is unchanged. This removes the payload size limit while
remaining backward-compatible with v1 clients.

```
Caller                              Handler
  |                                    |
  |--- Text data stream (request) --->|
  |    topic: "lk.rpc_request"         |
  |    attrs: request_id, method,      |
  |           timeout, version=2       |
  |    body: <payload>                 |
  |                                    |  (reads stream, looks up handler, invokes it)
  |<-- RpcAck (DataPacket) -----------|
  |<-- Text data stream (response) ---|
  |    topic: "lk.rpc_response"        |
  |    attrs: request_id               |
  |    body: <response payload>        |
  |                                    |
```

1. The **caller** opens a text data stream with:
   - **Topic**: `lk.rpc_request`
   - **Destination identities**: `[destinationIdentity]`
   - **Attributes**:
     - `lk.rpc_request_id`: a newly generated UUID
     - `lk.rpc_request_method`: the method name
     - `lk.rpc_request_response_timeout_ms`: the effective timeout in milliseconds, as a string
     - `lk.rpc_request_version`: `"2"`
   - Writes the payload string to the stream, then closes it.

2. The **handler** receives the data stream on topic `lk.rpc_request`. It parses the attributes
   to extract the request ID, method, timeout, and version. It sends an **ack** (same `RpcAck`
   packet as v1), then reads the full stream payload.

3. The handler invokes the registered method handler. On success, it sends the response as a
   text data stream:
   - **Topic**: `lk.rpc_response`
   - **Destination identities**: `[callerIdentity]`
   - **Attributes**: `{ "lk.rpc_request_id": requestId }`
   - Writes the response payload, then closes the stream.

4. The **caller** receives the data stream on topic `lk.rpc_response`. It reads the
   `lk.rpc_request_id` attribute to match it to the pending request, reads the full stream,
   and resolves the pending promise with the payload.

The user-facing API should be identical for v1 and v2.

The protocol version negotiation is invisible to the user. The only visible difference that a user
should see is that if they send a rpc request or receive a rpc response from a participant
supporting rpc v2 with a length greater than 15kb, they will NOT receive a
`REQUEST_PAYLOAD_TOO_LARGE` / `RESPONSE_PAYLOAD_TOO_LARGE` error - it will "just work". With rpc v2,
these errors are effectively deprecated.

#### Error responses in v2

**Error responses are always sent as v1 `RpcResponse` packets**, even when both sides are v2. This
is because error payloads tend to be small (code + message + optional data) and using packets keeps
the error path simple and uniform. This means:

- Success responses between two v2 clients: **data stream**
- Error responses between two v2 clients: **packet** (`RpcResponse` with `error` case)
- All responses to v1 clients: **packet**

#### Data stream topic routing

RPC requests and responses use separate data stream topics:

- **`lk.rpc_request`**: Register a text stream handler for this topic. Incoming streams are RPC
  requests. Route to the handler-side logic, passing the sender identity and the stream attributes.
- **`lk.rpc_response`**: Register a text stream handler for this topic. Incoming streams are RPC
  responses. Read the `lk.rpc_request_id` attribute to match the response to a pending request,
  then route to the caller-side logic.

### Version negotiation and backward compatibility

The transport used for a given RPC call depends on what both sides support. The caller decides the
request transport; the handler decides the response transport.

| Caller | Handler | Request transport | Response transport |
|--------|---------|------------------|--------------------|
| v2 | v2 | Data stream | Data stream (success) / Packet (error) |
| v2 | v1 | Packet (`RpcRequest`) | Packet (`RpcResponse`) |
| v1 | v2 | Packet (`RpcRequest`) | Packet (`RpcResponse`) |
| v1 | v1 | Packet (`RpcRequest`) | Packet (`RpcResponse`) |

**Data streams are only used when both sides are v2.** Cross-version interactions always fall back
to v1 packets. This is because:

- The **caller** checks the remote participant's `clientProtocol` before sending. If the remote is
  v1, the caller sends a v1 `RpcRequest` packet.
- The **handler** checks the caller's `clientProtocol` before responding. If the caller is v1, the
  handler sends a v1 `RpcResponse` packet. (The handler knows the caller is v1 because the request
  arrived as a v1 packet, and it can also check the caller's `clientProtocol`.)

### Timeout and ack behavior

These behaviors are the same for v1 and v2.

### Recommended Naming
In existing implementations of this proposal, the entity responsible for the **caller** role(s) in the
above workflow is called `RpcClientManager`. The entity responsible for the **handler** role(s) in
the above workflow is called `RpcServerManager`.

Store client protocol versions in constants named `CLIENT_PROTOCOL_DEFAULT` for `0`, and
`CLIENT_PROTOCOL_DATA_STREAM_RPC` for `1`.

Use these names unless it would be burdensome to do so due to past sdk architecture decisions - if
you don't use these names, please provide a rationale to the user and make sure they agree before
continuing.

## Minimum required test cases

The following tests represent the minimum set that must pass for a conforming implementation. They
are organized by the version interaction being tested. Since this spec describes implementing a v2
SDK, at least one side of every interaction is always v2. Each test describes the full lifecycle
from both the caller and handler perspectives.

### v2 -> v2 (both sides support data streams)

1. **Caller happy path (short payload)**
   - The caller opens a text data stream on topic `lk.rpc_request` with attributes
     `lk.rpc_request_id`, `lk.rpc_request_method`, `lk.rpc_request_response_timeout_ms`, and
     `lk.rpc_request_version: "2"`.
   - The caller writes the payload string to the stream and closes it.
   - Verify no `RpcRequest` packet is produced.
   - Simulate the handler sending a `RpcAck` packet and a successful response.
   - Verify the caller resolves with the response payload.

2. **Caller happy path (large payload > 15 KB)**
   - The caller opens a text data stream on topic `lk.rpc_request` with the same attributes as
     above, but with a payload exceeding 15 KB (e.g., 20,000 bytes).
   - The caller writes the large payload to the stream and closes it.
   - Verify no `REQUEST_PAYLOAD_TOO_LARGE` error is raised - the data stream path has no size
     limit.
   - Simulate the handler sending a `RpcAck` packet and a successful response.
   - Verify the caller resolves with the response payload.

3. **Handler happy path**
   - The handler receives a text data stream on topic `lk.rpc_request` with valid attributes.
   - The handler sends a `RpcAck` packet with the request ID.
   - The handler reads the full stream payload and invokes the registered method handler with
     `{ requestId, callerIdentity, payload, responseTimeout }`.
   - The method handler returns a response string.
   - The handler sends the response as a text data stream on topic `lk.rpc_response` with
     attribute `lk.rpc_request_id` set to the request ID.
   - Verify no `RpcResponse` packet is produced - successful v2 responses use data streams.

4. **Unhandled error in handler**
   - The handler receives a v2 data stream request.
   - The handler sends a `RpcAck` packet.
   - The registered method handler throws a non-RpcError exception (e.g., a generic `Error`).
   - The handler sends a `RpcResponse` **packet** (not a data stream) with error code
     `APPLICATION_ERROR` (1500).
   - Verify error responses always use packets, even between two v2 clients.

5. **RpcError passthrough in handler**
   - The handler receives a v2 data stream request.
   - The handler sends a `RpcAck` packet.
   - The registered method handler throws a `RpcError` with a custom code (e.g., 101) and
     message.
   - The handler sends a `RpcResponse` packet preserving the original error code and message.

6. **Response timeout**
   - The caller sends a v2 data stream request with a short response timeout (e.g., 50ms).
   - No `RpcAck` or response arrives.
   - After the timeout elapses, the caller rejects with `RESPONSE_TIMEOUT` (code 1502).

7. **Error response**
   - The caller sends a v2 data stream request.
   - Simulate the handler sending a `RpcAck` packet, then a `RpcResponse` packet with an error
     (e.g., code 101, message "Test error message").
   - Verify the caller rejects with the correct error code and message.

8. **Participant disconnection**
   - The caller sends a v2 data stream request.
   - Before any ack or response arrives, the remote participant disconnects.
   - Verify the caller rejects with `RECIPIENT_DISCONNECTED` (code 1503).

### v2 -> v1 (v2 caller, v1 handler)

10. **Caller happy path (request fallback)**
    - The caller detects the remote's `clientProtocol` is 0.
    - The caller sends a v1 `RpcRequest` packet (not a data stream) with correct `id`, `method`,
      `payload`, `responseTimeoutMs`, and `version: 1`.
    - Verify no data stream is opened.
    - Simulate the handler sending a `RpcAck` packet, then a `RpcResponse` packet with a
      success payload.
    - Verify the caller resolves with the response payload.

11. **Handler happy path (v1 request)**
    - The handler receives a v1 `RpcRequest` packet with `version: 1`.
    - The handler sends a `RpcAck` packet with the request ID.
    - The handler invokes the registered method handler with `{ requestId, callerIdentity,
      payload, responseTimeout }`.
    - The method handler returns a response string.
    - The handler detects the caller's `clientProtocol` is 0 and sends the response as a v1
      `RpcResponse` packet (not a data stream).

12. **Payload too large**
    - The caller detects the remote's `clientProtocol` is 0.
    - The caller attempts to send a payload exceeding 15 KB.
    - Verify it rejects immediately with `REQUEST_PAYLOAD_TOO_LARGE` (code 1402) without producing
      any packet or data stream.

13. **Response timeout**
    - The caller detects the remote's `clientProtocol` is 0.
    - The caller sends a v1 `RpcRequest` packet with a short response timeout (e.g., 50ms).
    - No `RpcAck` or response arrives.
    - After the timeout elapses, the caller rejects with `RESPONSE_TIMEOUT` (code 1502).

14. **Error response**
    - The caller detects the remote's `clientProtocol` is 0.
    - The caller sends a v1 `RpcRequest` packet.
    - Simulate the handler sending a `RpcAck` packet, then a `RpcResponse` packet with an
      error (e.g., code 101, message "Test error message").
    - Verify the caller rejects with the correct error code and message.

15. **Participant disconnection**
    - The caller detects the remote's `clientProtocol` is 0.
    - The caller sends a v1 `RpcRequest` packet.
    - Before any ack or response arrives, the remote participant disconnects.
    - Verify the caller rejects with `RECIPIENT_DISCONNECTED` (code 1503).

### v1 -> v2 (v1 caller, v2 handler)

16. **Handler happy path (response fallback)**
    - A v1 caller sends a v1 `RpcRequest` packet with `version: 1`.
    - The v2-capable handler receives it and sends a `RpcAck` packet.
    - The handler invokes the registered method handler, which returns a response string.
    - The handler detects the caller's `clientProtocol` is 0 and sends the response as a v1
      `RpcResponse` packet (not a data stream), even though it supports v2.
    - Verify no data stream is opened for the response.

17. **Unhandled error in handler (v1 caller)**
    - A v1 caller sends a v1 `RpcRequest` packet.
    - The handler sends a `RpcAck` packet.
    - The registered method handler throws a non-RpcError exception (e.g., a generic `Error`).
    - The handler sends a `RpcResponse` packet with error code `APPLICATION_ERROR` (1500).

18. **RpcError passthrough (v1 caller)**
    - A v1 caller sends a v1 `RpcRequest` packet.
    - The handler sends a `RpcAck` packet.
    - The registered method handler throws a `RpcError` with a custom code (e.g., 101) and
      message.
    - The handler sends a `RpcResponse` packet preserving the original error code and message.

---

## Benchmarking

Implementing a benchmark is not required, but could be useful for validating correctness and
performance. The below outlines the test criteria used for `client-sdk-cpp` and `client-sdk-js`.

For an exact reference implementation, see https://github.com/livekit/client-sdk-js/commit/da26fa022197326a8f31db5421f175fad2fe4651.

### Approach

The benchmark connects two participants to the same room in a single process:

1. **Setup**: A "caller" and "receiver" join the same room.
2. **Echo handler**: The receiver registers an RPC method (`benchmark-echo`) that returns the
   received payload unchanged.
3. **Payload**: Pre-generate a payload of the desired size. Compute a checksum (e.g., sum of
   character codes) for integrity verification.
4. **Caller loop**: N concurrent workers each loop for a configured duration, calling the
   echo method and verifying the response matches the original payload (length + checksum).
5. **Metrics**: Track success/failure counts, latency percentiles (p50, p95, p99), throughput
   (calls/sec), and error breakdown.

### Suggested parameters

| Parameter | Suggested default | Description |
|-----------|-------------------|-------------|
| Payload size | 15360 bytes | Size of the RPC payload in bytes |
| Duration | 30 seconds | How long the benchmark runs |
| Concurrency | 3 | Number of parallel caller loops |
| Delay between calls | 10ms | Pause between consecutive calls per thread |
