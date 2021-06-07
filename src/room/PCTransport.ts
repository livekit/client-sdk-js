export default class PCTransport {
  pc: RTCPeerConnection;

  pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(config?: RTCConfiguration) {
    this.pc = new RTCPeerConnection(config);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.pc.remoteDescription) {
      return this.pc.addIceCandidate(candidate);
    }
    this.pendingCandidates.push(candidate);
  }

  async setRemoteDescription(sd: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(sd);

    this.pendingCandidates.forEach((candidate) => {
      this.pc.addIceCandidate(candidate);
    });
    this.pendingCandidates = [];
  }

  close() {
    this.pc.close();
  }
}
