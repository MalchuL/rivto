import { ID } from "./id";

export interface LinkPort {
    blockId: ID;
    port?: string;
}

export interface Link {
    id: ID;                  // unique id of the link
    from: LinkPort;          // source port of the link
    to: LinkPort;            // target port of the link
    meta?: Record<string, any> // meta data of the link
}