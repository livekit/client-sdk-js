import { WebSocketCheck } from './checks/websocket';

export class ConnectionHelper {
  token: string;

  url: string;

  private checkResults: Map<number, CheckResult> = new Map();

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  getNextCheckId() {
    const nextId = this.checkResults.size;
    this.checkResults.set(nextId, {});
    return nextId;
  }

  updateCheck(checkId: number, data: CheckResult) {
    this.checkResults.set(checkId, data);
  }
}

type LogMessage = {
  loglevel: 'info' | 'warning' | 'error';
  message: string;
};

enum CheckStatus {
  IDLE,
  RUNNING,
  SKIPPED,
  SUCCESS,
  FAILED,
}

type CheckResult = {
  name?: string;
  logs?: Array<LogMessage>;
  status?: CheckStatus;
};

const helper = new ConnectionHelper('url', 'token');
checkWebRTC(helper).then(checkWebsocket).then(checkWebRTC).then(checkWebsocket);

async function checkWebsocket(h: ConnectionHelper) {
  const logs: LogMessage[] = [{ loglevel: 'info', message: 'websocket test started' }];
  const init: CheckResult = {
    logs,
    name: 'Websocket Check',
    status: CheckStatus.RUNNING,
  };
  const checkId = h.getNextCheckId();
  h.updateCheck(checkId, init);
  const test = new WebSocketCheck(h.url, h.token);
  await test.run();
  return h;
}

async function checkWebRTC(h: ConnectionHelper) {
  return h;
}
