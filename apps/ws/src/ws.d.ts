declare module "ws" {
  import type { EventEmitter } from "node:events";
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  export interface WebSocketServerOptions {
    noServer?: boolean;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServerOptions);
    on(event: "connection", listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (client: WebSocket) => void,
    ): void;
    emit(event: "connection", socket: WebSocket, request: IncomingMessage): boolean;
  }
}
