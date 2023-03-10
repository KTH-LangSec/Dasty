/*******************************************************************************
 * Copyright 2018 Dynamic Analysis Group, Università della Svizzera Italiana (USI)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *******************************************************************************/

const cp = require('child_process');

// DO NOT INSTRUMENT
class LogAnalysis {

    constructor() {
        this.depth = 0;
    }

    /**
     * These callbacks are called before and after a function, method, or constructor invocation.
     **/
    invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionScope, proxy, functionIid, functionSid) {
        console.log(this.hookToString('invokeFunPre', {
            iid,
            f,
            base,
            args,
            isConstructor,
            isMethod,
            functionScope,
            proxy: proxy !== undefined,
            functionIid,
            functionSid
        }));
        // return {f: f, base: base, args: args, skip: false};
    };
    invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
        console.log(this.hookToString('invokeFun', {
            iid,
            f,
            base,
            args,
            result,
            isConstructor,
            isMethod,
            functionIid,
            functionSid
        }));
        // return {result: result};
    };

    invokeFunStart = (iid, f, receiver, index, scope) => {
        console.log(this.hookToString('invokeFunStart', {
            iid, f, receiver, index, scope
        }));
    };

    /**
     * This callback is called after the creation of a literal. A literal can be a function
     * literal, an object literal, an array literal, a number, a string, a boolean, a regular
     * expression, null, NaN, Infinity, or undefined.
     *
     * @param fakeHasGetterSetter is a placeholder to be consistent with Jalangi's API.
     * The value provided in the callback is always undefined while
     * the actual value should be computed lazily via J$.adapter.hasGetterSetter(code)
     *
     * @param literalType is a new argument provided by NodeProf showing the type of literal
     *
     **/
    literal = function (iid, val, /* hasGetterSetter should be computed lazily */ fakeHasGetterSetter, literalType) {
        console.log(this.hookToString('literal', {iid, val: val?.name ?? val}));
        // return {result: val};
    };
    // optional literal type filter: by specifying the types in an array, only given types of literals will be instrumented
    // literal.types = ["ObjectLiteral", "ArrayLiteral", "FunctionLiteral", "NumericLiteral", "BooleanLiteral", "StringLiteral", "NullLiteral", "UndefinedLiteral", "RegExpLiteral"];

    /**
     * These callbacks are called before and after a property of an object is accessed.
     **/
    getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
        console.log(this.hookToString('getFieldPre', {iid, base, offset, isComputed, isOpAssign, isMethodCall}));
        // return {base: base, offset: offset, skip: false};
    };
    getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
        console.log(this.hookToString('getField', {iid, base, offset, val, isComputed, isOpAssign, isMethodCall}));
        // return {result: val};
    };

    /**
     * These callbacks are called before a property of an object is written
     **/
    putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
        console.log(this.hookToString('getFieldPre', {iid, base, offset, val, isComputed, isOpAssign}));
        // return {base: base, offset: offset, val: val, skip: false};
    };
    putField = function (iid, base, offset, val, isComputed, isOpAssign) {
        // return {result: val};
    };

    /**
     * These callbacks are called after a variable is read or written.
     **/
    read = function (iid, name, val, isGlobal, isScriptLocal) {
        console.log(this.hookToString('read', {iid, name, val, isGlobal, isScriptLocal}));
        // return {result: val};
    };
    write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
        console.log(this.hookToString('write', {iid, name, val, lhs, isGlobal, isScriptLocal}));
        // return {result: val};
    };

    /**
     * These callbacks are called before the execution of a function body starts and after it completes.
     **/
    functionEnter = function (iid, f, dis, args) {
        console.log(this.hookToString('functionEnter', {iid, f, dis, args}));
        this.depth++;
    };
    functionExit = function (iid, returnVal, wrappedExceptionVal) {
        this.depth--;
        console.log(this.hookToString('functionExit', {
            iid,
            returnVal: returnVal?.name ?? returnVal,
            wrappedExceptionVal
        }));
        // return {returnVal: returnVal, wrappedExceptionVal: wrappedExceptionVal, isBacktrack: false};
    };

    /**
     * These callbacks are called before the execution of a builtin function body starts and after it completes.
     **/
    builtinEnter = function (name, f, dis, args) {
        // console.log(this.hookToString('builtinEnter', {name, f, dis, args}));
    };
    builtinExit = function (name, f, dis, args, returnVal, exceptionVal) {
        // console.log(this.hookToString('builtinExit', {name, f, dis, args, returnVal, exceptionVal}));
        // return {returnVal: returnVal};
    };

    /**
     * These callbacks are called before and after a binary operation.
     **/
    binaryPre = function (iid, op, left, right) {
        console.log(this.hookToString('binaryPre', {iid, op, left, right}));
        // return {op: op, left: left, right: right, skip: false};
    };
    binary = function (iid, op, left, right, result) {
        console.log(this.hookToString('binary', {iid, op, left, right, result}));
        return {result: result};
    };

    /**
     * These callbacks are called before and after a unary operation.
     **/
    unaryPre = function (iid, op, left) {
        console.log(this.hookToString('unaryPre', {iid, op, left}))
        // return {op: op, left: left, skip: false};
    };
    unary = function (iid, op, left, result) {
        console.log(this.hookToString('unary', {iid, op, left, result}))
        // return {result: result};
    };

    /**
     * This callback is called after a conditional expression has been evaluated
     **/
    conditional = function (iid, result) {
        console.log(this.hookToString('conditional', {iid, result}));
        return {result: result};
    };

    /**
     * The callbacks are called before and after an expression
     * @param iid {integer} source code location id
     * @param type {string} type of the expression, TODO: use some standard type names, e.g., ESTree
     * @param result {} the execution result of the expression
     **/
    startExpression = function (iid, type) {
        console.log(this.hookToString('startExpression', {iid, type}));
        this.depth++;
    };

    endExpression = function (iid, type, result) {
        this.depth--;
        console.log(this.hookToString('endExpression', {iid, type, result}));
    };

    /**
     * This callback is called when an execution terminates in node.js.
     **/
    endExecution = function () {
        console.log(this.hookToString('endExecution'));
    };

    //for callbacks that are new or different from Jalangi
    // var extraFeatures = true;
    // if (extraFeatures) {
    /**
     *  These callbacks are called before and after code is executed by eval.
     **/
    evalPre = function (iid, str) {
    };
    evalPost = function (iid, str, ret) {
    };

    /**
     *  These callabcks are called before and after body of functions defined with the Function constructor are executed.
     **/
    evalFunctionPre = function (args) {
    };
    evalFunctionPost = function (args, ret, exceptionVal) {
    };

    /**
     * This callback is called when new source code is encountered during instrumentation.
     *
     * @ param {object} source - object describing the source. contains {string} name and {boolean} internal properties.
     * @ param {string} code - the source code text.
     **/
    newSource = function (source, code) {
    };

    /**
     *  Declaration of a symbol, type can be `'const', 'let', 'var'`, kind is `'FunctionDeclaration'` or `undefined`.
     *  Jalangi version: declare = function (iid, name, val, isArgument, argumentIndex, isCatchParam) {
     **/
    declarePre = function (iid, name, type, kind) {
        console.log(this.hookToString('declarePre', {iid, name, type, kind}));
    };
    declare = function (iid, name, type, kind) {
        console.log(this.hookToString('declare', {iid, name, type, kind}));
    };

    /**
     * Callbacks triggered before and after an expression.
     * Note that callback behavior may depend on Graal.js internals and NodeProf cannot guarantee that type values will
     * remain stable over time.
     *
     * @param iid {integer} source code location id
     * @param type {string} Graal.js internal AST type of the expression
     **/
    // startExpression = function (iid, type) {
    //     console.log(this.hookToString('startExpression', {iid, type}));
    // };
    // endExpression = function (iid, type) {
    //     console.log(this.hookToString('endExpression', iid, type));
    // };

    /**
     * Callbacks triggered before and after a statement.
     * Note that callback behavior may depend on Graal.js internals and NodeProf cannot guarantee that type values will
     * remain stable over time.
     *
     * @param iid {integer} source code location id
     * @param type {string} Graal.js internal AST type of the stamenent
     **/
    startStatement = function (iid, type) {
        console.log(this.hookToString('startStatement', {iid, type}));
        this.depth++;
    };
    endStatement = function (iid, type) {
        this.depth--;
        console.log(this.hookToString('endStatement', {iid, type}));
    };

    /**
     *  forin or forof support
     *  the object being iterated can be known by checking the last expression's result (via endExpression)
     **/
    forObject = function (iid, isForIn) {
        console.log(this.hookToString('forObject', {iid, isForIn}));
    }

    /**
     * This callback is called before a value is returned from a function using the <tt>return</tt> keyword.
     *
     * This does NOT mean the function is being exited. Functions can return 0, 1, or more times.
     * For example:
     * - <tt>void</tt> functions return 0 times
     * - functions that use the <tt>return</tt> keyword regularly return 1 time
     * - functions that return in both parts of a try/finally block can return 2 times
     *
     * To see when a function ACTUALLY exits, see the <tt>functionExit</tt> callback.
     *
     * @param {number} iid - Static unique instruction identifier of this callback
     * @param {*} val - Value to be returned
     */
    _return = function (iid, val) {
        console.log(this.hookToString('_return', {iid, val}));
    };

    asyncFunctionEnter = function (iid) {
        console.log(this.hookToString('asyncFunctionEnter', {iid}));
    }
    asyncFunctionExit = function (iid, result, exceptionVal) {
        console.log(this.hookToString('asyncFunctionExit', {iid, result, exceptionVal}));
    }
    awaitPre = function (iid, promiseOrValAwaited) {
        console.log(this.hookToString('awaitPre', {iid, promiseOrValAwaited}));
    }
    awaitPost = function (iid, promiseOrValAwaited, valResolveOrRejected, isPromiseRejected) {
        console.log(this.hookToString('awaitPost', {
            iid,
            promiseOrValAwaited,
            valResolveOrRejected,
            isPromiseRejected
        }));
    }

    // }

    // if(false) {
    //     // replaced with forObject including support for forin and forof
    //     forinObject = function (iid, val) {
    //     };
    //
    //     //not supported yet
    //     _throw = function (iid, val) {
    //     };
    //
    //     //not supported yet
    //     _with = function (iid, val) {
    //     };
    //
    //     //not supported yet
    //     scriptEnter = function (iid, instrumentedFileName, originalFileName) {
    //     };
    //
    //     //not supported yet
    //     scriptExit = function (iid, wrappedExceptionVal) {
    //     };
    //
    //     //not supported yet
    //     runInstrumentedFunctionBody = function (iid, f, functionIid, functionSid) {
    //     };
    //
    //     //not supported yet
    //     onReady = function (cb) {
    //         cb();
    //     };
    //
    //     //not supported yet
    //     instrumentCodePre = function (iid, code, isDirect) {
    //     };
    //
    //     //not supported yet
    //     instrumentCode = function (iid, newCode, newAst, isDirect) {
    //     };
    // }

    hookToString(hookName, args) {
        const argStrings = [];
        for (const argName in args) {
            try {
                argStrings.push(`${argName}: ${typeof args[argName] === 'function' ? args[argName].name : args[argName]}`);
            } catch (e) {
                return argStrings.push(`${argName}: ERROR`);
            }
        }
        return '  '.repeat(this.depth) + `${hookName}(${argStrings.join(', ')})`;
    }
}


module.exports = LogAnalysis;
