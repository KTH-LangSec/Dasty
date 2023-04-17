// DO NOT INSTRUMENT
const {createTaintVal, createCodeFlow, allTaintValues} = require("../wrapper/taint-val");
const {
    iidToLocation,
    unwrapDeep,
    isAnalysisWrapper,
    checkTaints,
    isTaintProxy,
    taintCompResult, iidToCode, updateAndCheckBranchCounter
} = require("../utils/utils");
const {createModuleWrapper} = require("../wrapper/module-wrapper");
const {emulateBuiltin, emulateNodeJs} = require("../wrapper/native");
const {DEFAULT_CHECK_DEPTH, MAX_LOOPS, DEFAULT_UNWRAP_DEPTH} = require("../conf/analysis-conf");
const {addAndWriteFlows, writeFlows, addAndWriteBranchedOn} = require('../utils/result-handler');
const {InfoWrapper, INFO_TYPE} = require("../wrapper/info-wrapper");

/**
 * The analysis class that is registered with nodeprof and implements the hooks
 */

class TaintAnalysis {
    // debug counters
    deepCheckCount = 0;
    deepCheckExcCount = 0;
    unwrapCount = 0;

    flows = []; // an array of all detected flows

    // an object that keeps track of the current entry point (is updated by the module wrapper object)
    entryPointIID = 0;
    entryPoint = [];

    lastReadTaint = null;

    loops = new Map(); // a stack of loop timestamp entering times -> this is to timeout infinite loops

    uncaughtErr = null;

    orExpr = 0; // indicator if we are currently in an or expression
    undefOrReadVal = null; // temp var to store undef read in an or expression

    lastExprResult = null; // stores the result of the last expression for use in successive expressions (e.g. obj and for of)
    forInInjectedProps = []; // stores all for in object to reset them when the loop is done

    // branchedOn = []; // stores taint values on which was branched
    branchedOn = new Map(); // stores taint values on which was branched

    processedFlow = new Map(); // keeps track of found flows to not write them repeatedly

    branchCounter = new Map(); // keeps track of how often we visited the same branch when force executing

    /**
     * @param pkgName
     * @param sinksBlacklist a blacklist of node internal function and modules that should not be considered sinks
     * @param propBlacklist a blacklist of props that should not be injected
     * @param resultFilename the filename to write the result to; if set flows are written immediately when found; to write only once when done do so in the callback
     * @param branchedOnFilename the filename to write tainted property names to if branched on them; is written immediately if set
     * @param executionDoneCallback is called when the execution is done (i.e. on process.exit)
     * @param forceBranches is a map in the form of (loc -> result) that specifies all the conditions that should be 'inversed'
     * @param recordAllFunCalls specifies if all function calls with tainted parameters should be recorded
     * @param injectForIn specifies if for 'for in' iterations a taint value should be injected as source (might lead to unexpected behaviour)
     */
    constructor(pkgName, sinksBlacklist, propBlacklist, resultFilename = null, branchedOnFilename = null, executionDoneCallback = null, forceBranches = null, recordAllFunCalls = false, injectForIn = false) {
        this.pkgName = pkgName;
        this.sinksBlacklist = sinksBlacklist;
        this.propBlacklist = propBlacklist;
        this.executionDoneCallback = executionDoneCallback;
        this.resultFilename = resultFilename;
        this.branchedOnFilename = branchedOnFilename;
        this.forceBranches = forceBranches;
        // set branch counter to 0
        forceBranches?.forEach((_, loc) => {
            this.branchCounter.set(loc, 0);
        });

        this.recordAllFunCalls = recordAllFunCalls;
        this.injectForIn = injectForIn;
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, functionScope, argLength) => {
        if (f !== Function
            && f !== eval
            && (f === undefined // check if node internal function
                || (!functionScope?.startsWith('node:')) // We only care for internal node functions
                || f === console.log
                || f.name === 'require'
                || f.name === 'emit'
                || argLength === 0)) return;

        // if it is an internal function replace it with wrapper function that checks for and unwraps taint values
        // ToDo - should the return value be tainted?
        // ToDo - we could add type hints for certain functions (e.g. eval has to unwrap to string)

        // is it blacklisted?
        let blacklisted = false;
        if (this.sinksBlacklist) {
            const blacklistedFunctions = this.sinksBlacklist.get(functionScope);
            blacklisted = (blacklistedFunctions !== undefined && (blacklistedFunctions == null || (!f.name && blacklistedFunctions.has(f.name))));
        }

        const self = this;
        const internalWrapper = function (...args) {
            const taints = []; // store taints for exception

            // unwrap and check args
            const unwrappedArgs = args.map((a, index) => {
                const argTaints = checkTaints(a, DEFAULT_UNWRAP_DEPTH);

                // add code flow (redundant but might still be interesting when looking at the full flow)
                if (self.recordAllFunCalls) {
                    argTaints?.forEach(taintVal => {
                        taintVal.__addCodeFlow(iid, 'functionCallArg', f?.name ?? '<anonymous>', {argIndex: index});
                    });
                }

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
                        addAndWriteFlows(newFlows, self.flows, self.processedFlow, self.resultFilename);
                    }
                }

                taints.push(argTaints);

                // only unwrap if necessary
                return argTaints?.length > 0 ? unwrapDeep(a) : a;
            });

