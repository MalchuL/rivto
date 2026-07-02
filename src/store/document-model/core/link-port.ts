import { ID, LinkPort } from "../types";
import { CRDTProxyProps, SetParams } from "./types";
import { AbstractCRDTProxy } from "./utils";

/**
 * A proxy for the LinkPort type. (Uses internal CRDT map to store the link port data.)
 */
export class LinkPortProxy extends AbstractCRDTProxy implements LinkPort, SetParams<LinkPort> {
    /**
     * Gets the block id.
     * @returns The block id.
     */
    get blockId(): ID {
        const blockId = this.model.get('blockId');
        if (blockId === undefined) {
            throw new Error('Block id is not set');
        }
        return blockId as ID;
    }

    /**
     * Sets the block id. (Uses internal CRDT map to store the block id.)
     * @param blockId - The block id.
     */
    set blockId(blockId: ID) {
        this.model.set('blockId', blockId);
    }

    /**
     * Gets the port.
     * @returns The port.
     */
    get port(): string | undefined {
        return this.model.get('port') as string | undefined;
    }

    /**
     * Sets the port. (Uses internal CRDT map to store the port.)
     * @param port - The port.
     */
    set port(port: string | undefined) {
        this.model.set('port', port ?? null);
    }

    /**
     * Sets the parameters of the link port.
     * @param params - The parameters of the link port.
     */
    setParams(params: LinkPort): void {
        this.blockId = params.blockId;
        this.port = params.port;
    }

    /**
     * Gets the proxy for the link port.
     * @param model - The model to get the proxy for.
     * @param instantiator - The instantiator to get the proxy for.
     * @returns The proxy for the link port.
     */
    static getProxy({ model, instantiator }: CRDTProxyProps): LinkPortProxy {
        const linkPort = new LinkPortProxy();
        linkPort.assignProxy({model, instantiator});
        return linkPort;
    }

    /**
     * Creates a new link port and assigns the parameters to it.
     * @param model - The model to create the link port in.
     * @param instantiator - The instantiator to create the link port with.
     * @param initParams - The parameters to assign to the link port.
     * @returns The new link port.
     */
    static createAssign({ model, instantiator }: CRDTProxyProps, initParams: LinkPort): LinkPortProxy {
        const linkPort = this.getProxy({model, instantiator});
        linkPort.setParams(initParams);
        return linkPort;
    }
}