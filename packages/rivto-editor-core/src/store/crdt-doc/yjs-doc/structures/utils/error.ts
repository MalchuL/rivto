export class YjsUtilsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "YjsUtilsError";
    }
}

export class YjsConvertError extends YjsUtilsError {
    constructor(message: string) {
        super(message);
        this.name = "YjsConvertError";
    }
}