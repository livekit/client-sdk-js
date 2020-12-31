import axios, { AxiosInstance } from "axios";

// twirp RPC adapter for client implementation

const defaultPrefix = "/twirp";

/**
 * JSON based Twirp V7 RPC
 */
export class TwirpRpc {
  host: string;
  pkg: string;
  prefix: string;
  instance: AxiosInstance;

  constructor(host: string, pkg: string, prefix?: string) {
    this.host = host;
    this.pkg = pkg;
    this.prefix = prefix || defaultPrefix;
    this.instance = axios.create({
      baseURL: host,
    });
  }

  request(service: string, method: string, data: any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const path = `${this.prefix}/${this.pkg}.${service}/${method}`;
      this.instance
        .post(path, data)
        .then((res) => {
          resolve(res.data);
        })
        .catch(reject);
    });
  }
}
