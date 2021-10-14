export enum DeviceKind {
  AudioInput = 'audioinput',
  AudioOutput = 'audiooutput',
  VideoInput = 'videoinput',
}

export default class DeviceManager {
  private static instance?: DeviceManager;

  // kind => deviceId
  defaultDevices: Map<DeviceKind, string> = new Map();

  static getInstance(): DeviceManager {
    if (this.instance === undefined) {
      this.instance = new DeviceManager();
    }
    return this.instance;
  }

  async getDevices(kind: DeviceKind): Promise<MediaDeviceInfo[]> {
    let devices = await navigator.mediaDevices.enumerateDevices();
    devices = devices.filter((device) => device.kind === kind);
    // Chrome returns 'default' devices, we would filter them out, but put the default
    // device at first
    if (devices.length > 0 && devices[0].deviceId === 'default') {
      // find another device with matching group id, and move that to 0
      const defaultDevice = devices[0];
      for (let i = 1; i < devices.length; i += 1) {
        if (devices[i].groupId === defaultDevice.groupId) {
          const temp = devices[0];
          devices[0] = devices[i];
          devices[i] = temp;
          break;
        }
      }
      return devices.filter((device) => device !== defaultDevice);
    }

    return devices;
  }

  setDefaultDevice(kind: DeviceKind, deviceId: string) {
    this.defaultDevices.set(kind, deviceId);
  }

  getDefaultDevice(kind: DeviceKind): string | undefined {
    return this.defaultDevices.get(kind);
  }
}
