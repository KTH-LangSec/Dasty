// DO NOT INSTRUMENT
const {TaintVal, joinTaintValues, createStringTaintVal, createTaintVal} = require("./taint-val");
const {parseIID, iidToLocation, iidToCode, checkTaintDeep, unwrapDeep} = require("../utils/utils");
const assert = require('assert');
const {createModuleWrapper} = require("./module-wrapper");
const {ReturnDocument} = require("mongodb");
const {emulateBuiltin} = require("./native");

// const assert = require('assert');

class TaintAnalysis {
    flows = [];
    executionDone = false;

    // an object that keeps track of the current entry point (is updated by the module wrapper object)
    entryPointIID = 0;
    entryPoint = [];

    spawnIndex = 0; // keeps track of how many child analyses were spawned so far (for result file naming)

    constructor(pkgName, sinksBlacklist, resultFilename, executionDoneCallback) {
        this.pkgName = pkgName;
        this.sinksBlacklist = sinksBlacklist;
        this.executionDoneCallback = executionDoneCallback;
        this.resultFilename = resultFilename;
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, scope) => {
        // We only care for internal node functions
        // ToDo - should we whitelist (e.g. node:internal)?
        if (isConstructor || f === undefined || (!scope?.startsWith('node:')) || f === console.log) return;

        if (scope === 'node:child_process' && f.name === 'spawn') {
            const analysisFilename = __dirname + '/../index.js';
            const resultFilename = `${this.resultFilename}.spawn-${this.spawnIndex}.json`;

            // special wrapper child_process.spawn that if a new node process is spawned appends the analysis
            const spawnWrapper = (command, args, options) => {
                const unwrappedCommand = command.__taint ? command.valueOf() : command;
                const unwrappedArgs = args.map(a => a?.__taint ? a.valueOf() : a);

                if (!unwrappedCommand.endsWith('node')) {
                    return f.call(receiver, unwrappedCommand, unwrappedArgs, options);
                }

                console.log('Spawning child process analysis');
                this.spawnIndex++;

                const graalNode = process.env.GRAAL_NODE_HOME;
                const nodeProfHome = process.env.NODEPROF_HOME;
                const analysisArgs = [
                    '--jvm',
                    '--experimental-options',
                    '--engine.WarnInterpreterOnly=false',
                    `--vm.Dtruffle.class.path.append=${nodeProfHome}/build/nodeprof.jar`,
                    '--nodeprof.Scope=module',
                    '--nodeprof.ExcludeSource=excluded/',
                    '--nodeprof.IgnoreJalangiException=false',
                    '--nodeprof=true',
                    `${nodeProfHome}/src/ch.usi.inf.nodeprof/js/jalangi.js`,
                    '--analysis', analysisFilename,
                    '--initParam', `resultFilename:${resultFilename}`,
                ];

                if (this.pkgName) {
                    analysisArgs.push('--initParam', `pkgName:${this.pkgName ?? ''}`);
                }

                analysisArgs.push(...unwrappedArgs);

                // console.log(analysisArgs);
                return f.call(receiver, graalNode, analysisArgs, options);
            };

            return {result: spawnWrapper};
        }

        // ToDo - unwrap constructor calls

        // if it is an internal function replace it with wrapper function that unwraps taint values
        // ToDo - right now this is done for every internal node function call -> maybe remove e.g. the ones without arguments?
        // ToDo - should the return value be tainted?
        // ToDo - unwrap deep -> e.g. an array containing a taint value (same for sink checking in invokeFunPre)
        const internalWrapper = !isAsync
            ? (...args) => {
                const unwrappedArgs = unwrapDeep(args)
                /*args.map(a => a?.__taint ? a.valueOf() : a);*/
                return Reflect.apply(f, receiver, unwrappedArgs);
                // return f.call(receiver, ...unwrappedArgs);
            } : async (...args) => {
                const unwrappedArgs = unwrapDeep(args);
                return Reflect.apply(f, receiver, unwrappedArgs);
                // return await f.call(receiver, ...unwrappedArgs);
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
        // ToDo - also check functions with no name (by e.g. comparing the functions themselves?)
        if (this.sinksBlacklist) {
            const blacklistedFunctions = this.sinksBlacklist.get(functionScope);
            if (blacklistedFunctions !== undefined && (blacklistedFunctions == null || (!f.name && blacklistedFunctions.has(f.name)))) {
                return;
            }
        }

        args.forEach(arg => {
            const argTaints = checkTaintDeep(arg);
            if (argTaints.length > 0) {
                // const sink = parseIID(iid);
                argTaints.forEach(taint => {
                    this.flows.push({...taint, sink: {iid, module: functionScope}});
                });

                // const taintSrcString = arg.__taint.reduce((acc, t) => (acc ? ', ' : '') + acc + t);
                // console.log(`Flow found: Sources: ${taintSrcString}, Sink: ${sink}`);
            }
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
        if (functionScope === '<builtin>' && !f?.__taint) {
            const taintedResult = emulateBuiltin(iid, result, base, f, args);
            if (taintedResult) {
                return {result: taintedResult};
            }
        }

        /* ToDo - in invokeFun intersect internal/builtin functions which have tainted arguments or similar
            (e.g. [taintedVal, ...].join()) and propagate taint */
    };

    invokeFunException = (iid, e, f) => {
        // console.log(e.message);

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

        // if it is a typeof comparison with a taint value use this information to infer the type
        if (!left?.__taint && !right?.__taint
            && (left?.__typeOfResult || right?.__typeOfResult)
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

        if ((left?.__taint === undefined)
            && (right?.__taint === undefined)) return;

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
                /** if we don't know the type yet return the proxy object and an information that it is the result of typeof
                 this is used further up in the comparison to assign the correct type */
                return {
                    result: (left.__type !== null && left.__type !== 'non-primitive')
                        ? left.__typeof()
                        : {__typeOfResult: true, __taintVal: left}
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

    endExecution = () => {
        this.executionDone = true;
        if (this.executionDoneCallback) {
            this.executionDoneCallback(this.flows);
        }
    }
}

module.exports = TaintAnalysis;