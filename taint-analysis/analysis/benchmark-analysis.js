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
const {
    DEFAULT_CHECK_DEPTH,
    MAX_LOOPS,
    DEFAULT_UNWRAP_DEPTH,
    EXCLUDE_INJECTION,
    DONT_UNWRAP
} = require("../conf/analysis-conf");
const {addAndWriteFlows, writeFlows, addAndWriteBranchedOn} = require('../utils/result-handler');
const {InfoWrapper, INFO_TYPE} = require("../wrapper/info-wrapper");

/**
 * The analysis class that is registered with nodeprof and implements the hooks
 */

class TaintAnalysis {

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, functionScope, argLength) => {
    }

    invokeFunPre = (iid, f, base, args, isConstructor, isMethod, functionScope, proxy) => {
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
    };

    invokeFunException = (iid, e, f, receiver, args) => {
    }

    read = (iid, name, val, isGlobal, isScriptLocal) => {
    }


// this is needed to trigger instrumentation of object destructor syntax ({someProp})
    write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
        // if (val?.__taint) {
        //     val.__addCodeFlow(iid, 'write', name);
        // }
    };

    binary = (iid, op, left, right, result, isLogic) => {
    }

    putFieldPre = (iid, base, offset, value) => {
    }

    getField = (iid, base, offset, val, isComputed, functionScope, isAsync, scope) => {
    }

    unary = (iid, op, left, result) => {
    }

    conditional = (iid, result, isValue) => {
    }


    /**
     * Called whenever a control flow root is executed (e.g. if, while, async function call, ....)
     * For loops it is called every time the condition is evaluated (i.e. every loop)
     */
    #forInLoops = new Map(); // keeps track of the locations of all for in loops
    #injectedForInLoop = new Map(); // keeps track of all injectedForInLoop (as not all loops will be injected)

    controlFlowRootEnter = (iid, loopType, conditionResult) => {
    }

    controlFlowRootExit = (iid, loopType) => {
    }

    uncaughtException = (err, origin) => {
    }

    endExecution = (code) => {
    }

    startExpression = (iid, type) => {
    }

    endExpression = (iid, type, result) => {
    }
}

module.exports = TaintAnalysis;