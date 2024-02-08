// DO NOT INSTRUMENT

// keeps track of the function call depth -> we are currently only interested in top level calls (i.e. entry points)
// does this lead to problems with multiple modules?
const {isAnalysisWrapper} = require("../utils/utils");
let callDepth = 0;

class ModuleWrapperProxyHandler {

    /**
     * @param call - the call/access that returns the new wrapper
     * @param entryPoint - the entry point trace so far
     */
    constructor(call = null, entryPoint = []) {
        this.entryPoint = entryPoint;

        if (call) {
            this.entryPoint.push(call);
        }
    }

    /**
     * Traps all property accesses adds the info to the entry point
     * and returns the wrapped result (if not primitive)
     */
    get(target, property, receiver) {
        // ToDo - chick if it work with getter
        if (property === '__x_entryPoint') {
            // allow to access handlers entrypoint
            return this.entryPoint;
        } else if (property === '__x_isAnalysisProxy') {
            return true;
        } else if (typeof property === 'string' && property.startsWith('__x_')) {
            // this is probably another analysis field access
            return undefined;
        }

        const result = Reflect.get(target, property, receiver);

        if (typeof property !== 'string' || property === 'prototype' || callDepth > 0) {
            // if the prototype is accessed don't wrap it (new is handled in construct())
            // we are also only interested in entry points (i.e. callDepth === 0)
            return result;
        }

        // if it's a primitive, a 'native' or a symbol we don't wrap
        if (!shouldWrap(result)) {
            return result;
        }

        // return new wrapper and copy the current entry point path
        // return new Proxy(result, new ModuleWrapperProxyHandler({type: 'propertyRead', args: [property]}, this.entryPoint.slice()));
        return new Proxy(result, new ModuleWrapperProxyHandler('.' + property, this.entryPoint.slice()));
    }

    /**
     * Traps functions calls, adds the info to the entry point, calls the 'original' function
     * and returns the wrapped result (if not primitive)
     */
    apply(target, thisArg, argumentList) {
        // if called from within a function it's not an entry point
        if (callDepth > 0) return Reflect.apply(target, thisArg, argumentList);

        // const ep = {
        //     type: 'apply',
        //     args: argumentList.map(a => a.toString())
        // };

        // const ep = `(${argumentList.map(a => typeof a === 'object' ? JSON.stringify(a) : (a?.toString ? a.toString() : a))})`;
        const ep = `()`;

        let result = null;
        callDepth++; // adapt call depth
        this.entryPoint.push(ep);
        try {
            result = Reflect.apply(target, thisArg, argumentList); // call the actual function
        } finally {
            this.entryPoint.pop();
            callDepth--;
        }

        // if it's a primitive (or symbol for now) we don't wrap
        // if (!shouldWrap(result)) {
        return result;
        // }

        // wrap the result if necessary
        // return new Proxy(result, new ModuleWrapperProxyHandler(ep, this.entryPoint.slice()));
    }

    /**
     * Returns a wrapped object when created with 'new'
     */
    construct(target, argumentsList, newTarget) {
        const result = Reflect.construct(target, argumentsList, newTarget);

        if (callDepth > 0) return result;
        return new Proxy(result, new ModuleWrapperProxyHandler('new ()', this.entryPoint.slice()));
    }
}

function shouldWrap(obj) {
    // Don't wrap Map or Sets and Arrays as Proxy does not always delegate to the target (e.g. Array.from(set))
    // To fix this we could unpack it ourselves via instrumentation, but it's not relevant for now
    return (obj !== null && obj !== undefined && !obj.__x_entryPoint
        && !isAnalysisWrapper(obj)
        && (typeof obj === 'function' || typeof obj === 'object')
        && !Array.prototype.isPrototypeOf(obj)
        && !Map.prototype.isPrototypeOf(obj)
        && !Set.prototype.isPrototypeOf(obj)
        && !String.prototype.isPrototypeOf(obj));
}

function createModuleWrapper(module, moduleName) {
    if (callDepth > 0) return module;

    const handler = new ModuleWrapperProxyHandler(`require('${moduleName}')`);
    return shouldWrap(module) ? new Proxy(module, handler) : module;
}

module.exports = {createModuleWrapper};