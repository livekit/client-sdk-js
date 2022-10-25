import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import Room, { ConnectionState } from '../../Room';
import type RTCEngine from '../../RTCEngine';

export enum CheckerStatus {
  Waiting,
  Started,
  Finished,
  Skipped,
}

export interface CheckerOptions {
  errorsAsWarnings?: boolean;
}

export abstract class Checker extends (EventEmitter as new () => TypedEmitter<CheckerCallbacks>) {
  protected url: string;

  protected token: string;

  room?: Room;

  status: CheckerStatus = CheckerStatus.Waiting;

  messages: string[] = [];

  warnings: string[] = [];

  errors: string[] = [];

  errorsAsWarnings: boolean = false;

  sharedData: any;

  constructor(url: string, token: string, sharedData: any = {}, options: CheckerOptions = {}) {
    super();
    this.url = url;
    this.token = token;
    this.sharedData = sharedData;

    if (options.errorsAsWarnings) {
      this.errorsAsWarnings = options.errorsAsWarnings;
    }
  }

  run(onComplete?: () => void) {
    if (this.status !== CheckerStatus.Waiting) {
      return;
    }
    this.setStatus(CheckerStatus.Started);

    this.perform()
      .catch((err) => {
        if (this.errorsAsWarnings) {
          this.appendWarning(err.message);
        } else {
          this.appendError(err.message);
        }
      })
      .finally(async () => {
        await this.disconnect();

        // sleep for a bit to ensure disconnect
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (this.status !== CheckerStatus.Skipped) {
          this.setStatus(CheckerStatus.Finished);
        }

        if (onComplete) {
          onComplete();
        }
      });
  }

  isSuccess(): boolean {
    return this.errors.length === 0;
  }

  abstract get description(): string;
  protected abstract perform(): Promise<void>;

  protected async connect(): Promise<Room> {
    if (this.room) {
      return this.room;
    }
    this.room = new Room();
    await this.room.connect(this.url, this.token);
    return this.room!;
  }

  protected async disconnect() {
    if (this.room && this.room.state !== ConnectionState.Disconnected) {
      await this.room.disconnect();
      // wait for it to go through
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  protected skip() {
    this.setStatus(CheckerStatus.Skipped);
  }

  protected appendMessage(msg: string) {
    this.messages.push(msg);
    this.emit('update');
  }

  protected appendWarning(msg: string) {
    this.warnings.push(msg);
    this.emit('update');
  }

  protected appendError(msg: string) {
    this.errors.push(msg);
    this.emit('update');
  }

  protected setStatus(status: CheckerStatus) {
    this.status = status;
    this.emit('update');
  }

  protected get engine(): RTCEngine | undefined {
    return this.room?.engine;
  }
}

type CheckerCallbacks = {
  update: () => void;
};
