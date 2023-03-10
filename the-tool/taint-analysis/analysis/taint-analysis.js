// DO NOT INSTRUMENT
const {TaintVal, joinTaintValues, createStringTaintVal, createTaintVal} = require("./taint-val");
const {parseIID, iidToLocation, iidToCode} = require("../utils/utils");
const assert = require('assert');
const {createModuleWrapper} = require("./module-wrapper");

// const assert = require('assert');

class TaintAnalysis {
    flows = [];
    executionDone = false;

    // an object that keeps track of the current entry point (is updated by the module wrapper object)
    entryPointIID = 0;
    entryPoint = [];

    constructor(pkgName, sinksBlacklist, executionDoneCallback) {
        this.pkgName = pkgName;
        this.sinksBlacklist = sinksBlacklist;
        this.executionDoneCallback = executionDoneCallback;
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, scope) => {
        // We only care for internal node functions
        // ToDo - should we whitelist (e.g. node:internal)?
        if (isConstructor || f === undefined || (!scope?.startsWith('node:')) || f === console.log) return;

        // ToDo - unwrap constructor calls

        // if it is an internal function replace it with wrapper function that unwraps taint values
        // ToDo - right now this is done for every internal node function call -> maybe remove e.g. the ones without arguments?
        // ToDo - should the return value be tainted?
        // ToDo - unwrap deep -> e.g. an array containing a taint value (same for sink checking in invokeFunPre)
        const internalWrapper = !isAsync
            ? (...args) => {
                const unwrappedArgs = args.map(a => a?.__taint ? a.valueOf() : a);
                return f.call(receiver, ...unwrappedArgs);
            } : async (...args) => {
                const unwrappedArgs = args.map(a => a?.__taint ? a.valueOf() : a);
                return await f.call(receiver, ...unwrappedArgs);
            }

        return {result: internalWrapper};
    }

    invokeFunPre = (iid, f, base, args, isConstructor, isMethod, functionScope, proxy) => {
        if (proxy && !proxy.__taint && proxy?.__entryPoint) {
            this.entryPoint = proxy.__entryPoint;
            this.entryPointIID = iid;
        }

        if (f === undefined || !args || args.length === 0 || !functionScope?.startsWith('node:')/*|| !this.sinks.includes(f)*/) return;

        // check if function is blacklisted
        // if the function has no name and the module is not blacklisted we take it as a sink for now (this happens e.g. when promisified)
        // ToDo - also check functions with no name (by e.g. comparing the functions themself?)
        if (this.sinksBlacklist) {
            const blacklistedFunctions = this.sinksBlacklist.get(functionScope);
            if (blacklistedFunctions !== undefined && (blacklistedFunctions == null || (!f.name && blacklistedFunctions.has(f.name)))) {
                return;
            }
        }

        args.forEach(arg => {
            if (arg?.__taint) {
                // const sink = parseIID(iid);
                this.flows.push({...arg.__taint, sink: {iid, module: functionScope}});
                // const taintSrcString = arg.__taint.reduce((acc, t) => (acc ? ', ' : '') + acc + t);
                // console.log(`Flow found: Sources: ${taintSrcString}, Sink: ${sink}`);
            }
        });
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) => {
        // wrap require to analysed module; ToDo - might be improved by sending the scope from nodeprof

        // ToDo - the dynamic wrapping of functions introduces some overhead, maybe there is a better way to record entry points
        if (f?.name === 'require' && f?.toString() === require.toString() && args.length > 0
            && (typeof result === 'object' || typeof result === 'function')) {
            // only wrap pkgName or relative path // ToDo - improve to check if it is actually the package
            const moduleName = args[0];
            if (moduleName === this.pkgName || moduleName === '..' || moduleName === './' || moduleName === '../' || moduleName === './module-wrapper/mock-module') {
                const wrapper = createModuleWrapper(result, moduleName);
                return {result: wrapper};
            }
        }

        /* ToDo - in invokeFun intersect internal/builtin functions which have tainted arguments or similar
            (e.g. [taintedVal, ...].join()) and propagate taint */
    };

