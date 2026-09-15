export class CRDTError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CRDTError";
    }
}