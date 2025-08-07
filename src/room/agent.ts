import type { AgentState } from './attribute-typings';
import RemoteParticipant from './participant/RemoteParticipant';

export interface Agent extends RemoteParticipant {
  interrupt(): Promise<void>;
  sendContext(context: string): Promise<void>;
}

export interface AgentSession {
  // connection
  connect(): Promise<Agent>;
  disconnect(): Promise<void>;

  // agent controls
  interrupt(): Promise<void>;
  sendContext(context: string): Promise<void>;
  agent?: Agent;

  // local user controls
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;

  // messaging
  sendMessage(message: Message): Promise<void>;
  messages: Message[];
}
