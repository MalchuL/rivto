import { CRDTMap, Instantiator } from "@/store/crdt-doc";
import { BlockCore, Coord, Size } from "../types/block-core";
import { ID } from "../types/id";
import { CRDTProxyProps, PartialSetParams, SetParams } from "./types";
import { CoordProxy } from "./coord";
import { SizeProxy } from "./size";
import { AbstractCRDTProxy } from "./utils";
import { assignRecordToCRDTMap, createRecordProxy } from "./record-proxy";


const DEFAULT_ORDER = 0;
const DEFAULT_POSITION = (): Coord => ({ x: 0, y: 0 });
const DEFAULT_SIZE = (): Size => ({ width: 100, height: 100 });
const DEFAULT_Z_INDEX = 0;
const DEFAULT_CONNECTED_WITH = null;

/**
 * A proxy for the BlockCore type. (Uses internal CRDT map to store the block core data.)
 */
export class BlockCoreProxy extends AbstractCRDTProxy implements BlockCore, SetParams<BlockCore>, PartialSetParams<BlockCore> {


    /**
     * Gets the id of the block.
     * @returns The id of the block.
     */
    get id(): ID {
        const id = this.model.get('id');
        if (id === undefined) {
            throw new Error('Id is not set');
        }
        return id as ID;
    }
    /**
     * Sets the id of the block. (Uses internal CRDT map to store the id.)
     * @param id - The id of the block.
     */
    set id(id: ID) {
        this.model.set('id', id);
    }

    /**
     * Gets the type of the block.
     * @returns The type of the block.
     */
    get type(): string {
        const type = this.model.get('type');
        if (type === undefined) {
            throw new Error('Type is not set');
        }
        return type as string;
    }
    /**
     * Sets the type of the block. (Uses internal CRDT map to store the type.)
     * @param type - The type of the block.
     */
    set type(type: string) {
        this.model.set('type', type);
    }

    /**
     * Gets the order of the block.
     * @returns The order of the block.
     */
    get order(): number | undefined {
        return this.model.get('order') as number | undefined;
    }
    /**
     * Sets the order of the block. (Uses internal CRDT map to store the order.)
     * @param order - The order of the block.
     */
    set order(order: number | undefined) {
        if (order === undefined) {
            this.model.delete('order');
            return;
        }
        this.model.set('order', order);
    }

    /**
     * Gets the position of the block.
     * @returns The position of the block.
     */
    get position(): Coord | undefined {
        const position = this.model.get('position');
        if (position === undefined) {
            return undefined;
        }
        return CoordProxy.getProxy({ model: position as CRDTMap, instantiator: this.instantiator });
    }
    /**
     * Sets the position of the block. (Uses internal CRDT map to store the position.)
     * @param position - The position of the block.
     */
    set position(position: Coord | undefined) {
        if (position === undefined) {
            this.model.delete('position');
            return;
        }
        const positionModel = this.instantiator.createMap();
        CoordProxy.createAssign({ model: positionModel, instantiator: this.instantiator }, position);
        this.model.set('position', positionModel);
    }

    /**
     * Gets the size of the block.
     * @returns The size of the block.
     */
    get size(): Size | undefined {
        const size = this.model.get('size');
        if (size === undefined) {
            return undefined;
        }
        return SizeProxy.getProxy({ model: size as CRDTMap, instantiator: this.instantiator });
    }

    /**
     * Sets the size of the block. (Uses internal CRDT map to store the size.)
     * @param size - The size of the block.
     */
    set size(size: Size | undefined) {
        if (size === undefined) {
            this.model.delete('size');
            return;
        }
        const sizeModel = this.instantiator.createMap();
        SizeProxy.createAssign({ model: sizeModel, instantiator: this.instantiator }, size);
        this.model.set('size', sizeModel);
    }

    /**
     * Gets the z-index of the block.
     * @returns The z-index of the block.
     */
    get zIndex(): number | undefined {
        return this.model.get('zIndex') as number;
    }

