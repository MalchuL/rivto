/** Registers runtime network services in Cordis and binds their cleanup to its scope. */
import type { Context } from "@deepseek-ai/cordis";
import { HttpService } from "./http/service.ts";
import { NodeWebSocketService } from "./websocket/node.ts";

/** Provides transport factories independently of persistence and application protocols. */
export class NetworkServicesPlugin {
  readonly name = "network-services";
  /**
   * @param ctx - Owning runtime scope.
   * @returns No value after registering services and cleanup.
   */
  apply(ctx: Context): void {
    const http = new HttpService();
    const sockets = new NodeWebSocketService();
    ctx.effect(() => () => {
      http.dispose();
      sockets.dispose();
    });
    ctx.provide("http", http);
    ctx.provide("sockets", sockets);
  }
}
