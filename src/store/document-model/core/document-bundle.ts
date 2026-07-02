import { DocumentBundle } from "../types/document-bundle";
import { Link } from "../types/link";
import { BlockCore } from "../types/block-core";

type DocumentBundleProps = {
    version?: number;
    meta?: Record<string, any>;
    blocks?: Array<BlockCore>;
    links?: Array<Link>;
    plugins?: Record<string, any>;
}
// TODO: implement this
export class DocumentBundleImpl implements DocumentBundle {
    version: number;
    meta: Record<string, any>;
    blocks: Array<any>; // serialized block payloads
    links: Array<any>;
    plugins: Record<string, any>; // plugin-level saved data

    constructor({version, meta, blocks, links, plugins}: DocumentBundleProps) {
        this.version = version ?? 1;
        this.meta = meta ?? {};
        this.blocks = blocks ?? [];
        this.links = links ?? [];
        this.plugins = plugins ?? {};
    }
}