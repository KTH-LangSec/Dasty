// DO NOT INSTRUMENT

const {iidToLocation, isTaintProxy} = require("../utils/utils");

const allTaintValues = []; // stores all taint values

class TaintProxyHandler {
    __x_isAnalysisProxy = true;
    __x_forceBranchExec = false; // indicates if this property is force branch executed (used for type inference)

    constructor(sourceIID, prop, entryPoint, val = null, type = null, forceBranchExec = false) {
        this.__x_taint = sourceIID ? {source: {iid: sourceIID, prop}, entryPoint, codeFlow: []} : null;

        this.#type = type;
        this.__x_val = val ?? this.__x_getDefaultVal(type);
        this.__x_forceBranchExec = forceBranchExec;

        allTaintValues.push(this);
    }

    #type = null;

    get __x_type() {
        return this.#type;
    }

    set __x_type(type) {
        if (type === this.#type) return;

        this.#type = type;
        this.__x_val = this.__x_getDefaultVal(type);
    }

    __x_setValue(val) {
        if (val !== undefined) {
            this.__x_type = getTypeOf(val);
        }
        this.__x_val = val;
    }

    /**
     * Defines a default values based on a type
     */
    __x_getDefaultVal(type) {
        // ToDo - symbol, bigint?
        switch (type) {
            case 'number':
                return 1;
            case 'array':
                return [];
            case 'function':
                const fun = () => '';
                fun.__x_isDefaultFun = true; // indicator if it is a 'made up' fun
                return fun;
            case 'boolean':
                return true;
            case 'object':
                return {};
            case 'string':
                return '';
            default:
                return undefined;
        }
    }

    /**
     * Set non-undefined (non-falsy) default value based on the inferred type
     */
    // __setNonUndefinedDefaultVal() {
    //     if (this.#type !== null) {
    //         this.__x_val = this.__x_getDefaultVal(this.#type);
    //     } else {
    //         this.__x_val = 'TAINTED';
    //     }
    // }

    __x_typeof() {
        // ToDo - boolean, symbol, bigint?
        if (this.__x_type === 'array') {
            return 'object';
        }

        return this.__x_type ?? typeof this.__x_val;
        // switch (this.__type) {
        //     case null:
        //     case 'string':
        //         return 'string';
        //     case 'number':
        //         return 'number';
        //     case 'boolean':
        //         return 'boolean';
        //     case 'function':
        //         return 'function';
        //     default:
        //         return 'object';
        // }
    }

    /**
     * Handles the access of properties that should exist (e.g. substring for strings) by returning either a 'wrapper' function or the property
     * @param objType - the inferred type of the wrapped object (e.g. map implies array)
     * @param prop - the property that is accessed
     * @param isFun - an indicator if a function is expected
     * @returns {{}|any} - returns either a wrapper function or the property value
     * @private
     */
    __x_handleDefaultPropAccess(objType, prop, isFun) {
        this.__x_type = objType;

        if (isFun) {
            // return function that is called instead of the original one
            return function () {
                // check if the method changes the underlying object (currently only array length check support)
                // ToDo - add check for other objects and functions (e.g. sort)
                const preLength = this.__x_type === 'array' ? this.__x_val.length : null;

                const newVal = this.__x_val[prop](...arguments);

                if (this.__x_type === 'array' && this.__x_val.length !== preLength) {
                    // record side effects (e.g. Array.push)
                    this.__x_taint.codeFlow.push(createCodeFlow(null, 'functionSideEffect', prop));
                }

                // ToDo - maybe don't propagate taint if function returns only boolean or int (e.g. Array.push)?
                // but in theory it might be possible to overwrite these methods to return something else so I'm keeping it for now
                return this.__x_copyTaint(newVal, createCodeFlow(null, 'functionResult', prop), getTypeOf(newVal));
            }.bind(this);
        }

        // if no function simply return the property value
        const newVal = this.__x_val && this.__x_val[prop] ? this.__x_val[prop] : undefined;
        const cf = createCodeFlow(null, 'propRead', prop);
        if (!isTaintProxy(newVal)) {
            return this.__x_copyTaint(newVal, cf, getTypeOf(newVal));
        } else {
            newVal.__x_taint.codeFlow.push(cf);
            return newVal;
        }
    }

    // unused (handled by get())
    // __getArrayElem(iid, index) {
    //     this.__x_type = 'array';
    //
    //     // inject new taint value if access is undefined
    //     // ToDo - think about if we should taint every access (it might not always be true -> e.g. if was set after the pollution)
    //     // if (index >= this.__val.length) {
    //     //     const cf = createCodeFlow(null, 'arrayElemRead', index);
    //     //     return this.__copyTaint(undefined, cf, null);
    //     // } else {
    //     //     return this.__val[index];
    //     // }
    //
    //     const val = this.__x_val[index];
    //     if (isTaintProxy(val)) {
    //         return val;
    //     }
    //
    //     const cf = createCodeFlow(iid, 'arrayElemRead', index);
    //     return this.__copyTaint(val, cf, null);
    // }

    /**
     * Creates a copy of a taint value with an optional new value and an added codeFlow
     * @param newVal - an optional new value, if not set the old one is used
     * @param codeFlow - an optional codeFlow to add
     * @param type - an optional type for the injected value
     * @returns {{}} - the new TaintVal with the copied data
     */
    __x_copyTaint(newVal, codeFlow = undefined, type = undefined) {
        const taintHandler = new TaintProxyHandler(
            null,
            null,
            null,
            newVal,
            type !== undefined ? type : this.__x_type
        );

        // copy the taint
        taintHandler.__x_taint = structuredClone(this.__x_taint);
        // add codeFlow
        if (codeFlow) {
            taintHandler.__x_taint.codeFlow.push(codeFlow);
        }
        return new Proxy(() => {
        }, taintHandler);
    }

    // Convert to primitive
    // when type coercing the toPrimitive symbol is checked first and then falls back to valueOf toString
    [Symbol.toPrimitive](hint) {
        if (this.__x_type !== 'string' && this.__x_type !== 'number' && this.__x_type !== 'boolean') {
            this.__x_type = hint;
        }
        if (!this.__x_val) return this.__x_val;

        if (this.__x_val[Symbol.toPrimitive]) {
            return this.__x_val[Symbol.toPrimitive](hint);
        } else if (hint === 'string' && this.__x_val.toString) {
            return this.__x_val.toString();
        } else if (this.__x_val.valueOf) {
            return this.__x_val.valueOf();
        }

        return this.__x_val;
    }

    [Symbol.iterator]() {
        this.__x_type = 'array';
        return this.__x_val.values();
    }

    // trap valueOf and toString and return tainted values
    // these are only used when called explicitly as type coercion is handles by Symbol.toPrimitive
    valueOf() {
        // it might not have value of (e.g. null prototype object)
        const newVal = this.__x_val?.valueOf ? this.__x_val.valueOf() : this.__x_val;
        return this.__x_copyTaint(newVal, undefined, this.__x_type);
        // return this.__val?.valueOf ? this.__val.valueOf() : this.__val;
    }

    toString() {
        // if to string is possible, use to string
        const newVal = this.__x_val?.toString ? this.__x_val.toString() : (this.__x_val ?? 'TAINTED');
        return this.__x_copyTaint(newVal, undefined, 'string');
    }

    /**
     * Function that handles the '+' operation by joining taint
     * @param iid
     * @param val - the value which is added to the tainted value
     * @param result - the actual result of the operation
     * @param isLeft - indicator if the obj is on the left or right hand side of the operation
     * @returns {{}}
     * @private
     */
    __x_add(iid, val, result, isLeft = true) {
        // we now know that the type of the value is either number or string (for now default to string ToDo)
        if (this.__x_type === null) {
            this.__x_type = 'string';
        }

        const cf = createCodeFlow(
            iid,
            'binary',
            'add' + (isLeft ? 'Right' : 'Left'),
            [val?.__x_taint ?? val]
        );

        const type = typeof result === 'number' ? 'number' : 'string';
        return this.__x_copyTaint(result, cf, type);
    }

    __x_addCodeFlow(iid, type, name, values = undefined, inferredType = null) {
        if (inferredType && this.__x_type !== null && this.__x_type !== 'non-primitive') {
            this.__x_type = inferredType;
        }

        const cf = createCodeFlow(iid, type, name, values);
        this.__x_taint.codeFlow.push(cf);
    }

    __x_getFlowSource() {
        const taint = structuredClone(this.__x_taint);
        taint.source.inferredType = this.__x_type;
        return taint;
    }

    // Proxy traps

    /**
     * Traps all property accesses
     * @param target - the proxied object (unused)
     * @param prop - the property name that is accessed
     * @param receiver - the proxy object (unused)
     * @returns {any|{}}
     */
    get(target, prop, receiver) {
        if (prop === 'constructor') {
            // ToDo
            return Reflect.get(target, prop, receiver);
        } else if (this.hasOwnProperty(prop) || TaintProxyHandler.prototype.hasOwnProperty(prop)) {
            // if the property is defined in the class delegate to it (this makes it straightforward to overwrite specific functions/members)
            return typeof this[prop] === 'function' ? this[prop].bind(this) : this[prop];
        } else if (typeof prop === 'symbol') {
            // ToDo - handle symbol access
            return undefined;
            // return this.__val[prop] ? this.__val[prop] : undefined;
        } else if (typeof prop === 'string' && prop.startsWith('__x_')) {
            // access to other analysis wrappers
            return undefined;
        } else if (this.__x_type === null && String.prototype.hasOwnProperty(prop) && Array.prototype.hasOwnProperty(prop)) {
            return this.__x_handleDefaultPropAccess(null, prop, typeof String.prototype[prop] === 'function');
        } else if (this.__x_type === 'string' || (this.__x_type === null && String.prototype.hasOwnProperty(prop))) {
            return this.__x_handleDefaultPropAccess('string', prop, typeof String.prototype[prop] === 'function');
        } else if (this.__x_type === 'array' || (this.__x_type === null && Array.prototype.hasOwnProperty(prop))) {
            return this.__x_handleDefaultPropAccess('array', prop, typeof Array.prototype[prop] === 'function');
        } else {
            // handle all other property accesses

            // if the value is currently undefined change it to an empty object
            // this can e.g. be the case when a for in injected object property is accessed
            // if (this.__val === undefined) {
            //     this.__val = {};
            // }


            // if the property exists copy it
            const newVal = this.__x_val && this.__x_val[prop] ? this.__x_val[prop] : undefined;
            const cf = createCodeFlow(null, 'propRead', prop);

            // if already tainted simply return it
            if (isTaintProxy(newVal)) {
                newVal.__x_taint.codeFlow.push(cf);
                return newVal;
            }

            const type = getTypeOf(newVal);

            // ToDo - check blacklist

            // don't inject directly - this can lead to unwanted behavior and does not have any new information as we already track the taint via the base
            return this.__x_copyTaint(newVal, cf, type);
        }
    }

    set(target, prop, value, receiver) {
        if (this.hasOwnProperty(prop) || TaintProxyHandler.prototype.hasOwnProperty(prop)) {
            this[prop] = value;
            return true;
        }

        return Reflect.set(target, prop, value, receiver);
    }

    /** Traps function call (i.e. proxy(...)) */
    apply(target, thisArg, argumentList) {
        // Return a new tainted value with unknown type and null as value
        this.__x_type = 'function';
        const result = this.__x_val.call(thisArg, ...argumentList);
        // get type if it is not our 'made up function' but an actually inferred type
        const type = !this.__x_val.__x_isDefaultFun ? getTypeOf(result) : null;

        const cf = createCodeFlow(null, 'functionCall', '');
        return this.__x_copyTaint(result, cf, type);
    }
}

/**
 * Gets the type of a value; basically 'typeof' with additional type 'array' and without 'undefined'
 * @param val
 * @returns {string|"undefined"|"object"|"boolean"|"number"|"string"|"function"|"symbol"|"bigint"|"array"|null}
 * @private
 */
function getTypeOf(val) {
    if (val === undefined) return null;

    let tpe = typeof val;
    return tpe === 'object' && val instanceof Array ? 'array' : tpe;
}

function createCodeFlow(iid, type, name, values = undefined) {
    const transformation = {iid, type, name};
    if (values) {
        transformation.values = values;
    }
    return transformation;
}

function createTaintVal(sourceIID, prop, entryPoint, val = undefined, type = null, forceBranchExec = false) {
    const handler = new TaintProxyHandler(sourceIID, prop, entryPoint, val, type, forceBranchExec);

    // the target is a function as it makes it callable while still being an object
    return new Proxy(() => {
    }, handler);
}

module.exports = {createTaintVal, createCodeFlow, allTaintValues, getTypeOf};