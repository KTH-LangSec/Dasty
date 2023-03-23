// DO NOT INSTRUMENT
const {TaintVal, joinTaintValues, createStringTaintVal, createTaintVal, createCodeFlow} = require("./taint-val");
const {
    parseIID,
    iidToLocation,
    iidToCode,
    checkTaintDeep,
    unwrapDeep,
    isAnalysisProxy,
    isAnalysisWrapper
} = require("../utils/utils");
const {createModuleWrapper} = require("./module-wrapper");
const {emulateBuiltin, emulateNodeJs} = require("./native");
const {NODE_EXEC_PATH} = require("../conf/analysis-conf");

class TaintAnalysis {
    deepCheckCount = 0;
    deepCheckExcCount = 0;
    unwrapCount = 0;

    flows = [];

    // an object that keeps track of the current entry point (is updated by the module wrapper object)
    entryPointIID = 0;
    entryPoint = [];

    spawnIndex = 0; // keeps track of how many child analyses were spawned so far (for result file naming)

    lastReadTaint = null;

    constructor(pkgName, sinksBlacklist, propBlacklist, resultFilename, executionDoneCallback) {
        this.pkgName = pkgName;
        this.sinksBlacklist = sinksBlacklist;
        this.propBlacklist = propBlacklist;
        this.executionDoneCallback = executionDoneCallback;
        this.resultFilename = resultFilename;
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, scope) => {
        // We only care for internal node functions
        // ToDo - should we whitelist (e.g. node:internal)?
        if (isConstructor || f === undefined || (!scope?.startsWith('node:')) || f === console.log) return;

        // if (scope === 'node:child_process' && f.name === 'spawn') {
        //     const analysisFilename = __dirname + '/../index.js';
        //     const resultFilename = `${this.resultFilename}.spawn-${this.spawnIndex}`;
        //
        //     // special wrapper child_process.spawn that if a new node process is spawned appends the analysis
        //     const spawnWrapper = (command, args, options) => {
        //         const unwrappedCommand = command.__taint ? command.valueOf() : command;
        //         const unwrappedArgs = args.map(a => a?.__taint ? a.valueOf() : a);
        //
        //         if (!unwrappedCommand.endsWith('node')) {
        //             return f.call(receiver, unwrappedCommand, unwrappedArgs, options);
        //         }
        //
        //         console.log('Spawning child process analysis ' + args.join(' '));
        //         this.spawnIndex++;
        //
        //         const graalNode = process.env.GRAAL_NODE_HOME;
        //         const nodeProfHome = process.env.NODEPROF_HOME;
        //         const analysisArgs = [
        //             '--jvm',
        //             '--experimental-options',
        //             '--engine.WarnInterpreterOnly=false',
        //             `--vm.Dtruffle.class.path.append=${nodeProfHome}/build/nodeprof.jar`,
        //             '--nodeprof.Scope=module',
        //             '--nodeprof.ExcludeSource=excluded/',
        //             '--nodeprof.IgnoreJalangiException=false',
        //             '--nodeprof=true',
        //             `${nodeProfHome}/src/ch.usi.inf.nodeprof/js/jalangi.js`,
        //             '--analysis', analysisFilename,
        //             '--initParam', `resultFilename:${resultFilename}`,
        //         ];
        //
        //         if (this.pkgName) {
        //             analysisArgs.push('--initParam', `pkgName:${this.pkgName ?? ''}`);
        //         }
        //
        //         while (unwrappedArgs[0]?.startsWith('-')) unwrappedArgs.shift();
        //
        //         analysisArgs.push(...(unwrappedArgs.filter(a => a !== '')));
        //
        //         // console.log(analysisArgs);
        //         const p = f.call(receiver, graalNode, analysisArgs, options);
        //
        //         // ToDo - improve (i.e. only on idle)
        //         const killTimeout = setTimeout(() => p.kill(), 5 * 60 * 1000);
        //         p.on('exit', () => clearTimeout(killTimeout));
        //
        //         return p;
        //     };
        //
        //     return {result: spawnWrapper};
        // }

        // ToDo - unwrap constructor calls

        // if it is an internal function replace it with wrapper function that unwraps taint values
        // ToDo - right now this is done for every internal node function call -> maybe remove e.g. the ones without arguments?
        // ToDo - should the return value be tainted?
        const internalWrapper = !isAsync
            ? (...args) => {
            // to skip unnecessary unwrapping first try without and only unwrap on error
                try {
                    return Reflect.apply(f, receiver, args);
                } catch (e) {
                    this.unwrapCount++;
                    const unwrappedArgs = args.map(arg => unwrapDeep(arg));
                    return Reflect.apply(f, receiver, unwrappedArgs);
                }
            } : async (...args) => {
                try {
                    return Reflect.apply(f, receiver, args);
                } catch (e) {
                    this.unwrapCount++;
                    const unwrappedArgs = unwrapDeep(args);
                    return Reflect.apply(f, receiver, unwrappedArgs);
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

        if (f === undefined || !args || args.length === 0 || typeof functionScope === 'string' && !functionScope?.startsWith('node:')/*|| !this.sinks.includes(f)*/) return;

        // check if function is blacklisted
        // if the function has no name and the module is not blacklisted we take it as a sink for now (this happens e.g. when promisified)
        // ToDo - also check functions with no name (by e.g. comparing the functions themselves?)
        if (this.sinksBlacklist) {
            const blacklistedFunctions = this.sinksBlacklist.get(functionScope);
            if (blacklistedFunctions !== undefined && (blacklistedFunctions == null || (!f.name && blacklistedFunctions.has(f.name)))) {
                return;
            }
        }

        args.forEach((arg, index) => {
            this.deepCheckCount++;
            const argTaints = checkTaintDeep(arg);
            argTaints.forEach(taintVal => {
                this.flows.push({
                    // ...structuredClone(taintVal.__taint),
                    ...taintVal.__taint,
                    sink: {iid, type: 'functionCallArg', value: functionScope, argIndex: index}
                });
            });
        });
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
        if (isAnalysisProxy(receiver) && receiver.__taint) {
            this.flows.push({
                ...receiver.__taint,
                // ...structuredClone(receiver.__taint),
                sink: {
                    iid,
                    type: 'functionCallReceiverException',
                    value: e.code + ' ' + e.toString(),
                    argIndex: 'receiver'
                }
            });
        }
        if (args?.length > 0) {
            args.forEach((arg, index) => {
                this.deepCheckExcCount++;
                const taints = checkTaintDeep(arg);
                taints.forEach(taintVal => {
                    this.flows.push({
                        ...taintVal.__taint,
                        // ...structuredClone(taintVal.__taint),
                        sink: {
                            iid,
                            type: 'functionCallArgException',
                            value: e.code + ' ' + e.toString(),
                            argIndex: index
                        }
                    });
                });
            });
        }

        if (e?.code === 'ERR_ASSERTION' || e?.name === 'AssertionError') {
            return {result: true}; // just return something to stop propagation of error
        }
    }

    read = (iid, name, val, isGlobal, isScriptLocal) => {
        if (isAnalysisProxy(val) && val?.__taint) {
            this.lastReadTaint = val.__taint;
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
        // if it is a typeof comparison with a taint value use this information to infer the type
        if (((isAnalysisWrapper(left) && !left.__taint && left?.__typeOfResult) || (isAnalysisWrapper(right) && !right.__taint && right?.__typeOfResult))
            && ['==', '===', '!=', '!=='].includes(op)) {
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

        if ((!isAnalysisProxy(left) || left?.__taint === undefined)
            && (!isAnalysisProxy(right) || right?.__taint === undefined)) return;

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

    getField = (iid, base, offset, val, isComputed, isOpAssign, isMethodCall, scope) => {
        // return the wrapped exec for execPath (which is often used to spawn a child process with the same node binary)
        if (offset === 'execPath' && typeof val === 'string' && val.endsWith('node')) {
            return {result: NODE_EXEC_PATH};
        }
            // if there is no base (should in theory never be the case) or if we access a taint object prop/fun (e.g. for testing) don't add new taint value
            if (!base || offset === '__taint') return;

        // // this is probably an array access
        if (isComputed && base.__taint && typeof offset === 'number') {
            return {result: base.__getArrayElem(offset)};
        }

        if (isAnalysisProxy(val) && val.__taint) {
            // if it is already tainted report repeated read
            this.lastReadTaint = val.__taint;
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
            try {
                // ToDo - make configurable
                base[offset] = res;
            } catch (e) {
                // in some cases injection does not work e.g. read only
            }

            this.lastReadTaint = res.__taint;
            return {result: res};
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
                    result: (left.__type !== null && left.__type !== 'non-primitive')
                        ? left.__typeof()
                        : {__typeOfResult: true, __taintVal: left, __isAnalysisProxy: true}
                };
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

    uncaughtException = (err, origin) => {
        if (this.executionDoneCallback) {
            this.executionDoneCallback(err);
            this.executionDoneCallback = null;
        }
    }

    endExecution = (code) => {
        console.log('checkTaintDeepFn', this.deepCheckCount);
        console.log('checkTaintDeepEx', this.deepCheckExcCount);
        console.log('unwrap', this.unwrapCount);
        if (this.executionDoneCallback) {
            this.executionDoneCallback();
        }
    }
}

module.exports = TaintAnalysis;