export function supportsE2EE() {
  return supportsInsertableStreams() || supportsScriptTransform();
}

export function supportsScriptTransform() {
  // @ts-ignore
  return typeof window.RTCRtpScriptTransform !== 'undefined';
}

export function supportsInsertableStreams() {
  return (
    typeof window.RTCRtpSender !== 'undefined' &&
    // @ts-ignore
    typeof window.RTCRtpSender.prototype.createEncodedStreams !== 'undefined'
  );
}

export function isVideoFrame(
  frame: RTCEncodedAudioFrame | RTCEncodedVideoFrame,
): frame is RTCEncodedVideoFrame {
  return 'type' in frame;
}
