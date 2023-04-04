// DO NOT INSTRUMENT
const {TaintVal, joinTaintValues, createStringTaintVal, createTaintVal, createCodeFlow} = require("./taint-val");
const {
    parseIID,
    iidToLocation,
    iidToCode,
    checkTaintDeep,
    unwrapDeep,
    isAnalysisProxy,
    isAnalysisWrapper,
    hasTaint,
    checkTaints,
    createInternalFunctionWrapper
} = require("../utils/utils");
const {createModuleWrapper} = require("./module-wrapper");
const {emulateBuiltin, emulateNodeJs} = require("./native");
const {
    NODE_EXEC_PATH, DEFAULT_CHECK_DEPTH, INF_LOOP_TIMEOUT, MAX_LOOPS, DEFAULT_UNWRAP_DEPTH
} = require("../conf/analysis-conf");
const {addAndWriteFlows, writeFlows} = require('../utils/result-handler');

class TaintAnalysis {
    deepCheckCount = 0;
    deepCheckExcCount = 0;
    unwrapCount = 0;

    flows = [];

    // an object that keeps track of the current entry point (is updated by the module wrapper object)
    entryPointIID = 0;
    entryPoint = [];

    lastReadTaint = null;

    loops = new Map(); // a stack of loop timestamp entering times -> this is to timeout infinite loops

    uncaughtErr = null;

    orExpr = 0; // indicator if we are currently in an or expression
    undefOrReadVal = null; // temp var to store undef read in an or expression

    lastExprResult = null; // stores the result of the last expression for use in successive expressions (e.g. obj and for of)
    forInObjects = []; // stores all for in object to reset them when the loop is done

    constructor(pkgName, sinksBlacklist, propBlacklist, resultFilename, executionDoneCallback) {
        this.pkgName = pkgName;
        this.sinksBlacklist = sinksBlacklist;
        this.propBlacklist = propBlacklist;
        this.executionDoneCallback = executionDoneCallback;
        this.resultFilename = resultFilename;
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, functionScope, argLength) => {
        // also unwrap arguments for eval
        if (f === eval) {
            const evalWrapper = (...args) => {
                this.unwrapCount++;
                const unwrappedArgs = args.map(arg => unwrapDeep(arg));
                return Reflect.apply(f, receiver, unwrappedArgs);
            }

            return {result: evalWrapper};
        }

        // We only care for internal node functions
        if (isConstructor || f === undefined || (!functionScope?.startsWith('node:')) || f === console.log || f?.name === 'require' || argLength === 0) return;

        // ToDo - unwrap constructor calls

        // if it is an internal function replace it with wrapper function that unwraps taint values
        // // ToDo - should the return value be tainted?

        // is it blacklisted?
        let blacklisted = false;
        if (this.sinksBlacklist) {
            const blacklistedFunctions = this.sinksBlacklist.get(functionScope);
            blacklisted = (blacklistedFunctions !== undefined && (blacklistedFunctions == null || (!f.name && blacklistedFunctions.has(f.name))));
        }

        const internalWrapper = (...args) => {
            const taints = []; // store taints for exception

            // unwrap and check args
            const unwrappedArgs = args.map((a, index) => {
                const argTaints = checkTaints(a, DEFAULT_UNWRAP_DEPTH);

                // check taints
                if (!blacklisted) {
                    const newFlows = [];
                    argTaints?.forEach(taintVal => {
                        newFlows.push({
                            ...taintVal.__getFlowSource(),
                            sink: {
                                iid,
                                type: 'functionCallArg',
                                module: functionScope,
                                functionName: f?.name,
                                argIndex: index
                            }
                        });
                    });

                    if (newFlows.length > 0) {
                        addAndWriteFlows(newFlows, this.flows, this.resultFilename);
                    }
                }

                taints.push(argTaints);

                // only unwrap if necessary
                return argTaints?.length > 0 ? unwrapDeep(a) : a;
            });

            try {
                return Reflect.apply(f, receiver, unwrappedArgs);
            } catch (e) {
                taints.forEach((t, index) => {
                    const newFlows = [];
                    t?.forEach(taintVal => {
                        newFlows.push({
                            ...taintVal.__getFlowSource(),
                            sink: {
                                iid,
                                type: 'functionCallArgException',
                                value: e.code + ' ' + e.toString(),
                                argIndex: index,
                                functionName: f?.name
                            }
                        });
                    });

                    if (newFlows.length > 0) {
                        addAndWriteFlows(newFlows, this.flows, this.resultFilename);
                    }
                });
                throw e;
            }
        }

        return {result: internalWrapper};
    }

