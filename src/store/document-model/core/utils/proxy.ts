import { CRDTMap, Instantiator } from "@/store/crdt-doc";
import { CRDTProxy, CRDTProxyProps } from "../types";

export abstract class AbstractCRDTProxy implements CRDTProxy {
    protected _model?: CRDTMap = undefined;
    protected _instantiator?: Instantiator = undefined;

    get model(): CRDTMap {
        if (!this._model) {
            throw new Error('Model is not set');
        }
        return this._model;
    }

    get instantiator(): Instantiator {
        if (!this._instantiator) {
            throw new Error('Instantiator is not set');
        }
        return this._instantiator;
    }

    assignProxy({ model, instantiator }: CRDTProxyProps): void {
        this._model = model;
        this._instantiator = instantiator;
    }

    createProxyObject(){
        return {
            model: this.model,
            instantiator: this.instantiator,
        }
    }

}