    invokeFunException = (iid, e, f) => {
        if (e?.code === 'ERR_ASSERTION') {
            return {result: true}; // just return something to stop propagation of error
        }/* else if (e instanceof TypeError && f?.__taint) {
            return {result: true};
        }*/
    }

    read = (iid, name, val, isGlobal, isScriptLocal) => {
        // if internal -> reset taint to string
        // if (this.internalFunctionCall !== null && val?.__taint) {
        //     this.checkInternalSink(val);
        //     return {result: val.valueOf()};
        // }
    }


    // this is needed to trigger instrumentation of object destructor syntax ({someProp})
    // ToDo - check why
    write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
        // return {result: val};
    };

    binary = (iid, op, left, right, result, isLogic) => {

        // ToDo - look into not undefined or (default value for object deconstruction e.g. {prop = []})

        if ((left?.__taint === undefined)
            && (right?.__taint === undefined)) return;

        switch (op) {
            case '===':
            case '==':
                if (left?.__taint && right === undefined || right?.__taint && left === undefined) {
                    return {result: true};
                }
                break;
            case '&&':
                if (!result.__taint && left?.__undef) return {result: false};
                break;
            case '+':
                // Todo - look into string Template Literals (it works but the other side is always '')
                const res = left?.__taint ? left.__add(iid, right, result, true) : right.__add(iid, left, result, false);
                return {result: res};
        }
    }

    getField = (iid, base, offset, val, isComputed, isOpAssign, isMethodCall, scope) => {
        // gm test
        // if (['_sourceFormatters', 'disposers', 'sourceBuffer', '_append', 'sourceStream', 'called', 'highlightStyle'].includes(offset) || base?.__taint) return;
        // if (['sourceBuffer'].includes(offset)) return;

        // if (base?.__taint) return;

        // if there is no base (should in theory never be the case) or if we access a taint object prop/fun (e.g. for testing) don't add new new taint value
        if (!base) return;

        // // this is probably an array access
        if (isComputed && base.__taint && typeof offset === 'number') {
            return {result: base.__getArrayElem(offset)};
        }

        // if internal -> unwrap
        // if (this.internalFunctionCall !== null && val?.__taint) {
        //     this.checkInternalSink(val);
        //     return {result: val.valueOf()};
        // }


        // currently we only care for sources in non-native modules, even when analysing all
        // we also don't handle undefined property accesses of tainted values here
        // this is instead handled in the proxy itself
        if (!scope || !scope.startsWith('file:') || base.__taint) return; // Note - null chaining is slower

        // Create new taint value when the property is either undefined or injected by us (meaning that it would be undefined in a non-analysis run)
        if (val === undefined && Object.prototype.isPrototypeOf(base)) {
            // const res = new TaintVal(iid);
            const res = createTaintVal(iid, {iid: this.entryPointIID, entryPoint: this.entryPoint});

            // if it is an internal function call argument then return actual value but check for sink
            /*            if (this.internalFunctionCall) {
                            this.checkInternalSink(res);
                        } else {*/
            // also inject directly (e.g. for cases such as this.undefinedProp || (this.undefinedProp = []))
            // ToDo - this can lead to problems when injecting when it is not used later
            try {
                base[offset] = res;
            } catch (e) {
                // in some cases injection does not work e.g. only a setter is specified
            }
            // indicator that it was injected directly for when we read it again
            // unused for now but ToDo - could be used to identify new possible sinks
            // base[offset].__injected = true;

            return {result: res};
            // }
        }

        // add additional taint
        // if (val?.__injected) {
        //     val.__taint.push(iid);
        // }
    }

    unary = (iid, op, left, result) => {
        // change typeof of tainted object to circumvent type checks
        // ToDo - check if it leads to other problems
        // ToDo - this also only works when instrumenting all -> we might have to change it for modules
        if (!left?.__taint) return;

        switch (op) {
            case 'typeof':
                return {result: left.__typeof()};
            case '!':
                return {result: left.__undef};
        }
    }

    conditional = (iid, result) => {
        // ToDo - record when branched and change for second run?
        if (result?.__undef) {
            return {result: false};
        }
    }

    endExecution = () => {
        this.executionDone = true;
        if (this.executionDoneCallback) {
            this.executionDoneCallback(this.flows);
        }
    }
}

module.exports = TaintAnalysis;