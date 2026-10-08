import { ChatMessage as ChatMessageModel, DataPacket, protoInt64 } from '@livekit/protocol';
import type { CoreRoom } from '../CoreRoom';
import { DataChannelKind } from '../data-channel/types';
import { ParticipantEvent, RoomEvent } from '../events';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../extensions';
import type { ChatMessage, SendTextOptions } from '../types';
import { extractChatMessage } from '../utils';

/** Methods the legacy `chat` extension adds to the local participant. */
export interface ChatLocalApi {
  /** @deprecated Consider migrating to {@link sendText} */
  sendChatMessage(text: string, options?: SendTextOptions): Promise<ChatMessage>;

  /** @deprecated Consider migrating to {@link sendText} */
  editChatMessage(editText: string, originalMessage: ChatMessage): Promise<ChatMessage>;
}

/**
 * The legacy chat message packets (`sendChatMessage`, `RoomEvent.ChatMessage`). Superseded by
 * text streams; the full `Room` keeps it, the core entry does not offer it.
 */
export const chat = {
  key: Symbol('chat'),
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<{}, ChatLocalApi> {
    const participant = room.localParticipant;

    ctx.onDataPacket('chatMessage', (chatMessage, _packet, _encryptionType, sender) => {
      room.emit(RoomEvent.ChatMessage, extractChatMessage(chatMessage), sender);
    });
    participant.on(ParticipantEvent.ChatMessage, (msg) => {
      room.emit(RoomEvent.ChatMessage, msg, participant);
    });

    const send = async (msg: ChatMessage) => {
      const packet = new DataPacket({
        value: {
          case: 'chatMessage',
          value: new ChatMessageModel({
            ...msg,
            timestamp: protoInt64.parse(msg.timestamp),
            editTimestamp:
              msg.editTimestamp !== undefined ? protoInt64.parse(msg.editTimestamp) : undefined,
          }),
        },
      });
      await room.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
      participant.emit(ParticipantEvent.ChatMessage, msg);
      return msg;
    };

    return {
      local: {
        sendChatMessage: (text, options) =>
          send({
            id: crypto.randomUUID(),
            message: text,
            timestamp: Date.now(),
            attachedFiles: options?.attachments,
          }),
        editChatMessage: (editText, originalMessage) =>
          send({ ...originalMessage, message: editText, editTimestamp: Date.now() }),
      },
    };
  },
} satisfies RoomExtension<{}, ChatLocalApi>;
