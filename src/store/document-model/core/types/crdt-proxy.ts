import { CRDTMap, Instantiator } from "@/store/crdt-doc";

export type CRDTProxyProps = {
    model: CRDTMap;
    instantiator: Instantiator;
}

export interface CRDTProxy {
    get model(): CRDTMap;
    get instantiator(): Instantiator;
    assignProxy({ model, instantiator }: CRDTProxyProps): void;
}