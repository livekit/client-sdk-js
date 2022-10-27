import { RoomEvent } from '../../room/events';
import { ConnectionState } from '../../room/Room';
import { Checker } from './Checker';

export class ReconnectCheck extends Checker {
  get description(): string {
    return 'Resuming connection after interruption';
  }

  async perform(): Promise<void> {
    const room = await this.connect();
    let reconnectingTriggered = false;
    let reconnected = false;

    let reconnectResolver: (value: unknown) => void;
    const reconnectTimeout = new Promise((resolve) => {
      setTimeout(resolve, 5000);
      reconnectResolver = resolve;
    });

    room
      .on(RoomEvent.Reconnecting, () => {
        reconnectingTriggered = true;
      })
      .on(RoomEvent.Reconnected, () => {
        reconnected = true;
        reconnectResolver(true);
      });

    room.engine.client.ws?.close();
    const onClose = room.engine.client.onClose;
    if (onClose) {
      onClose('');
    }

    await reconnectTimeout;

    if (!reconnectingTriggered) {
      throw new Error('Did not attempt to reconnect');
    } else if (!reconnected || room.state !== ConnectionState.Connected) {
      this.appendWarning('reconnection is only possible in Redis-based configurations');
      throw new Error('Not able to reconnect');
    }
  }
}