            try {
                const result = !isConstructor
                    ? Reflect.apply(f, receiver, unwrappedArgs)
                    : Reflect.construct(f, unwrappedArgs);

                // emulate the taint propagation
                const emulatedResult = emulateNodeJs(functionScope, iid, result, receiver, f, args);
                return emulatedResult ?? result;
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
                        addAndWriteFlows(newFlows, self.flows, self.processedFlow, self.resultFilename);
                    }
                });
                throw e;
            }
        }

        internalWrapper.__isWrapperFun = true; // indicator that it is a internal wrapper function

        return {result: internalWrapper};
    }

    invokeFunPre = (iid, f, base, args, isConstructor, isMethod, functionScope, proxy) => {
        if (f === undefined || functionScope === undefined || f.__isWrapperFun) return;

        if (proxy && isAnalysisWrapper(proxy) && proxy?.__entryPoint) {
            this.entryPoint = proxy.__entryPoint;
            this.entryPointIID = iid;
        }

        // record code flows for function calls (only depth 3)
        if (this.recordAllFunCalls) {
            args.forEach((arg, index) => {
                const taintVals = checkTaints(arg, 3);
                taintVals?.forEach(taintVal => {
                    taintVal.__addCodeFlow(iid, 'functionCallArg', f?.name ?? '<anonymous>', {argIndex: index});
                });
            });
        }

        if (this.lastReadTaint === null || !args || args.length === 0 || typeof functionScope === 'string' && !functionScope?.startsWith('node:') || f === console.log) return;

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
            addAndWriteFlows(newFlows, this.flows, this.processedFlow, this.resultFilename);
        }
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
        // wrap require to analysed module; ToDo - might be improved by sending the scope from nodeprof

        // ToDo - does not work perfectly - maybe there is a better way to record entry points
        // if (f?.name === 'require' && f?.toString() === require.toString() && args.length > 0
        //     && (typeof result === 'object' || typeof result === 'function')
        //     && !iidToLocation(iid).includes('node_modules/')) {
        //     // only wrap pkgName or relative path // ToDo - improve to check if it is actually the package
        //     const moduleName = args[0];
        //     if (moduleName === this.pkgName || moduleName === '..' || moduleName === '../' || moduleName === './module-wrapper/mock-module') {
        //         const wrapper = createModuleWrapper(result, moduleName);
        //         return {result: wrapper};
        //     }
        // }

        if (this.lastReadTaint === null) return;

        // emulate taint propagation for builtins
        if (functionScope && !isTaintProxy(f)) {
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
        if (this.lastReadTaint === null) return;

        const newFlows = [];
        // record tainted receiver
        if (isTaintProxy(receiver)) {
            newFlows.push({
                ...receiver.__getFlowSource(),
                sink: {
                    iid,
                    type: 'functionCallReceiverException',
                    value: e.code + ' ' + e.toString(),
                    argIndex: 'receiver',
                    functionName: f?.name
                }
            });
        }

        // check if any arguments are tainted
        if (args?.length > 0) {
            args.forEach((arg, index) => {
                this.deepCheckExcCount++;
                const taints = checkTaints(arg, DEFAULT_CHECK_DEPTH);

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
        }

        // if we only inject one property record all exceptions
        // if (this.forceBranchProp && this.lastReadTaint) {
        //     newFlows.push({
        //             ...this.lastReadTaint.__getFlowSource(),
        //             sink: {
        //                 iid,
        //                 type: 'functionCallArgException',
        //                 value: e.code + ' ' + e.toString(),
        //                 functionName: f?.name
        //             }
        //         }
        //     )
        // }

        if (newFlows.length > 0) {
            addAndWriteFlows(newFlows, this.flows, this.processedFlow, this.resultFilename);
        }

        if ((e?.code === 'ERR_ASSERTION' || e?.name === 'AssertionError')) {
            return {result: true}; // just return something to stop propagation of error
        }
    }

    read = (iid, name, val, isGlobal, isScriptLocal) => {
        if (isTaintProxy(val)) {
            this.lastReadTaint = val;
        }
    }


    // this is needed to trigger instrumentation of object destructor syntax ({someProp})
    write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
        // if (val?.__taint) {
        //     val.__addCodeFlow(iid, 'write', name);
        // }
    };

    binary = (iid, op, left, right, result, isLogic) => {
        if (iid === this.orExpr && (op === '||' || op === '??')) {
            this.orExpr = 0;
            if (this.undefOrReadVal !== null) {
                result = isTaintProxy(result) ? result.__val : result;

                this.undefOrReadVal.__setValue(result);
                const val = this.undefOrReadVal;
                this.undefOrReadVal = null;
                return {result: val};
            }
        }

        // if it is a typeof comparison with a taint value use this information to infer the type
        if (((isAnalysisWrapper(left) && left?.__isInfoWrapper && left.__type === INFO_TYPE.TYPE_OF) || (isAnalysisWrapper(right) && right?.__isInfoWrapper && right.__type === INFO_TYPE.TYPE_OF)) && ['==', '===', '!=', '!=='].includes(op)) {
            let taint;
            let type;
            if (left.__info) {
                taint = left.__info;
                type = right;
            } else {
                taint = right.__info;
                type = left;
            }

            taint.__type = type;
            return {result: op === '===' || op === '=='};
        }

        // ToDo - look into notUndefinedOr (default value for object deconstruction e.g. {prop = []})

        if (!isTaintProxy(left) && !isTaintProxy(right)) return;

        switch (op) {
            case '===':
            case '==':
            case '!==':
            case '!=':
                let compRes = taintCompResult(left, right, op);
                const taintVal = isTaintProxy(left) ? left : right;

                // if branch execution is forced inverse the comparison result
                const loc = iidToLocation(iid);
                if (!this.forceBranches?.has(loc)) {
                    addAndWriteBranchedOn(taintVal.__taint.source.prop, iid, compRes, this.branchedOn, this.branchedOnFilename);
                } else {
                    updateAndCheckBranchCounter(this.branchCounter, loc);

                    compRes = !this.forceBranches.get(loc);

                    // infer type and set value based on comparison
                    if (compRes && (op === '===' || op === '==') || !compRes && (op === '!==' || op === '!=')) {
                        const otherVal = taintVal === left ? right : left;

                        if (!isTaintProxy(otherVal)) {
                            taintVal.__setValue(otherVal);
                        } else {
                            // if both are taint values just set value of the other
                            // ToDo - maybe check which one to assign (e.g. if one is not undefined take this one)?
                            taintVal.__setValue(otherVal.__val);
                        }
                    }
                }

                taintVal.__addCodeFlow(iid, 'conditional', op, {result: compRes});
                return {result: compRes};
            case '&&':
                // we currently only check for && when undefined -- ToDo - maybe for all?
                if (isTaintProxy(left) && left.__val === undefined) {
                    if (!this.forceBranches) {
                        addAndWriteBranchedOn(left.__taint.source.prop, iid, false, this.branchedOn, this.branchedOnFilename);
                        left.__addCodeFlow(iid, 'conditional', '&&', {result: false});

                        return {result: false};
                    }
                    const loc = iidToLocation(iid);
                    if (this.forceBranches.has(loc)) {
                        updateAndCheckBranchCounter(this.branchCounter, loc);
                        // if we force execute
                        const res = !this.forceBranches.get(loc);
                        left.__addCodeFlow(iid, 'conditional', '&&', {result: res});
                        return {result: res};
                    }
                }

                // if (isTaintProxy(result) && !result.__val) {
                //     // for now return false (e.g. for filter functions)
                //     // ToDo - record branching?
                //     return {result: false};
                // }
                break;
            case '+':
                // Todo - look into string Template Literals (it works but the other side is always '')
                const res = left?.__taint ? left.__add(iid, right, result, true) : right.__add(iid, left, result, false);
                return {result: res};
        }
    }

    getField = (iid, base, offset, val, isComputed, functionScope, isAsync, scope) => {
        if (isTaintProxy(offset)) {
            try {
                offset.__type = 'string';
                const cf = createCodeFlow(iid, 'propReadName', offset.valueOf());
                return {result: offset.__copyTaint(base[offset.valueOf()], cf, null)};
            } catch (e) {
                return;
            }
        }

        // if there is no base (should in theory never be the case) or if we access a taint object prop/fun (e.g. for testing) don't add new taint value
        if (!base || offset === '__taint') return;

        // this is probably an array access (don't inject)
        if (isComputed && typeof offset === 'number') {
            if (isTaintProxy(base)) {
                base.__type = 'array';
            }
            return;
            // if (isTaintProxy(base)) {
            //     return {result: base.__getArrayElem(iid, offset)};
            // } else {
            //     return;
            // }
        }

        if (typeof offset !== 'string') return;

        // if it is already tainted report repeated read
        if (isTaintProxy(val)) {
            this.lastReadTaint = val;
            val.__addCodeFlow(iid, 'read', offset);
            return;
        }

        // currently we only care for sources in non-native modules, even when analysing all
        // we also don't handle undefined property accesses of tainted values here
        // this is instead handled in the proxy itself
        // not that scope is always undefined if val !== undefined (this is a nodeprof optimization)
        if (!scope?.startsWith('file:') || scope.includes('test/') || scope.includes('tests/') || base.__taint) return;

        // Create new taint value when the property is either undefined or injected by us (meaning that it would be undefined in a non-analysis run)
        if (val === undefined && Object.prototype.isPrototypeOf(base) && !this.propBlacklist?.includes(offset)) {
            const res = createTaintVal(iid, offset, {iid: this.entryPointIID, entryPoint: this.entryPoint});

            try {
                // ({})['__proto__'][offset] = res; ToDo - this might be better but causes problems when unwrapping
                base[offset] = res;
            } catch (e) {
                // in some cases injection does not work e.g. read only
            }

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
        if (!isTaintProxy(left)) return;

        switch (op) {
            case 'typeof':
                /** if we don't know the type yet return the proxy object and an information that it is the result of typeof
                 this is used further up in the comparison to assign the correct type */
                return {
                    result: left.__type !== null
                        ? left.__typeof()
                        : new InfoWrapper(true, left, INFO_TYPE.TYPE_OF)
                };
            case '!':
                return {result: !left.__val};
        }
    }

    conditional = (iid, result, isValue) => {
        if (!isTaintProxy(result)) return;

        const loc = iidToLocation(iid);

        if (!this.forceBranches?.has(loc)) {
            // if it is a taint proxy and the underlying value is undefined result to false
            addAndWriteBranchedOn(result.__taint.source.prop, iid, result.__val, this.branchedOn, this.branchedOnFilename);
            result.__addCodeFlow(iid, 'conditional', '-', {result: result.__val});
            if (!result.__val) {
                return {result: result.__val};
            }
            // The taint value is non-falsy so nothing to do here (it acts as it would when injected)
        } else {
            updateAndCheckBranchCounter(this.branchCounter, loc);

            // when enforcing branching inverse the result
            const res = !this.forceBranches.get(loc);
            result.__addCodeFlow(iid, 'conditional', '-', {result: res});
            return {result: res};
        }
    }


    /**
     * Called whenever a control flow root is executed (e.g. if, while, async function call, ....)
     * For loops it is called every time the condition is evaluated (i.e. every loop)
     */
    controlFlowRootEnter = (iid, loopType, conditionResult) => {
        if (loopType === 'AsyncFunction' || loopType === 'Conditional') return;

        if (this.injectForIn && loopType === 'ForInIteration' && !this.loops.has(iid)) {
            const loc = iidToLocation(iid);
            if (typeof this.lastExprResult === 'object' && Object.prototype.isPrototypeOf(this.lastExprResult) // this should always be the case - but just to be safe
                && !loc.includes('test/') && !loc.includes('tests/')) { // try to avoid injecting in testing files

                const propName = `__forInTaint${iid}`;
                ({})['__proto__'][propName] = createTaintVal(iid, 'forInProp', {
                    iid: this.entryPointIID,
                    entryPoint: this.entryPoint
                }, false);

                this.forInInjectedProps.push(propName);

                // inject 'fake' property as source for ... in
                // if (!this.lastExprResult.__forInTaint) {
                //     this.lastExprResult.__forInTaint = createTaintVal(iid, 'forIntProp', {
                //         iid: this.entryPointIID,
                //         entryPoint: this.entryPoint
                //     }, false);
                //     this.forInObjects.push(this.lastExprResult);
                // } else {
                //     // in case of a nested for in over the same object don't inject again but add null to the stack, so we don't reset the property when returning from the inner loop
                //     this.forInObjects.push(null);
                // }

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

                if (this.lastReadTaint) {
                    const newFlow = {
                        ...this.lastReadTaint.__getFlowSource(),
                        sink: {
                            iid, type: 'functionCallArgException', functionName: '<infiniteLoop>'
                        }
                    };
                    addAndWriteFlows([newFlow], this.flows, this.processedFlow, this.resultFilename);
                }

                process.exit(1);
            }
            this.loops.set(iid, calls);
        }
    }

    controlFlowRootExit = (iid, loopType) => {
        if (loopType === 'AsyncFunction' || loopType === 'Conditional') return;

        // just to be safe delete the injected property after a for in iteration
        if (this.injectForIn && loopType === 'ForInIteration' && this.forInInjectedProps.length > 0) {
            const loc = iidToLocation(iid);
            if (!loc.includes('test/') && !loc.includes('tests/')) {
                const injectedProp = this.forInInjectedProps.pop();
                if (injectedProp) {
                    delete ({})['__proto__'][injectedProp];
                }
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
            addAndWriteFlows([newFlow], this.flows, this.processedFlow, this.resultFilename);
        }
        this.uncaughtErr = err;
    }

    endExecution = (code) => {
        if (this.executionDoneCallback) {
            this.executionDoneCallback(allTaintValues, this.uncaughtErr);
        }

        // ToDo - store it somewhere
        // console.log(new Set(this.branchedOn));
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

module
    .exports = TaintAnalysis;