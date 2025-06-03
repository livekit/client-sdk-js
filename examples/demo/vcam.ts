class WHIPClient {
  private pc: RTCPeerConnection;
  private candidateListPromise: Promise<RTCIceCandidateInit[]>;
  private log :(...data: any[])=>void
  audioTransceiver?: RTCRtpTransceiver
  constructor(track?: MediaStreamTrack ,verbose?:boolean | undefined) {
    this.log = (...data: any[])=>{}
    if (verbose){
      this.log = console.log
    }
    this.pc = new RTCPeerConnection({
      iceTransportPolicy: "all",
      
    });

    this.pc.onconnectionstatechange = () => {
      this.log("[WHIPClient][WebRTC] connectionState:", this.pc.connectionState);
    };

    this.candidateListPromise = new Promise((resolve) => {
      const candidateList: RTCIceCandidateInit[] = [];

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.log("[WHIPClient][WebRTC] New ICE candidate:", event.candidate);
          candidateList.push({
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid!,
            sdpMLineIndex: event.candidate.sdpMLineIndex!,
          });
        } else {
          resolve(candidateList);
          this.log("[WHIPClient][WebRTC] All ICE candidates have been sent.");
        }
      };
    });

    // for (const t of tracks) {
    // if (track)
    this.audioTransceiver = this.pc.addTransceiver("audio", { direction: "sendonly" });
    // }
  }
  updateAudio(track:MediaStreamTrack){
    this.audioTransceiver?.sender.replaceTrack(track)
  }
  async makeOffer(): Promise<{ offer: string; ice: RTCIceCandidateInit[]}> {
    const offerPromise = new Promise<string>((resolve) => {
      this.pc.createOffer().then((offer) => {
        this.pc.setLocalDescription(offer).then(() => {
          resolve(offer.sdp || "");
        });
      });
    });

    const [offer, ice] = await Promise.all([offerPromise, this.candidateListPromise]);
    return { offer, ice };
  }

  async acceptAnswer({ answer, ice }: { answer: string; ice: RTCIceCandidateInit[] }): Promise<void> {

    const remoteDesc = new RTCSessionDescription({ type: "answer", sdp: answer });
    await this.pc.setRemoteDescription(remoteDesc);

    for (const c of ice) {
      const candidate = new RTCIceCandidate({
        candidate: c.candidate,
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      });

      await this.pc.addIceCandidate(candidate);
    }
  }
  close(){
    this.log("[WHIPClient][WebRTC] connection closed.");

    this.pc.close()
  }
  
}


type IceCandidate = RTCIceCandidateInit;
type OfferData = { offer: string; ice: IceCandidate[] };
type OnTrackCallback = (track: MediaStreamTrack) => void;

class WHIPServer {
  private pc: RTCPeerConnection;
  private candidateListPromise: Promise<IceCandidate[]>;
  private answerPromise: Promise<string>;
  private answerPromiseResolve!: (sdp: string) => void;
  private log :(...data: any[])=>void
  constructor(onTrack?: OnTrackCallback, verbose?:boolean | undefined) {
    this.log = (...data: any[])=>{}
    if (verbose){
      this.log = console.log
    }
   
    this.pc = new RTCPeerConnection({
      iceTransportPolicy: "all",
    });

    this.pc.onconnectionstatechange = () => {
      this.log("[WHIPServer][WebRTC] connectionState:", this.pc.connectionState);
    };

    this.pc.ontrack = (e) => {
      this.log("track received");
      if (onTrack) onTrack(e.track);
    };

    this.candidateListPromise = new Promise((resolve) => {
      const candidateList: IceCandidate[] = [];

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.log("[WHIPServer][WebRTC] New ICE candidate:", event.candidate);
          candidateList.push({
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid!,
            sdpMLineIndex: event.candidate.sdpMLineIndex!,
          });
        } else {
          resolve(candidateList);
          this.log("[WHIPServer][WebRTC] All ICE candidates have been sent.");
        }
      };
    });

    this.answerPromise = new Promise((resolve) => {
      this.answerPromiseResolve = resolve;
    });
  }

  async makeAnswer({ offer, ice }: OfferData): Promise<{ answer: string; ice: IceCandidate[] }> {

    const remoteDesc = new RTCSessionDescription({ type: "offer", sdp: offer });
    await this.pc.setRemoteDescription(remoteDesc);

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.answerPromiseResolve(answer.sdp || "");

    for (const c of ice) {
      const candidate = new RTCIceCandidate({
        candidate: c.candidate,
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      });

      await this.pc.addIceCandidate(candidate);
    }

    const [finalAnswer, gatheredIce] = await Promise.all([
      this.answerPromise,
      this.candidateListPromise,
    ]);

    return { answer: finalAnswer, ice: gatheredIce };
  }
  close(){
    this.pc.close()
  }
}

