import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import Room, { ConnectionState } from '../../Room';
import type RTCEngine from '../../RTCEngine';

type LogMessage = {
  level: 'info' | 'warning' | 'error';
  message: string;
};

export enum CheckStatus {
  IDLE,
  RUNNING,
  SKIPPED,
  SUCCESS,
  FAILED,
}

export type CheckInfo = {
  name?: string;
  logs?: Array<LogMessage>;
  status?: CheckStatus;
};

export interface CheckerOptions {
  errorsAsWarnings?: boolean;
}

export class Checker extends (EventEmitter as new () => TypedEmitter<CheckerCallbacks>) {
  protected url: string;

  protected token: string;

  room?: Room;

  status: CheckStatus = CheckStatus.IDLE;

  logs: Array<LogMessage> = [];

  errorsAsWarnings: boolean = false;

  name: string;

  constructor(url: string, token: string, options: CheckerOptions = {}) {
    super();
    this.url = url;
    this.token = token;
    this.name = this.constructor.name;
    console.log('test name', this.name);
    if (options.errorsAsWarnings) {
      this.errorsAsWarnings = options.errorsAsWarnings;
    }
  }

  protected async perform() {
    // do nothing here
  }

  async run(onComplete?: () => void) {
    if (this.status !== CheckStatus.IDLE) {
      return;
    }
    this.setStatus(CheckStatus.RUNNING);

    try {
      this.perform();
    } catch (err) {
      if (err instanceof Error) {
        if (this.errorsAsWarnings) {
          this.appendWarning(err.message);
        } else {
          this.appendError(err.message);
        }
      }
    }

    await this.disconnect();

    // sleep for a bit to ensure disconnect
    await new Promise((resolve) => setTimeout(resolve, 500));

    // @ts-ignore
    if (this.status !== CheckStatus.SKIPPED) {
      this.setStatus(this.isSuccess() ? CheckStatus.SUCCESS : CheckStatus.FAILED);
    }

    if (onComplete) {
      onComplete();
    }
  }

  protected isSuccess(): boolean {
    return !this.logs.some((l) => l.level === 'error');
  }

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
    this.setStatus(CheckStatus.SKIPPED);
  }

  protected appendMessage(message: string) {
    this.logs.push({ level: 'info', message });
    this.emit('update', this.getInfo());
  }

  protected appendWarning(message: string) {
    this.logs.push({ level: 'warning', message });
    this.emit('update', this.getInfo());
  }

  protected appendError(message: string) {
    this.logs.push({ level: 'error', message });
    this.emit('update', this.getInfo());
  }

  protected setStatus(status: CheckStatus) {
    this.status = status;
    this.emit('update', this.getInfo());
  }

  protected get engine(): RTCEngine | undefined {
    return this.room?.engine;
  }

  getInfo(): CheckInfo {
    return {
      logs: this.logs,
      name: this.name,
      status: this.status,
    };
  }
}

type CheckerCallbacks = {
  update: (info: CheckInfo) => void;
};
