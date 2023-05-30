// DO NOT INSTRUMENT

/**
 * This is a simple wrapper that allows to propagate information 'up' the AST
 * Works only for primitives and should be unwrapped as soon as possible
 */

const INFO_TYPE = {
    TYPE_OF: 0,
    UNDEF_COMP: 1
}

class InfoWrapper {
    __isAnalysisProxy = true;
    __isInfoWrapper = true;

    constructor(val, info, type) {
        this.__val = val;
        this.__info = info;
        this.__type = type;
    }

    valueOf() {
        return this.__val?.valueOf ? this.__val.valueOf() : this.__val;
    }

    toString() {
        return this.__val?.toString ? this.__val.toString() : this.__val;
    }
}

module.exports = {InfoWrapper, INFO_TYPE};