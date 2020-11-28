import 'webrtc-adapter'
import { SessionDescription, SignalRequest, SignalResponse } from '../proto/rtc'

export interface ConnectionInfo {
  host: string
  port: string
  secure?: boolean
}

/**
 * RTCClient is the signaling layer of WebRTC, it's LiveKit's signaling protocol
 * so that it
 */
export interface RTCClient {
  join(info: ConnectionInfo, roomId: string, token: string): Promise<void>
  offer(offer: RTCSessionDescriptionInit): void
  sendNegotiate(offer: RTCSessionDescriptionInit): void
  sendIceCandidate(candidate: RTCIceCandidateInit): void

  readonly isConnected: boolean

  // callbacks
  // server answered
  onAnswer?: (sd: RTCSessionDescriptionInit) => void
  // handle negotiation, expect both offer and answer
  onNegotiate?: (sd: RTCSessionDescriptionInit) => void
  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit) => void
}

export class RTCClientImpl {
  isConnected: boolean
  onAnswer?: (sd: RTCSessionDescriptionInit) => void
  // handle negotiation, expect both offer and answer
  onNegotiate?: (sd: RTCSessionDescriptionInit) => void
  // when a new ICE candidate is made available
  onTrickle?: (sd: RTCIceCandidateInit) => void

  ws?: WebSocket

  constructor() {
    this.isConnected = false
  }

  join(info: ConnectionInfo, roomId: string, token: string): Promise<void> {
    const protocol = info.secure ? 'wss' : 'ws'
    const url = `${protocol}://${info.host}:${info.port}?room_id=${roomId}&token=${token}`

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.onerror = (ev: Event) => {
        if (!this.ws) {
          // not yet connected, reject
          reject('Could not connect')
          return
        }
        // other errors, handle
        this.onWSError(ev)
      }

      ws.onopen = (ev: Event) => {
        this.ws = ws
        this.isConnected = true
        resolve()
      }

      ws.onmessage = this.onWSMessage
    })
  }

  offer(offer: RTCSessionDescriptionInit) {
    this.sendRequest({
      offer: toProtoSessionDescription(offer),
    })
  }

  sendNegotiate(offer: RTCSessionDescriptionInit) {
    this.sendRequest({
      negotiate: toProtoSessionDescription(offer),
    })
  }

  sendIceCandidate(candidate: RTCIceCandidateInit) {
    this.sendRequest({
      trickle: {
        candidate: candidate.candidate!,
      },
    })
  }

  sendRequest(req: SignalRequest) {
    if (!this.ws) {
      throw 'cannot send signal request before connected'
    }

    const msg = SignalRequest.toJSON(req)
    this.ws.send(JSON.stringify(msg))
  }

  private onWSMessage(ev: MessageEvent) {
    const json = JSON.parse(ev.data)
    const msg = SignalResponse.fromJSON(json)
    if (msg.answer) {
      const sd = fromProtoSessionDescription(msg.answer)
      if (this.onAnswer) {
        this.onAnswer(sd)
      }
    } else if (msg.negotiate) {
      const sd = fromProtoSessionDescription(msg.negotiate)
      if (this.onNegotiate) {
        this.onNegotiate(sd)
      }
    } else if (msg.trickle) {
      const candidate: RTCIceCandidateInit = {
        candidate: msg.trickle.candidate,
      }
      if (this.onTrickle) {
        this.onTrickle(candidate)
      }
    }
  }

  private onWSError(ev: Event) {
    console.error('websocket error', ev)
  }
}

function fromProtoSessionDescription(
  sd: SessionDescription
): RTCSessionDescriptionInit {
  const rsd: RTCSessionDescriptionInit = {
    sdp: sd.sdp,
  }
  switch (sd.type) {
    case 'answer':
    case 'offer':
    case 'pranswer':
    case 'rollback':
      rsd.type = sd.type
  }
  return rsd
}

function toProtoSessionDescription(
  rsd: RTCSessionDescription | RTCSessionDescriptionInit
): SessionDescription {
  const sd: SessionDescription = {
    sdp: rsd.sdp!,
    type: rsd.type!,
  }
  return sd
}