    /**
     * Sets the z-index of the block. (Uses internal CRDT map to store the z-index.)
     * @param zIndex - The z-index of the block.
     */
    set zIndex(zIndex: number | undefined) {
        if (zIndex === undefined) {
            this.model.delete('zIndex');
            return;
        }
        this.model.set('zIndex', zIndex);
    }

    /**
     * Gets the connected with of the block.
     * @returns The connected with of the block.
     */
    get connectedWith(): ID | null {
        const connectedWith = this.model.get('connectedWith');
        if (connectedWith === undefined) {
            throw new Error('Connected with is not set');
        }
        return connectedWith as ID | null;
    }

    /**
     * Sets the connected with of the block. (Uses internal CRDT map to store the connected with.)
     * @param connectedWith - The connected with of the block.
     */
    set connectedWith(connectedWith: ID | null) {
        this.model.set('connectedWith', connectedWith);
    }

    /**
     * Gets the plugin states of the block.
     * @returns The plugin states of the block.
     */
    get pluginStates(): Record<string, any> {
        let pluginStates = this.model.get('pluginStates');
        if (pluginStates === undefined) {
            // Ensure there's always a backing CRDT map for pluginStates.
            // NOTE: this map may be detached initially; that's OK (it will attach when the block attaches).
            const pluginStatesModel = this.instantiator.createMap();
            this.model.set('pluginStates', pluginStatesModel);
            pluginStates = pluginStatesModel;
        }
        
        return createRecordProxy(pluginStates as CRDTMap, this.instantiator);
    }

    /**
     * Sets the plugin states of the block. (Uses internal CRDT map to store the plugin states.)
     * @param pluginStates - The plugin states of the block.
     */
    set pluginStates(pluginStates: Record<string, any> | undefined) {
        if (pluginStates === undefined) {
            this.model.delete('pluginStates');
            return;
        }
        const pluginStatesModel = this.instantiator.createMap();
        assignRecordToCRDTMap(pluginStatesModel, this.instantiator, pluginStates);
        this.model.set('pluginStates', pluginStatesModel);
    }

    /**
     * Gets the meta data of the block.
     * @returns The meta data of the block.
     */
    get meta(): Record<string, any> | undefined {
        const meta = this.model.get('meta');
        if (meta === undefined) {
            return undefined;
        }
        return createRecordProxy(meta as CRDTMap, this.instantiator);
    }

    /**
     * Sets the meta data of the block. (Uses internal CRDT map to store the meta data.)
     * @param meta - The meta data of the block.
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
     * Sets the parameters of the block.
     * @param params - The parameters of the block.
     */
    setParams(params: BlockCore): void {
        this.id = params.id;
        this.type = params.type;
        this.order = params.order ?? DEFAULT_ORDER;
        this.position = params.position ?? DEFAULT_POSITION();
        this.size = params.size ?? DEFAULT_SIZE();
        this.zIndex = params.zIndex ?? DEFAULT_Z_INDEX;
        this.connectedWith = params.connectedWith ?? DEFAULT_CONNECTED_WITH;

        if (params.meta) {
            this.meta = params.meta;
        }
        if (params.pluginStates !== undefined) {
            this.pluginStates = params.pluginStates;
        }
    }
    /**
     * Gets the proxy for the block.
     * @param model - The model to get the proxy for.
     * @param instantiator - The instantiator to get the proxy for.
     * @returns The proxy for the block.
     */
    static getProxy({ model, instantiator }: CRDTProxyProps): BlockCoreProxy {
        const block = new BlockCoreProxy();
        block.assignProxy({model, instantiator});
        return block;
    }

    /**
     * Creates a new block and assigns the parameters to it.
     * @param model - The model to create the block in.
     * @param instantiator - The instantiator to create the block with.
     * @param initParams - The parameters to assign to the block.
     * @returns The new block.
     */
    static createAssign({model, instantiator}: CRDTProxyProps, initParams: BlockCore): BlockCoreProxy {
        const block = this.getProxy({model, instantiator});
        block.setParams(initParams);
        return block;
    }
}