import { Checker } from './Checker';

export class WebRTCCheck extends Checker {
  get description(): string {
    return 'Establishing WebRTC connection';
  }

  protected async perform(): Promise<void> {
    try {
      console.log('initiating room connection');
      this.room = await this.connect();
      console.log('now the room is connected');
    } catch (err) {
      this.appendWarning('ports need to be open on firewall in order to connect.');
      throw err;
    }
  }
}
