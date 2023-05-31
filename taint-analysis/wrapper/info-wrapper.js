// DO NOT INSTRUMENT

const {isTaintProxy} = require("../utils/utils");
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
        const val = isTaintProxy(this.__val) ? this.__val.__val : this.__val;
        return val?.valueOf ? val.valueOf() : val;
    }

    toString() {
        const val = isTaintProxy(this.__val) ? this.__val.__val : this.__val;
        return val?.toString ? val.toString() : val;
    }
}

module.exports = {InfoWrapper, INFO_TYPE};