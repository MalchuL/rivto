import { CRDTMap, Instantiator } from "@/store/crdt-doc";
import { Coord } from "../types";
import { CRDTProxyProps, SetParams } from "./types";
import { AbstractCRDTProxy } from "./utils";

/**
 * A proxy for the Coord type. (Uses internal CRDT map to store the coord data.)
 */
export class CoordProxy extends AbstractCRDTProxy implements Coord, SetParams<Coord> {
    /**
     * Gets the x coordinate.
     * @returns The x coordinate.
     */
    get x(): number {
        const x = this.model.get('x');
        if (x === undefined) {
            throw new Error('X is not set');
        }
        return x as number;
    }

    /**
     * Gets the y coordinate.
     * @returns The y coordinate.
     */
    get y(): number {
        const y = this.model.get('y');
        if (y === undefined) {
            throw new Error('Y is not set');
        }
        return y as number;
    }
    
    /**
     * Sets the x coordinate. (Uses internal CRDT map to store the x coordinate.)
     * @param x - The x coordinate.
     */
    set x(x: number) {
        this.model.set('x', x);
    }

    /**
     * Sets the y coordinate. (Uses internal CRDT map to store the y coordinate.)
     * @param y - The y coordinate.
     */
    set y(y: number) {
        this.model.set('y', y);
    }
    /**
     * Sets the parameters of the coord.
     * (Uses internal CRDT map to store the x and y coordinates.)
     * @param params - The parameters of the coord.
     * @param params.x - The x coordinate.
     * @param params.y - The y coordinate.
     */
    setParams(params: Coord): void {
        this.model.set('x', params.x);
        this.model.set('y', params.y);
    }
    
    /**
     * Gets the proxy for the coord.
     * @param model - The model to get the proxy for.
     * @param instantiator - The instantiator to get the proxy for.
     * @returns The proxy for the coord.
     */
    static getProxy({ model, instantiator }: CRDTProxyProps): CoordProxy {
        const coord = new CoordProxy();
        coord.assignProxy({model, instantiator});
        return coord;
    }

    /**
     * Creates a new coord and assigns the parameters to it.
     * @param model - The model to create the coord in.
     * @param instantiator - The instantiator to create the coord with.
     * @param initParams - The parameters to assign to the coord.
     * @returns The new coord.
     */
    static createAssign({ model, instantiator }: CRDTProxyProps, initParams: Coord): CoordProxy {
        const coord = this.getProxy({model, instantiator});
        coord.setParams(initParams);
        return coord;
    }
}