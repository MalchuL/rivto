import { CRDTMap, Instantiator } from "@/store/crdt-doc";
import { Size } from "../types/block-core";
import { CRDTProxyProps, SetParams } from "./types";
import { AbstractCRDTProxy } from "./utils";

/**
 * A proxy for the Size type. (Uses internal CRDT map to store the size data.)
 */
export class SizeProxy extends AbstractCRDTProxy implements Size, SetParams<Size> {
    /**
     * Gets the width of the size.
     * @returns The width of the size.
     */
    get width(): number {
        const width = this.model.get('width');
        if (width === undefined) {
            throw new Error('Width is not set');
        }
        return width as number;
    }

    /**
     * Gets the height of the size.
     * @returns The height of the size.
     */
    get height(): number {
        const height = this.model.get('height');
        if (height === undefined) {
            throw new Error('Height is not set');
        }
        return height as number;
    }

    /**
     * Sets the width of the size. (Uses internal CRDT map to store the width.)
     * @param width - The width of the size.
     */
    set width(width: number) {
        this.model.set('width', width);
    }

    /**
     * Sets the height of the size. (Uses internal CRDT map to store the height.)
     * @param height - The height of the size.
     */
    set height(height: number) {
        this.model.set('height', height);
    }

    /**
     * Sets the parameters of the size.
     * @param params - The parameters of the size.
     */
    setParams(params: Size): void {
        this.width = params.width;
        this.height = params.height;
    }

    /**
     * Gets the proxy for the size.
     * @param model - The model to get the proxy for.
     * @param instantiator - The instantiator to get the proxy for.
     * @returns The proxy for the size.
     */
    static getProxy({ model, instantiator }: CRDTProxyProps): SizeProxy {
        const size = new SizeProxy();
        size.assignProxy({model, instantiator});
        return size;
    }

    /**
     * Creates a new size and assigns the parameters to it.
     * @param model - The model to create the size in.
     * @param instantiator - The instantiator to create the size with.
     * @param initParams - The parameters to assign to the size.
     * @returns The new size.
     */
    static createAssign({ model, instantiator }: CRDTProxyProps, initParams: Size): SizeProxy {
        const size = this.getProxy({model, instantiator});
        size.setParams(initParams);
        return size;
    }
}