export class VCamConnection{
  private whipServer?:WHIPServer
  private whipClient?:WHIPClient
  private messageListener: (e: MessageEvent) => void = ()=>{};
  private log :(...data: any[])=>void
  private audioContext :AudioContext | void
  
  constructor(audioContext:AudioContext | void,verbose?:boolean | undefined) {
    this.log = (...data: any[])=>{}
    if (verbose){
      this.log = console.log
    }
    this.audioContext = audioContext
  }

  getVCamMedia(iframe:HTMLIFrameElement){
    return new Promise((resolve: (value: MediaStreamTrack | PromiseLike<MediaStreamTrack>) => void, reject: (reason?: any) => void)=>{
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const whipServer = new WHIPServer(track=>{
        this.log("[App] ontrack",track)
        resolve(track)
      })
      this.whipServer = whipServer
      this.audioContext

      const whipClient = new WHIPClient()
      this.whipClient = whipClient

      const messageListener = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.id!==uniqueId) return;

        if (msg.answer && msg.type === "SRC_MEDIA") {
          whipClient.acceptAnswer(msg);
        } else if (msg.offer && msg.type === "VCAM_MEDIA") {
          whipServer.makeAnswer(msg).then(answer => {
            iframe?.contentWindow?.postMessage({type:msg.type,id:uniqueId,...answer}, "*");
          });
        }
      };
      
      this.messageListener = messageListener
      window.addEventListener("message", messageListener);
      whipClient.makeOffer().then(offer=>{
        iframe?.contentWindow?.postMessage({type:"SRC_MEDIA",id:uniqueId,...offer},"*")
      })
    })
  }
  addAudioTrack(track:MediaStreamTrack){
    this.whipClient?.updateAudio(track)
  }
  close(){
    this.whipClient?.close()
    this.whipServer?.close()
    this.whipClient = undefined
    this.whipServer = undefined
    window.removeEventListener("message", this.messageListener);
  }
}

// Each audio track goes through delay node.
// Virtual camera needs audio delay for lipsync.
// Delay time is set to 0 when virtual camera is unused.
// When virtual camera, delay time must be set as specified in camera-options.json.

export class AudioDelayManager{
  delayedNodes:{[key:string]:DelayNode} = {}
  getAudioContextFn:(()=>AudioContext | void)
  constructor(getAudioContextFn:(()=>AudioContext | void)){
    this.getAudioContextFn = getAudioContextFn
  }
  addAudioTrack(audioTrack:MediaStreamTrack){

    const audioContext = this.getAudioContextFn() as AudioContext;
    const stopFn = audioTrack.stop.bind(audioTrack);
    const originalStream = new MediaStream([audioTrack])
    const delayNode = audioContext.createDelay(1);
    delayNode.delayTime.value = 0;
    const micSrc = audioContext.createMediaStreamSource(originalStream);
    micSrc.connect(delayNode);
    const audioStreamSource = audioContext.createMediaStreamDestination();
    delayNode.connect(audioStreamSource);
    const audioStreamDelayed = audioStreamSource.stream;
  
    const delayedTrack = audioStreamDelayed.getAudioTracks()[0]

    this.delayedNodes[audioTrack.id] = delayNode
    const self = this
    function stop(){

      audioTrack.stop()
     
      micSrc.disconnect()
      delayNode.disconnect()
      delete self.delayedNodes[audioTrack.id]
    }
    delayedTrack.stop = ()=>{
      stop()
      stopFn()

    }
    return delayedTrack
  }
  setDelay(delay:number){
    for (const node of Object.values(this.delayedNodes)){
      node.delayTime.value = delay;
    }
  }

}