import { Link, LinkPort, ID } from "../types";
import { CRDTMap } from "@/store/crdt-doc";
import { CRDTProxyProps, SetParams } from "./types";
import { LinkPortProxy } from "./link-port";
import { AbstractCRDTProxy } from "./utils";
import { assignRecordToCRDTMap, createRecordProxy } from "./record-proxy";


/**
 * A proxy for the Link type. (Uses internal CRDT map to store the link data.)
 */
export class LinkProxy extends AbstractCRDTProxy implements Link, SetParams<Link> {
    /**
     * Gets the id of the link.
     * @returns The id of the link.
     */
    get id(): ID {
        const id = this.model.get('id');
        if (id === undefined) {
            throw new Error('Id is not set');
        }
        return id as ID;
    }

    /**
     * Sets the id of the link. (Uses internal CRDT map to store the id.)
     * @param id - The id of the link.
     */
    set id(id: ID) {
        this.model.set('id', id);
    }

    /**
     * Gets the from port of the link.
     * @returns The from port of the link.
     */
    get from(): LinkPort {
        const from = this.model.get('from');
        if (from === undefined) {
            throw new Error('From is not set');
        }
        return LinkPortProxy.getProxy({ model: from as CRDTMap, instantiator: this.instantiator });
    }

    /**
     * Sets the from port of the link. (Uses internal CRDT map to store the from port.)
     * @param from - The from port of the link.
     */
    set from(from: LinkPort) {
        const fromModel = this.instantiator.createMap();
        LinkPortProxy.createAssign({ model: fromModel, instantiator: this.instantiator }, from);
        this.model.set('from', fromModel);
    }

    /**
     * Gets the to port of the link.
     * @returns The to port of the link.
     */
    get to(): LinkPort {
        const to = this.model.get('to');
        if (to === undefined) {
            throw new Error('To is not set');
        }
        return LinkPortProxy.getProxy({ model: to as CRDTMap, instantiator: this.instantiator });
    }

    /**
     * Sets the to port of the link. (Uses internal CRDT map to store the to port.)
     * @param to - The to port of the link.
     */
    set to(to: LinkPort) {
        const toModel = this.instantiator.createMap();
        LinkPortProxy.createAssign({ model: toModel, instantiator: this.instantiator }, to);
        this.model.set('to', toModel);
    }

    /**
     * Gets the meta data of the link.
     * @returns The meta data of the link.
     */
    get meta(): Record<string, any> | undefined {
        const meta = this.model.get('meta');
        if (meta === undefined) {
            return undefined;
        }
        return createRecordProxy(meta as CRDTMap, this.instantiator);
    }

    /**
     * Sets the meta data of the link. (Uses internal CRDT map to store the meta data.)
     * @param meta - The meta data of the link.
     */
    set meta(meta: Record<string, any> | undefined) {
        if (meta === undefined) {
            this.model.delete('meta');
            return;
        }
        const metaModel = this.instantiator.createMap();
        assignRecordToCRDTMap(metaModel, this.instantiator, meta);
        this.model.set('meta', metaModel);
    }

    /**
     * Sets the parameters of the link.
     * @param params - The parameters of the link.
     */
    setParams(params: Link): void {
        this.id = params.id;
        this.from = params.from;
        this.to = params.to;
        if (params.meta) {
            this.meta = params.meta;
        }
    }

    /**
     * Gets the proxy for the link.
     * @param model - The model to get the proxy for.
     * @param instantiator - The instantiator to get the proxy for.
     * @returns The proxy for the link.
     */
    static getProxy({ model, instantiator }: CRDTProxyProps): LinkProxy {
        const link = new LinkProxy();
        link.assignProxy({model, instantiator});
        return link;
    }

    /**
     * Creates a new link and assigns the parameters to it.
     * @param model - The model to create the link in.
     * @param instantiator - The instantiator to create the link with.
     * @param initParams - The parameters to assign to the link.
     * @returns The new link.
     */
    static createAssign({ model, instantiator }: CRDTProxyProps, initParams: Link): LinkProxy {
        const link = this.getProxy({model, instantiator});
        link.setParams(initParams);
        return link;
    }
}