    invokeFunPre = (iid, f, base, args, isConstructor, isMethod, functionScope, proxy) => {
        if (proxy && isAnalysisProxy(proxy) && !proxy.__taint && proxy?.__entryPoint) {
            this.entryPoint = proxy.__entryPoint;
            this.entryPointIID = iid;
        }

        // record if called as function (only depth 0)
        // args.forEach(arg => {
        //     // const argTaints = checkTaintDeep(arg, 1);
        //     if (isAnalysisProxy(arg) && arg.__taint) {
        //         arg.__addCodeFlow(iid, 'functionCallArg', f?.name ?? '<anonymous>');
        //     }
        // });

        if (f === undefined || !args || args.length === 0 || typeof functionScope === 'string' && !functionScope?.startsWith('node:') && f !== eval || f === console.log) return;

        // check if function is blacklisted
        // if the function has no name and the module is not blacklisted we take it as a sink for now (this happens e.g. when promisified)
        // ToDo - also check functions with no name (by e.g. comparing the functions themselves?)
        if (this.sinksBlacklist) {
            const blacklistedFunctions = this.sinksBlacklist.get(functionScope);
            if (blacklistedFunctions !== undefined && (blacklistedFunctions == null || (!f.name && blacklistedFunctions.has(f.name)))) {
                return;
            }
        }

        const newFlows = [];
        args.forEach((arg, index) => {
            this.deepCheckCount++;
            const argTaints = checkTaints(arg, DEFAULT_CHECK_DEPTH);
            argTaints?.forEach(taintVal => {
                newFlows.push({
                    ...taintVal.__getFlowSource(),
                    sink: {
                        iid, type: 'functionCallArg', module: functionScope, functionName: f?.name, argIndex: index
                    }
                });
            });
        });

        if (newFlows.length > 0) {
            addAndWriteFlows(newFlows, this.flows, this.resultFilename);
        }
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
        // wrap require to analysed module; ToDo - might be improved by sending the scope from nodeprof

        // ToDo - the dynamic wrapping of functions introduces some overhead, maybe there is a better way to record entry points
        // if (f?.name === 'require' && f?.toString() === require.toString() && args.length > 0
        //     && (typeof result === 'object' || typeof result === 'function')) {
        //     // only wrap pkgName or relative path // ToDo - improve to check if it is actually the package
        //     const moduleName = args[0];
        //     if (moduleName === this.pkgName || moduleName === '..' || moduleName === './' || moduleName === '../' || moduleName === './module-wrapper/mock-module') {
        //         const wrapper = createModuleWrapper(result, moduleName);
        //         return {result: wrapper};
        //     }
        // }

        // emulate taint propagation for builtins
        if (functionScope && !isAnalysisProxy(f)) {
            let taintedResult = null;
            if (functionScope === '<builtin>') {
                taintedResult = emulateBuiltin(iid, result, base, f, args);
            } else if (functionScope.startsWith('node:')) {
                taintedResult = emulateNodeJs(functionScope, iid, result, base, f, args);
            }

            if (taintedResult !== null) {
                return {result: taintedResult};
            }
        }
    };

    invokeFunException = (iid, e, f, receiver, args) => {
        const newFlows = [];
        if (isAnalysisProxy(receiver) && receiver.__taint) {
            newFlows.push({
                ...receiver.__getFlowSource(), // ...structuredClone(receiver.__taint),
                sink: {
                    iid,
                    type: 'functionCallReceiverException',
                    value: e.code + ' ' + e.toString(),
                    argIndex: 'receiver',
                    functionName: f?.name
                }
            });
        }

        if (args?.length > 0) {
            let tainted = false; // indicator if any argument is tainted

            args.forEach((arg, index) => {
                this.deepCheckExcCount++;
                // const taints = checkTaintDeep(arg);
                const taints = checkTaints(arg, DEFAULT_CHECK_DEPTH);

                if (taints?.length > 0) {
                    tainted = true;
                }
                taints?.forEach(taintVal => {
                    newFlows.push({
                        ...taintVal.__getFlowSource(),
                        sink: {
                            iid,
                            type: 'functionCallArgException',
                            value: e.code + ' ' + e.toString(),
                            argIndex: index,
                            functionName: f?.name
                        }
                    });
                });
            });

            // only change assertion if it is due to tainted arguments
            // if (tainted && (e?.code === 'ERR_ASSERTION' || e?.name === 'AssertionError')) {
            //     return {result: true}; // just return something to stop propagation of error
            // }
        }

        if (newFlows.length > 0) {
            addAndWriteFlows(newFlows, this.flows, this.resultFilename);
        }

        if ((e?.code === 'ERR_ASSERTION' || e?.name === 'AssertionError')) {
            return {result: true}; // just return something to stop propagation of error
        }
    }

