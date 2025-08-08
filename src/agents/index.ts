import { Signal } from 'signal-polyfill';
import type { RemoteTrackPublication } from '..';
import Room from '../room/Room';
import type { RpcInvocationData } from '../room/rpc';
import type LocalAudioTrack from '../room/track/LocalAudioTrack';
import type RemoteAudioTrack from '../room/track/RemoteAudioTrack';

export interface IAgentClientSession {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  sendMessage: (message: string) => Promise<void>;
  registerRpcHandler: (
    method: string,
    handler: (data: RpcInvocationData) => Promise<string>,
  ) => void;
  performRpc: (method: string, params: Record<string, unknown>) => Promise<void>;

  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;

  setCameraInput: (deviceId: string) => Promise<void>;
  setMicrophoneInput: (deviceId: string) => Promise<void>;

  onConnectionStateChange: (callback: (state: AgentConnectionState) => void) => void;
  onMessage: (callback: (message: string) => void) => void;

  startAudioPlayback: () => Promise<void>;

  subtle: { readonly room: Room };
}

export interface IAgent {
  state: Signal.Computed<'idle' | 'listening' | 'speaking' | 'reasoning'>;
  audio: Signal.Computed;
  video: Signal.Computed;
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
  }

  async disconnect() {
    await this.room.disconnect();
  }

  async sendMessage(message: string) {
    await this.room.localParticipant.sendText(message, { topic: 'lk.chat' });
  }

  async setCameraEnabled(enabled: boolean) {
    await this.room.localParticipant.setCameraEnabled(enabled);
  }

  async setMicrophoneEnabled(enabled: boolean) {
    await this.room.localParticipant.setMicrophoneEnabled(enabled, undefined, {
      preConnectBuffer: true,
    });
  }

  async setScreenShareEnabled(enabled: boolean) {
    await this.room.localParticipant.setScreenShareEnabled(enabled);
  }

  async setCameraInput(deviceId: string) {
    await this.room.switchActiveDevice('videoinput', deviceId);
  }

  async setMicrophoneInput(deviceId: string) {
    await this.room.switchActiveDevice('audioinput', deviceId);
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

  get subtle() {
    return {
      room: this.room,
    };
  }
}
