import type { LocalTrackPublication, RemoteTrackPublication, TextStreamReader } from '..';
import Room from '../room/Room';
import type { AgentState } from '../room/attribute-typings';
import type RemoteParticipant from '../room/participant/RemoteParticipant';
import type { RpcInvocationData } from '../room/rpc';
import type { TextStreamInfo } from '../room/types';

export interface IAgentClientSession {
  // Connection
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  onConnectionStateChange?: (callback: (state: AgentConnectionState) => void) => void;

  // Agent <-> Client Communication
  sendMessage: (message: string) => Promise<TextStreamInfo>;
  onMessage?: (callback: (reader: TextStreamReader) => void) => void | undefined;
  registerRpcHandler: (
    method: string,
    handler: (data: RpcInvocationData) => Promise<string>,
  ) => void;
  performRpc: (method: string, payload: string) => Promise<string>;

  // Client Media Control
  setCameraEnabled: (enabled: boolean) => Promise<LocalTrackPublication | undefined>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<LocalTrackPublication | undefined>;
  setScreenShareEnabled: (enabled: boolean) => Promise<LocalTrackPublication | undefined>;

  setCameraInput: (deviceId: string) => Promise<boolean>;
  setMicrophoneInput: (deviceId: string) => Promise<boolean>;

  // Media Playback
  startAudioPlayback: () => Promise<void>;

  // Agent Participant
  agent: IAgent;

  subtle: { readonly room: Room }; // underlying constructs are available on the `subtle` property to indicate advanced usage
}

export interface IAgent {
  state: AgentState;
  audio: RemoteTrackPublication | undefined;
  video: RemoteTrackPublication | undefined;
  subtle: { readonly participant: RemoteParticipant };
}

export enum AgentConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  INTERACTIVE = 'interactive',
}

export class AgentClientSession implements IAgentClientSession {
  private readonly token: string;

  private readonly url: string;

  private readonly room: Room;

  constructor({ token, url }: { token: string; url: string }) {
    this.token = token;
    this.url = url;
    this.room = new Room();

    this.room.prepareConnection(this.url, this.token);
  }

  async connect() {
    await this.room.connect(this.url, this.token);
    await this.waitForAgentReady();

    this.room.registerTextStreamHandler('lk.chat', (message) => {
      this.onMessage?.(message);
    });
  }

  onConnectionStateChange(callback: (state: AgentConnectionState) => void) {
    throw new Error('Not implemented');
  }

  async disconnect() {
    await this.room.disconnect();
  }

  async sendMessage(message: string) {
    return this.room.localParticipant.sendText(message, { topic: 'lk.chat' });
  }

  async setCameraEnabled(enabled: boolean) {
    return this.room.localParticipant.setCameraEnabled(enabled);
  }

  async setMicrophoneEnabled(enabled: boolean) {
    return this.room.localParticipant.setMicrophoneEnabled(enabled, undefined, {
      preConnectBuffer: true,
    });
  }

  async setScreenShareEnabled(enabled: boolean) {
    return this.room.localParticipant.setScreenShareEnabled(enabled);
  }

  async setCameraInput(deviceId: string) {
    return this.room.switchActiveDevice('videoinput', deviceId);
  }

  async setMicrophoneInput(deviceId: string) {
    return this.room.switchActiveDevice('audioinput', deviceId);
  }

  registerRpcHandler(method: string, handler: (data: RpcInvocationData) => Promise<string>) {
    this.room.registerRpcMethod(method, handler);
  }

  async performRpc(method: string, payload: string) {
    return this.room.localParticipant.performRpc({
      method,
      payload,
      destinationIdentity: this.room.localParticipant.identity,
    });
  }

  async startAudioPlayback() {
    await this.room.startAudio();
    // TODO attach remote audio track to audio element
  }

  get subtle() {
    return {
      room: this.room,
    };
  }
}
