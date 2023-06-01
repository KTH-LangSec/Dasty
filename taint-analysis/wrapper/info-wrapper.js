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
    __x_isAnalysisProxy = true;
    __x_isInfoWrapper = true;

    constructor(val, info, type) {
        this.__x_val = val;
        this.__x_info = info;
        this.__x_type = type;
    }

    valueOf() {
        const val = isTaintProxy(this.__x_val) ? this.__x_val.__x_val : this.__x_val;
        return val?.valueOf ? val.valueOf() : val;
    }

    toString() {
        const val = isTaintProxy(this.__x_val) ? this.__x_val.__x_val : this.__x_val;
        return val?.toString ? val.toString() : val;
    }
}

module.exports = {InfoWrapper, INFO_TYPE};