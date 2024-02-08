// DO NOT INSTRUMENT
const {createTaintVal, createCodeFlow, allTaintValues, getTypeOf} = require("../wrapper/taint-val");
const {
    iidToLocation,
    unwrapDeep,
    isAnalysisWrapper,
    checkTaints,
    isTaintProxy,
    taintCompResult, iidToCode, updateAndCheckBranchCounter, iidToSourceObject
} = require("../utils/utils");
const {createModuleWrapper} = require("../wrapper/module-wrapper");
const {emulateBuiltin, emulateNodeJs} = require("../wrapper/native");
const {
    DEFAULT_CHECK_DEPTH,
    MAX_LOOPS,
    DEFAULT_UNWRAP_DEPTH,
    EXCLUDE_INJECTION,
    DONT_UNWRAP
} = require("../conf/analysis-conf");
const {addAndWriteFlows, writeFlows, addAndWriteBranchedOn, writeAdditionalSink} = require('../utils/result-handler');
const {InfoWrapper, INFO_TYPE} = require("../wrapper/info-wrapper");
const path = require("path");
const fs = require("fs");
const cp = require("child_process");

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

    sinkStrings = []; // list of keywords that if contained in a function name it is considered a sink

    additionalSinksResultFilepath = null;
    additionalSinks = [];

    requiredPkg = null;

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
     * @param sinkStrings specifies a list of 'keywords' that specifies all functions that contain any of them as sinks
     * @param additionalSinkResultFilepath result filename for the additional sinks not requiring a tainted value
     */
    constructor(pkgName, sinksBlacklist, propBlacklist, resultFilename = null, branchedOnFilename = null, executionDoneCallback = null, forceBranches = null, recordAllFunCalls = false, injectForIn = false, sinkStrings = [], additionalSinkResultFilepath = null, repoPath = null) {
        this.pkgName = pkgName;
        this.sinksBlacklist = sinksBlacklist;
        this.propBlacklist = propBlacklist;
        this.executionDoneCallback = executionDoneCallback;
        this.resultFilename = resultFilename;
        this.branchedOnFilename = branchedOnFilename;
        this.forceBranches = forceBranches;

        this.recordAllFunCalls = recordAllFunCalls;
        this.injectForIn = injectForIn;
        this.sinkStrings = sinkStrings;
        this.additionalSinksResultFilepath = additionalSinkResultFilepath;

        try {
            this.requiredPkg = repoPath ? require(repoPath) : null;
        } catch (e) {
            // if not a valid package (e.g. exec file)
        }
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, functionScope, argLength) => {
        if (f !== Function
            && f !== eval
            && (f === undefined // check if node internal function
                || (!functionScope?.startsWith('node:')) // We only care for internal node functions
                || f === console.log
                || DONT_UNWRAP.includes(f.name)
                || argLength === 0)) return;

        // if it is an internal function replace it with wrapper function that checks for and unwraps taint values
        // Possible ToDo: we could add type hints for certain functions (e.g. eval has to unwrap to string)

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
                        taintVal.__x_addCodeFlow(iid, 'functionCallArg', f?.name ?? '<anonymous>', {argIndex: index});
                    });
                }

                // check taints
                if (!blacklisted) {
                    const newFlows = [];
                    argTaints?.forEach(taintVal => {
                        newFlows.push({
                            ...taintVal.__x_getFlowSource(),
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
                // return a;
            });
            try {
                const result = !isConstructor
                    ? Reflect.apply(f, receiver, unwrappedArgs)
                    : Reflect.construct(f, unwrappedArgs);

                // emulate the taint propagation (only if tainted)
                const emulatedResult = taints.length > 0 ? emulateNodeJs(functionScope, iid, result, receiver, f, args) : null;
                return emulatedResult ?? result;
            } catch (e) {
                taints.forEach((t, index) => {
                    const newFlows = [];
                    t?.forEach(taintVal => {
                        newFlows.push({
                            ...taintVal.__x_getFlowSource(),
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

        internalWrapper.__x_fName = f?.name;
        internalWrapper.__x_isWrapperFun = true; // indicator that it is an internal wrapper function

        return {result: internalWrapper};
    }

    invokeFunPre = (iid, f, base, args, isConstructor, isMethod, functionScope, proxy, originalFun) => {
        if (f === undefined) return;

        // check for additional sinks
        if (this.forceBranches && (functionScope?.startsWith('node:') || originalFun !== undefined)) {
            this.checkAdditionalSink(iid, originalFun ?? f, args);
        }

        if (functionScope === undefined || typeof f !== 'function' || f.__x_isWrapperFun) return;

        if (proxy && isAnalysisWrapper(proxy) && proxy?.__x_entryPoint) {
            this.entryPoint = proxy.__x_entryPoint;
            this.entryPointIID = iid;
        }

        // record code flows for function calls (only depth 3)
        let recordedTaint = false; // if we already record it - use it later
        if (this.recordAllFunCalls) {
            recordedTaint = false;
            args.forEach((arg, index) => {
                try {
                    const taintVals = checkTaints(arg, 3);
                    if (taintVals && taintVals.length > 0) recordedTaint = true;
                    taintVals?.forEach(taintVal => {
                        taintVal.__x_addCodeFlow(iid, 'functionCallArg', f?.name ?? '<anonymous>', {argIndex: index});
                    });
                } catch (e) {
                    // ignore
                }
            });
        }

        // check if the function is (not) a sink
        if (this.lastReadTaint === null || !args || args.length === 0) return;


        // only check sink by string if we recorded some taint before
        const sinkByString = (!this.recordAllFunCalls || recordedTaint) && f?.name && this.sinkStrings.find(s => f.name.includes(s));
        const sinkByFunction = typeof functionScope === 'string' && functionScope.startsWith('node:');

        if (!sinkByString && !sinkByFunction) return;

        // check if function is blacklisted
        // if the function has no name and the module is not blacklisted we take it as a sink for now (this happens e.g. when promisified)
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
                    ...taintVal.__x_getFlowSource(),
                    sink: {
                        iid,
                        type: 'functionCallArg',
                        module: sinkByFunction ? functionScope : `fnNameMatch (${functionScope})`,
                        functionName: f?.name,
                        argIndex: index
                    }
                });
            });
        });

        if (newFlows.length > 0) {
            addAndWriteFlows(newFlows, this.flows, this.processedFlow, this.resultFilename);
        }
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
        // wrap require to analysed module to record entry points
        if (this.requiredPkg && (f?.name === 'require' || (f.__x_isWrapperFun && f?.__x_fName === 'require') && args.length > 0)
            && this.requiredPkg
            && result === this.requiredPkg) {
            const moduleName = args[0];
            const wrapper = createModuleWrapper(result, moduleName);
            return {result: wrapper};
        }

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
        if (this.lastReadTaint === null || !e) return;

        const newFlows = [];
        // record tainted receiver
        if (isTaintProxy(receiver)) {
            newFlows.push({
                ...receiver.__x_getFlowSource(),
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
                        ...taintVal.__x_getFlowSource(),
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

        if (newFlows.length > 0) {
            addAndWriteFlows(newFlows, this.flows, this.processedFlow, this.resultFilename);
        }

        if ((e?.code === 'ERR_ASSERTION' || e?.name === 'AssertionError')) {
            return {result: true}; // just return something to stop propagation of error
        }
    }

    read = (iid, name, val, isGlobal, isScriptLocal, functionScope) => {
        if (isTaintProxy(val)) {
            this.lastReadTaint = val;
            // val.__addCodeFlow(iid, 'read', offset);

            // if an or add falsy return value
            if (this.orExpr && !val.__x_val) {
                this.undefOrReadVal = val.__x_copyTaint(val.__x_val);
                return {result: val.__x_val};
                // return {result: taintVal};

            }
        }
    }


// this is needed to trigger instrumentation of object destructor syntax ({someProp})
    write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
        // if (val?.__taint) {
        //     val.__addCodeFlow(iid, 'write', name);
        // }
    };

    binaryEnter = (iid, op) => {
        if (this.orExpr === 0 && (op === '||' || op === '??')) {
            this.orExpr = iid;
        }
    }

    binary = (iid, op, left, right, result, isLogic) => {
        if (iid === this.orExpr && (op === '||' || op === '??')) {
            this.orExpr = 0;
            if (this.undefOrReadVal !== null) {
                result = isTaintProxy(result) ? result.__x_val : result;

                this.undefOrReadVal.__x_setValue(result);
                const val = this.undefOrReadVal;
                this.undefOrReadVal = null;
                return {result: val};
            }
        }

        // if it is a typeof comparison with a taint value use this information to infer the type
        if (((isAnalysisWrapper(left) && left?.__x_isInfoWrapper && left.__x_type === INFO_TYPE.TYPE_OF)
                || (isAnalysisWrapper(right) && right?.__x_isInfoWrapper && right.__x_type === INFO_TYPE.TYPE_OF))
            && ['==', '==='].includes(op)) {
            let taint;
            let type;
            if (left.__x_info) {
                taint = left.__x_info;
                type = right;

                // unwrap
                left = left.__x_val;
            } else {
                taint = right.__x_info;
                type = left;

                // unwrap
                right = right.__x_val;
            }

            taint.__x_type = type;
        }

        // ToDo - handle notUndefinedOr (default value for object deconstruction e.g. {prop = []})

        if (!isTaintProxy(left) && !isTaintProxy(right)) return;

        switch (op) {
            case '===':
            case '==':
                // note that there are no '!== and !=' they are represented as e.g. !(x === y) in GraalJS and trigger the unary hook

                let compRes = taintCompResult(left, right, op);
                const taintVal = isTaintProxy(left) ? left : right;

                taintVal.__x_addCodeFlow(iid, 'conditional', op, {result: compRes});

                const cf = createCodeFlow(iid, 'compRes', op);
                return {result: taintVal.__x_copyTaint(compRes, cf, 'boolean')};

            case '&&':
                if (!isTaintProxy(left)) break;

                // if left is undefined return false
                if (!left.__x_val) {
                    // if (!this.forceBranches) {
                    // addAndWriteBranchedOn(left.__x_taint.source.prop, iid, false, this.branchedOn, this.branchedOnFilename);
                    left.__x_addCodeFlow(iid, 'binary', '&&', {result: false});

                    const cf = createCodeFlow(iid, 'binary', op);
                    return {result: left.__x_copyTaint(false, cf, 'boolean')};
                } else {
                    // if left is not falsy wrap result
                    let taintVal;
                    const cf = createCodeFlow(iid, 'binary', op);
                    if (isTaintProxy(result)) {
                        taintVal = result;
                        taintVal.__x_taint.codeFlow.push(cf);
                    } else {
                        taintVal = left.__x_copyTaint(result, cf, getTypeOf(result));
                    }

                    return {result: taintVal};
                }
            case '+':
                // Todo - look into string Template Literals (it works but the other side is always '')
                const res = left?.__x_taint ? left.__x_add(iid, right, result, true) : right.__x_add(iid, left, result, false);
                return {result: res};
        }
    }

    putFieldPre = (iid, base, offset, value) => {
        /* assigning a field in an '||' should not overwrite the taint (e.g. obj.prop || obj.prop = [])
        Why does this code work? Returning a result here aborts the evaluation of the node (i.e. the new value is never assigned)
        and return the value. Because we are in a '||' expression,
        the return value will be assigned to the taint proxy when exiting the '||' (see 'binary').
         */
        if (!base) return;

        if (this.orExpr && isTaintProxy(base[offset])) {
            return {result: value};
        }
    }

    getField = (iid, base, offset, val, isComputed, scope) => {
        if (isTaintProxy(offset)) {
            try {
                offset.__x_type = 'string';
                const cf = createCodeFlow(iid, 'propReadName', offset.__x_val);
                return {result: offset.__x_copyTaint(base[offset.__x_val], cf, null)};
            } catch (e) {
                return;
            }
        }

        // if it is already tainted report repeated read

        if (isTaintProxy(val)) {
            if (typeof offset === 'string' && offset.startsWith('__forInTaint')) return; // this is an edge case; we need to improve the orExpr rule
            this.lastReadTaint = val;
            val.__x_addCodeFlow(iid, 'read', offset);

            // if in 'or' and falsy return value and create a new taint value that is returned from the or expression
            if (this.orExpr && !val.__x_val) {
                this.undefOrReadVal = val.__x_copyTaint(val.__x_val);
                return {result: val.__x_val};
            }
            return;
        }

        if (!base || isTaintProxy(base) || offset === '__x_taint' // if there is no base (should in theory never be the case) or if we access a taint object prop/fun (e.g. for testing) don't add new taint value
            || typeof offset !== 'string' && typeof offset !== 'number' // we only care for string and number offsets
            || this.injectForIn) // if for...in injection don't inject anything else
            return;

        // this is probably an array access (don't inject)
        // if (isComputed && typeof offset === 'number' && isTaintProxy(base)) return;

        // if (typeof offset !== 'string' && typeof offset !== 'number') return;

        /* Currently we only care for sources in non-native modules, even when analysing all.
        We also don't handle undefined property accesses of tainted values here, this is instead handled in the proxy itself.
        Note that scope is always undefined if val !== undefined (this is a nodeprof optimization) */
        if ((!scope?.startsWith('file:')) || scope.includes('test/') || scope.includes('tests/') || isTaintProxy(base)) return;

        // Create new taint value when the property is either undefined or injected by us (meaning that it would be undefined in a non-analysis run)
        const loc = iidToLocation(iid);
        if (val === undefined && Object.prototype.isPrototypeOf(base) && !base.hasOwnProperty(offset) && !this.propBlacklist?.includes(offset) && !EXCLUDE_INJECTION.some(e => loc.includes(e))) {
            const res = createTaintVal(
                iid,
                offset,
                {iid: this.entryPointIID, entryPoint: this.entryPoint},
                undefined,
                null,
                !!this.forceBranches?.props.includes(offset)
            );

            try {
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
                /* if we don't know the type yet return the proxy object and an information that it is the result of typeof
                 this is used further up in the comparison to assign the correct type */
                const cf = createCodeFlow(iid, 'unary', 'typeof');
                let tpe = left.__x_copyTaint(left.__x_typeof(), cf, 'string');
                // if we force branch execute - infer type
                if (left.__x_forceBranchExec) {
                    tpe = new InfoWrapper(tpe, left, INFO_TYPE.TYPE_OF);
                }
                return {result: tpe};
            case '!':
                // return new taint with 'reversed' value
                let res = left.__x_copyTaint(!left.__x_val, createCodeFlow(iid, 'unary', '!'), 'boolean');
                return {result: res};
        }
    }

    conditional = (iid, input, result, isValue) => {
        if (!isTaintProxy(input)) return;

        const loc = iidToLocation(iid);

        if (!this.forceBranches?.branchings.has(loc)) {
            // if it is a taint proxy and the underlying value is undefined result to false
            addAndWriteBranchedOn(input.__x_taint.source.prop, iid, input.__x_val, this.branchedOn, this.branchedOnFilename);
            const res = typeof input.__x_val === 'object' ? {} : input.__x_val; // don't store full object in code-flow -  can lead to structured clone and other problems
            input.__x_addCodeFlow(iid, 'conditional', '-', {result: res});

            return {result: !!input.__x_val};
        } else {
            // when enforcing branching inverse the result
            const res = !this.forceBranches.branchings.get(loc);
            input.__x_addCodeFlow(iid, 'conditional', '-', {result: res});

            return {result: res};
        }
    }

    #forInLoops = new Map(); // keeps track of the locations of all for in loops
    #injectedForInLoop = new Map(); // keeps track of all injectedForInLoop (as not all loops will be injected)

    /**
     * Called whenever a control flow root is executed (e.g. if, while, async function call, ....)
     * For loops it is called every time the condition is evaluated (i.e. every loop)
     */
    controlFlowRootEnter = (iid, loopType, conditionResult) => {
        if (!this.injectForIn || loopType !== 'ForInIteration' || this.loops.has(iid)) return;

        const loc = iidToLocation(iid);
        // if (typeof this.lastExprResult === 'object' && Object.prototype.isPrototypeOf(this.lastExprResult) // this should always be the case - but just to be safe
        //     && !EXCLUDE_INJECTION.some(e => loc.includes(e))) { // try to avoid injecting in testing files
        if (!EXCLUDE_INJECTION.some(e => loc.includes(e))) { // try to avoid injecting in testing files

            this.#injectedForInLoop.set(iid, true);

            const propName = `__forInTaint${iid}`;
            // since we don't know the intended use of the injected property we set forcedBranchExec to true (i.e. activate type inference)
            ({})['__proto__'][propName] = createTaintVal(iid, 'forInProp', {
                iid: this.entryPointIID,
                entryPoint: this.entryPoint
            }, undefined, null, true);

            this.forInInjectedProps.push(propName);
        }
    }

    controlFlowRootExit = (iid, loopType) => {
        if (!this.injectForIn || loopType !== 'ForInIteration') return;

        // delete the injected property after a for in iteration
        if (this.#injectedForInLoop.has(iid)) {
            const injectedProp = this.forInInjectedProps.pop();
            if (injectedProp) {
                delete ({})['__proto__'][injectedProp];
            }
        }

        this.loops.delete(iid);
    }

    uncaughtException = (err, origin) => {
        if (this.lastReadTaint) {
            const newFlow = {
                ...this.lastReadTaint.__x_getFlowSource(),
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
    }

    checkAdditionalSink = (iid, f, args) => {
        if (f.name === 'require' && args?.length > 0 && (args[0].startsWith('.') || args[0].startsWith('/'))) {
            let reqPath = args[0];
            if (args[0].startsWith('.')) {
                const loc = iidToLocation(iid);
                const filepath = loc.substring(1, loc.indexOf(':'));
                reqPath = path.join(path.dirname(filepath), args[0]);
            }

            if (fs.existsSync(reqPath) && fs.lstatSync(reqPath).isDirectory() // is it a directory ...
                && !fs.readdirSync(reqPath).includes('package.json')  // ... that does not contain 'package.json' ...
                && !require.cache[reqPath + '/index.js'] && !require.cache[reqPath + 'index.js']) { // ... and is not cached
                writeAdditionalSink(iid, 'require', args, this.additionalSinksResultFilepath, this.forceBranches?.props, this.additionalSinks);
            }
            return;
        }

        if ([cp.exec, cp.execSync, cp.spawn, cp.spawnSync, cp.fork].includes(f)) {
            let argOpt = f === cp.exec || f === cp.execSync || args.length <= 2 ? args[1] : args[2];

            if (typeof argOpt !== 'object') { // it can be callback
                argOpt = undefined;
            }

            if (Object.prototype.isPrototypeOf(argOpt)
                && !argOpt.hasOwnProperty('shell')
                && (!argOpt.env || Object.prototype.isPrototypeOf(argOpt.env))) {
                writeAdditionalSink(iid, 'child_process.' + f.name, args, this.additionalSinksResultFilepath, this.forceBranches?.props, this.additionalSinks);
                return;
            }

            if (f === cp.fork) return;

            if (args[0] && typeof args[0] === 'string' && (!argOpt?.env || Object.prototype.isPrototypeOf(argOpt.env))) {
                const execPath = args[0].split(' ')[0];
                if (execPath.endsWith('.js') || execPath.endsWith('node') || execPath.endsWith('npm') || execPath.endsWith('git')) {
                    writeAdditionalSink(iid, 'child_process.' + f.name, args, this.additionalSinksResultFilepath, this.forceBranches?.props, this.additionalSinks);
                }
            }
        }
    }

// startExpression = (iid, type) => {
//
// }

// startExpression = (iid, type) => {
//     if (this.orExpr === 0 && (type === 'JSOr' || type === 'JSNullishCoalescing')) {
//         this.orExpr = iid;
//     }
// }

// endExpression = (iid, type, result) => {
//     this.lastExprResult = result;
//     if (iid === this.orExpr && (type === 'JSOr' || type === 'JSNullishCoalescing')) {
//         this.orExpr = 0;
//         //     if (this.undefOrReadVal !== null) {
//         //         this.undefOrReadVal.__x_setValue(result);
//         //         const val = this.undefOrReadVal;
//         //         this.undefOrReadVal = null;
//         //         return {result: val};
//         //     }
//     }
// }
}

module.exports = TaintAnalysis;