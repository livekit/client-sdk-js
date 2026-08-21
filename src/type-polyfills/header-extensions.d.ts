/**
 * Per-transceiver control over which RTP header extensions get negotiated. Declared as optional
 * because it is not in lib.dom yet and not every browser implements it.
 * https://w3c.github.io/webrtc-extensions/#rtcrtptransceiver-interface-extensions
 */
interface RTCRtpTransceiver {
  getHeaderExtensionsToNegotiate?(): RTCRtpHeaderExtensionCapability[];
  setHeaderExtensionsToNegotiate?(extensions: RTCRtpHeaderExtensionCapability[]): void;
}

interface RTCRtpHeaderExtensionCapability {
  direction?: 'sendrecv' | 'sendonly' | 'recvonly' | 'stopped';
}