    read = (iid, name, val, isGlobal, isScriptLocal) => {
        if (isAnalysisProxy(val) && val?.__taint) {
            this.lastReadTaint = val;
        }
    }


    // this is needed to trigger instrumentation of object destructor syntax ({someProp})
    // ToDo - check why
    write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
        // if (val?.__taint) {
        //     val.__addCodeFlow(iid, 'write', name);
        // }
    };

    binary = (iid, op, left, right, result, isLogic) => {
        if (iid === this.orExpr && (op === '||' || op === '??')) {
            this.orExpr = 0;
            if (this.undefOrReadVal !== null) {
                this.undefOrReadVal.__setValue(result);
                const val = this.undefOrReadVal;
                this.undefOrReadVal = null;
                return {result: val};
            }
        }
        // if it is a typeof comparison with a taint value use this information to infer the type
        if (((isAnalysisWrapper(left) && !left.__taint && left?.__typeOfResult) || (isAnalysisWrapper(right) && !right.__taint && right?.__typeOfResult)) && ['==', '===', '!=', '!=='].includes(op)) {
            let taint;
            let type;
            if (left.__typeOfResult) {
                taint = left.__taintVal;
                type = right;
            } else {
                taint = right.__taintVal;
                type = left;
            }

            taint.__type = type;
            return {result: op === '===' || op === '=='};
        }

        // ToDo - look into not undefined or (default value for object deconstruction e.g. {prop = []})

        if ((!isAnalysisProxy(left) || left?.__taint === undefined) && (!isAnalysisProxy(right) || right?.__taint === undefined)) return;

        switch (op) {
            case '===':
            case '==':
            case '!==':
            case '!=':
                if (left?.__taint && right === undefined || right?.__taint && left === undefined) {
                    return {result: op === '===' || op === '=='};
                }
                break;
            case '&&':
                if (!result?.__taint && left?.__undef) return {result: false};
                break;
            case '+':
                // Todo - look into string Template Literals (it works but the other side is always '')
                const res = left?.__taint ? left.__add(iid, right, result, true) : right.__add(iid, left, result, false);
                return {result: res};
        }
    }

    getField = (iid, base, offset, val, isComputed, functionScope, isAsync, scope) => {
        // if (functionScope !== undefined) {
        //     const internalWrapper = createInternalFunctionWrapper(iid, val, base, isAsync, this.flows, functionScope);
        //     if (internalWrapper !== null) {
        //         return internalWrapper;
        //     }
        // }

        // if there is no base (should in theory never be the case) or if we access a taint object prop/fun (e.g. for testing) don't add new taint value
        if (isAnalysisProxy(offset) && offset.__taint) {
            try {
                offset.__type = 'string';
                const cf = createCodeFlow(iid, 'propReadName', offset.valueOf());
                return {result: offset.__copyTaint(base[offset.valueOf()], cf, null)};
            } catch (e) {
                return;
            }
        }
        if (!base || offset === '__taint') return;

        // this is probably an array access
        if (isComputed && typeof offset === 'number') {
            if (isAnalysisProxy(base) && base.__taint) {
                return {result: base.__getArrayElem(offset)};
            } else {
                return;
            }
        }

        if (typeof offset !== 'string') return;

        if (isAnalysisProxy(val) && val.__taint) {
            // if it is already tainted report repeated read
            this.lastReadTaint = val;
            val.__addCodeFlow(iid, 'read', offset);
            return;
        }

        // currently we only care for sources in non-native modules, even when analysing all
        // we also don't handle undefined property accesses of tainted values here
        // this is instead handled in the proxy itself
        // not that scope is always undefined if val !== undefined (this is a nodeprof optimization)
        if (!scope?.startsWith('file:') || base.__taint) return;

        // Create new taint value when the property is either undefined or injected by us (meaning that it would be undefined in a non-analysis run)
        if (val === undefined && Object.prototype.isPrototypeOf(base) && !this.propBlacklist?.includes(offset)) {
            const res = createTaintVal(iid, offset, {iid: this.entryPointIID, entryPoint: this.entryPoint});
            // also inject directly (e.g. for cases such as this.undefinedProp || (this.undefinedProp = []))
            // ToDo - this can lead to problems when injecting when it is not used later
            // try {
            //     // ToDo - make configurable
            //     base[offset] = res;
            // } catch (e) {
            //     // in some cases injection does not work e.g. read only
            // }

            this.lastReadTaint = res;

            if (this.orExpr) {
                // if in or temp store the taint value to return it in the end with the value of the expression
                this.undefOrReadVal = res;
            } else {
                return {result: res};
            }
        }
    }

    unary = (iid, op, left, result) => {
        // change typeof of tainted object to circumvent type checks
        // ToDo - check if it leads to other problems
        if (!isAnalysisProxy(left) || !left.__taint) return;

        switch (op) {
            case 'typeof':
                /** if we don't know the type yet return the proxy object and an information that it is the result of typeof
                 this is used further up in the comparison to assign the correct type */
                // return {result: left.__typeof()};
                return {
                    result: (left.__type !== null && left.__type !== 'non-primitive') ? left.__typeof() : {
                        __typeOfResult: true,
                        __taintVal: left,
                        __isAnalysisProxy: true
                    }
                };
            case '!':
                return {result: left.__undef};
        }
    }

    conditional = (iid, result, isValue) => {
        // ToDo - record when branched and change for second run?
        if (isAnalysisProxy(result) && result.__taint && (result.__undef || !result.__val)) {
            return {result: false};
        }
    }

    /**
     * Called whenever a control flow root is executed (e.g. if, while, async function call, ....)
     * For loops it is called every time the condition is evaluated (i.e. every loop)
     */
    controlFlowRootEnter = (iid, loopType, conditionResult) => {
        if (loopType === 'AsyncFunction' || loopType === 'Conditional') return;

        if (loopType === 'ForInIteration' && !this.loops.has(iid)) {
            if (typeof this.lastExprResult === 'object' && Object.prototype.isPrototypeOf(this.lastExprResult)) { // this should always be the case - but just to be safe
                // inject 'fake' property as source for ... in
                if (!this.lastExprResult.__forInTaint) {
                    this.lastExprResult.__forInTaint = createTaintVal(iid, 'forIntProp', {
                        iid: this.entryPointIID,
                        entryPoint: this.entryPoint
                    }, false);
                    this.forInObjects.push(this.lastExprResult);
                } else {
                    // in case of a nested for in over the same object don't inject again but add null to the stack, so we don't reset the property when returning from the inner loop
                    this.forInObjects.push(null);
                }

                // store the object to reset it after the loop (stack for nested for ins)
            }
        }

        // to prevent infinite loops we keep track of how often the loop is entered and abort on a certain threshold
        if (!this.loops.has(iid)) {
            this.loops.set(iid, 1);
        } else {
            const calls = this.loops.get(iid) + 1;
            if (calls > MAX_LOOPS) {
                console.log('Infinite loop detected - aborting');

                console.log(iidToLocation(iid));
                console.log(iidToCode(iid));
                if (this.lastReadTaint) {
                    const newFlow = {
                        ...this.lastReadTaint.__getFlowSource(),
                        sink: {
                            iid, type: 'functionCallArgException', functionName: '<infiniteLoop>'
                        }
                    };
                    addAndWriteFlows([newFlow], this.flows, this.resultFilename);
                }

                process.exit(1);
            }
            this.loops.set(iid, calls);
        }
    }

    controlFlowRootExit = (iid, loopType) => {
        if (loopType === 'AsyncFunction' || loopType === 'Conditional') return;

        if (loopType === 'ForInIteration' && this.forInObjects.length > 0) {
            const obj = this.forInObjects.pop();
            if (obj) {
                delete obj.__forInTaint;
            }
        }

        this.loops.delete(iid);
    }

    uncaughtException = (err, origin) => {
        if (this.lastReadTaint) {
            const newFlow = {
                ...this.lastReadTaint.__getFlowSource(),
                sink: {
                    type: 'functionCallArgException',
                    value: err.code + ' ' + err.toString(),
                    functionName: '<uncaughtException>'
                }
            };
            addAndWriteFlows([newFlow], this.flows, this.resultFilename);
        }
        this.uncaughtErr = err;
    }

    endExecution = (code) => {
        // console.log('checkTaintDeepFn', this.deepCheckCount);
        // console.log('checkTaintDeepEx', this.deepCheckExcCount);
        // console.log('unwrap', this.unwrapCount);
        writeFlows(this.flows, this.resultFilename);
        if (this.executionDoneCallback) {
            this.executionDoneCallback(this.uncaughtErr);
        }
    }

    startExpression = (iid, type) => {
        if (this.orExpr === 0 && (type === 'JSOr' || type === 'JSNullishCoalescing')) {
            this.orExpr = iid;
        }
    }

    endExpression = (iid, type, result) => {
        this.lastExprResult = result;
        // if (iid === this.orExpr && (type === 'JSOr' || type === 'JSNullishCoalescing')) {
        //     this.orExpr = 0;
        // //     if (this.undefOrReadVal !== null) {
        // //         this.undefOrReadVal.__setValue(result);
        // //         const val = this.undefOrReadVal;
        // //         this.undefOrReadVal = null;
        // //         return {result: val};
        // //     }
        // }
    }
}

module.exports = TaintAnalysis;