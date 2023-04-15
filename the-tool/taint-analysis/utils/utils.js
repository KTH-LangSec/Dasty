// DO NOT INSTRUMENT

const fs = require("fs");
const {DEFAULT_UNWRAP_DEPTH, DEFAULT_CHECK_DEPTH} = require("../conf/analysis-conf");

function iidToLocation(iid) {
    return J$.iidToLocation(iid);
}

function iidToSourceObject(iid) {
    return J$.iidToSourceObject(iid);
}

function iidToCode(iid) {
    return J$.iidToCode(iid);
}

function parseIID(iid) {
    // const sourceObject = iidToSourceObject(iid);
    // const location = iidToLocation(iid);
    const src = iidToSourceObject(iid);
    const location = {
        artifact: src.name,
        region: src.loc
    };
    const code = iidToCode(iid);

    return {
        iid,
        location,
        code
    };
}

function hasTaint(obj, depth) {
    return J$.hasTaint(obj, depth);
}

function checkTaints(obj, depth) {
    return J$.checkTaints(obj, depth);
}

/**
 * A function that recursively extracts all function names of an object
 *
 * @param obj - the object from which to extract the functions
 * @param doneList - a list that keeps track of already passed properties to avoid loops
 * @returns {Set<string|Function>} - a set of string or functions
 */
function extractFunctionNames(obj, doneList = []) {
    if (!obj) return new Set();

    doneList.push(obj);

    const functionList = [];

    for (const prop in obj) {
        let propertyVal;
        let propType;
        try {
            propertyVal = obj[prop];
            propType = typeof propertyVal;
        } catch (e) {
            console.log(`Could not get value of property prop ${prop}. It has probably a getter that throws an error.`)
            continue;
        }

        if (!doneList.includes(propertyVal)) {
            if ((propType === 'object' /*|| propType === 'function'*/)) {
                const functions = extractFunctionNames(propertyVal, doneList);
                functionList.push(...functions);
            } else if (propType === 'function') {
                functionList.push(prop);
            }
        }
    }

    return new Set(functionList);
}

/**
 * A function that recursively extracts all functions (the actual function objects instead of just names) of an object
 *
 * @param obj - the object from which to extract the functions
 * @param doneList - a list that keeps track of already passed properties to avoid loops
 * @param execute - optional parameter that specifies if a found function should be tried to be executed to check the resulting object
 * @returns {Set<string|Function>} - a set of string or functions
 */
function extractFunctions(obj, doneList = [], execute = true) {
    if (!obj) return new Map();

    doneList.push(obj);

    let functions = new Map();

    for (const prop in obj) {
        let propertyVal;
        let propType;
        try {
            propertyVal = obj[prop];
            propType = typeof propertyVal;
        } catch (e) {
            console.log(`Could not get value of property prop ${prop}. It has probably a getter that throws an error.`)
            continue;
        }

        if (!doneList.includes(propertyVal)) {
            if ((propType === 'object' /*|| propType === 'function'*/)) {
                const childFunctions = extractFunctions(propertyVal, doneList, execute);
                functions = new Map([...functions, ...childFunctions]);
            } else if (propType === 'function') {
                functions.set(prop, propertyVal);

                // let's try and call the function
                // if (execute) {
                //     try {
                //         console.log('--' + prop);
                //         const ret = propertyVal(...Array(propertyVal.length).fill('x'));
                //         if (typeof ret === 'object' || typeof ret === 'function') {
                //             const childFunctions = extractFunctions(propertyVal, doneList, false);
                //             functions = new Map([...functions, ...childFunctions]);
                //         }
                //     } catch (e) {
                //         // console.log(`Could not call function ${propertyVal.name}(${propertyVal.length}): ${e}`);
                //     }
                // }
            }
        }
    }

    return functions;
}

function getSinkBlacklist(filepath) {
    const blacklist = new Map();
    if (!filepath) return blacklist;

    let fileContents = {};
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        fileContents = JSON.parse(content);
    } catch (e) {
        console.log(`Could not read blacklist file ${filepath}: ${e}`);
        return blacklist;
    }

    for (const moduleName in fileContents) {
        const functions = fileContents[moduleName];
        blacklist.set(`node:${moduleName}`, functions.length > 0 ? new Map(functions.map(f => [f, true])) : null);
    }

    return blacklist;
}

const checkedArgs = new Map();

function checkTaintDeep(arg, depth = DEFAULT_CHECK_DEPTH) {
    // if (checkedArgs.has(arg)) {
    //     return checkedArgs.get(arg);
    // }
    if (!arg || !hasTaint(arg, DEFAULT_CHECK_DEPTH)) return [];

    const taints = [];
    checkTaintDeepRec(arg, depth, taints);
    // checkedArgs.set(arg, taints);
    return taints;
}

function checkTaintDeepRec(arg, depth = DEFAULT_CHECK_DEPTH, taints = [], done = []) {
    if (!arg || depth < 0) return;

    if (typeof arg !== 'object' && typeof arg !== 'function') return;

    if (isTaintProxy(arg)) {
        taints.push(arg);
        // if we found one taint we can stop
        // checkTaintDeepRec(arg.valueOf(), depth - 1, taints, done);
        return;
    }

    if (depth === 0) {
        return;
    }

    if (arg instanceof Array || arg instanceof Set) {
        arg.forEach(a => checkTaintDeepRec(a, depth - 1, taints, done));
    } else if (arg instanceof Map) {
        arg.forEach((val, key) => {
            checkTaintDeepRec(key, depth - 1, taints, done);
            checkTaintDeepRec(val, depth - 1, taints, done);
        });
        // ToDo - other built-in objects?
    } else {
        // for (const prop in arg) {
        for (const prop of Reflect.ownKeys(arg)) {
            if (typeof prop === 'symbol') continue;

            // skip properties with getters
            const descr = Object.getOwnPropertyDescriptor(arg, prop);
            if (descr === undefined || descr.get) {
                continue;
            }

            let propVal;
            try {
                propVal = arg[prop];
            } catch (e) {
                continue;
            }

            // if (done.includes(propVal)) continue;
            // done.push(propVal);

            checkTaintDeepRec(propVal, depth - 1, taints, done);
        }

        if (!isBuiltinProto(arg.__proto__)) {
            checkTaintDeepRec(arg.__proto__, depth, taints, done);
        }
    }
}

function unwrapDeep(arg, depth = DEFAULT_UNWRAP_DEPTH) {
    // if (checkedArgs.get(arg)?.length === 0) {
    //     return arg;
    // }

    // if (!hasTaint(arg, depth)) return arg;

    // Clone the arg because the unwrapping is done in-place
    let argClone = arg;
    try {
        // try to clone - functions are not cloneable (tainted values are functions under the hood)
        if (typeof arg !== "function" || arg.__taint) {
            argClone = structuredClone(arg);
        }
    } catch (e) {
    }

    return unwrapDeepRec(argClone, depth);
}

function unwrapDeepRec(arg, depth = DEFAULT_UNWRAP_DEPTH, done = []) {
    if (!arg || depth < 0) {
        return arg;
    }

    if (isTaintProxy(arg)) {
        return unwrapDeepRec(arg.valueOf(), depth - 1, done);
    }

    if (typeof arg !== 'object' && typeof arg !== 'function') return arg;

    if (arg instanceof Array) {
        // arg.forEach((a, index) => arg[index] = unwrapDeepRec(a, depth - 1, done));
        // return arg;
        return arg.map(a => unwrapDeepRec(a, depth - 1, done));
    } else if (arg instanceof Set) {
        return arg;

        // arg.forEach((a) => {
        //     arg.delete(a);
        //     arg.add(unwrapDeepRec(a, depth - 1, done));
        // });
        // return arg;
    } else if (arg instanceof Map) {
        return new Map(Array.from(arg, ([key, val]) => [unwrapDeepRec(key, depth - 1, done), unwrapDeepRec(val, depth - 1, done)]));
        // ToDo - other built-in objects?
    } else {
        const unwrappedObj = {};
        for (const prop in arg) {
            // for (const prop of Reflect.ownKeys(arg)) {
            let propVal;
            try {
                propVal = arg[prop];
            } catch (e) {
                // getter problem
                continue;
            }

            if (done.includes(propVal)) continue;

            done.push(propVal);

            // unwrappedObj[prop] = unwrapDeepRec(propVal, depth - 1, done);
            arg[prop] = unwrapDeepRec(propVal, depth - 1, done);
        }
        // if (!isBuiltinProto(arg.__proto__)) {
        //     unwrappedObj.__proto__ = unwrapDeepRec(arg.__proto__, depth, done);
        // }
        // return unwrappedObj;
        return arg;
    }
}

function isAnalysisWrapper(obj) {
    try {
        return obj !== null && obj !== undefined
            && (obj.__isAnalysisProxy);
    } catch (e) {
        // this for other proxies (test framework that uses proxies and throws error when undefined properties are accessed)
        return false;
    }
}

function isTaintProxy(obj) {
    try {
        return obj !== null && obj !== undefined
            && typeof obj === 'function'
            && obj.__taint;
    } catch (e) {
        // this for other proxies (test framework that uses proxies and throws error when undefined properties are accessed)
        return false;
    }
}

function taintCompResult(left, right, op) {
    let taintVal;
    let otherVal;
    if (isTaintProxy(left)) {
        taintVal = left.__val;
        otherVal = right;
    } else {
        taintVal = right.__val;
        otherVal = left;
    }
    if (isTaintProxy(otherVal)) {
        // if both are tainted get the value of both
        otherVal = otherVal.__val;
    }

    switch (op) {
        case '===':
            return taintVal === otherVal;
        case '==':
            return taintVal == otherVal;
        case '!==':
            return taintVal !== otherVal;
        case '!=':
            return taintVal != otherVal;
    }
}

function updateAndCheckBranchCounter(branchCounter, loc) {
    branchCounter.set(loc, branchCounter.get(loc) + 1);

    let done = true;
    branchCounter.forEach(c => {
        if (c < 2) {
            done = false;
        }
    });

    if (done) {
        console.log('Done');
        process.exit(0);
    }
}

function isBuiltinProto(proto) {
    return proto === Array.prototype ||
        proto === ArrayBuffer.prototype ||
        proto === {} || //AsyncIterator.prototype
        proto === BigInt.prototype ||
        proto === BigInt64Array.prototype ||
        proto === BigUint64Array.prototype ||
        proto === Boolean.prototype ||
        proto === DataView.prototype ||
        proto === Date.prototype ||
        proto === Error.prototype ||
        proto === EvalError.prototype ||
        proto === Float32Array.prototype ||
        proto === Float64Array.prototype ||
        proto === Function.prototype ||
        proto === Int16Array.prototype ||
        proto === Int32Array.prototype ||
        proto === Int8Array.prototype ||
        proto === Map.prototype ||
        proto === Number.prototype ||
        proto === Object.prototype ||
        proto === RangeError.prototype ||
        proto === ReferenceError.prototype ||
        proto === RegExp.prototype ||
        proto === Set.prototype ||
        proto === String.prototype ||
        proto === Symbol.prototype ||
        proto === SyntaxError.prototype ||
        proto === TypeError.prototype ||
        proto === URIError.prototype ||
        proto === Uint16Array.prototype ||
        proto === Uint32Array.prototype ||
        proto === Uint8Array.prototype ||
        proto === Uint8ClampedArray.prototype ||
        proto === WeakMap.prototype ||
        proto === WeakSet.prototype ||
        proto === Promise.prototype
}

function createInternalFunctionWrapper(iid, f, receiver, isAsync, flows, functionScope) {
    // ToDo - constructors?
    if (!f || (!functionScope?.startsWith('node:')) || f === console.log) return null;
    // if it is an internal function replace it with wrapper function that unwraps taint values
    // ToDo - right now this is done for every internal node function call -> maybe remove e.g. the ones without arguments?
    // ToDo - should the return value be tainted?
    const fName = f.name;

    return (function wrapper(...args) {
        const unwrappedArgs = [];
        const taints = [];
        args.forEach((arg, index) => {
            const argTaints = checkTaints(arg, DEFAULT_CHECK_DEPTH);
            taints.push(argTaints);
            argTaints?.forEach(taintVal => {
                flows.push({
                    ...taintVal.__taint,
                    sink: {
                        iid,
                        type: 'functionCallArg',
                        module: functionScope,
                        functionName: fName,
                        argIndex: index
                    }
                });
            });
            unwrappedArgs.push(argTaints?.length > 0 ? unwrapDeep(arg) : arg);
        });

        try {
            if (new.target) {
                const newTarget = Reflect.getPrototypeOf(this).constructor;
                return Reflect.construct(f, unwrappedArgs, newTarget)
            } else {
                return Reflect.apply(f, this, unwrappedArgs);
            }
        } catch (e) {
            taints.forEach((t, index) => {
                t?.forEach(taintVal => {
                    flows.push({
                        ...taintVal.__taint,
                        sink: {
                            iid,
                            type: 'functionCallArgException',
                            value: e.code + ' ' + e.toString(),
                            argIndex: index,
                            functionName: fName
                        }
                    });
                });
            });
            throw e;
        }
    });
}

module.exports = {
    iidToLocation,
    iidToSourceObject,
    iidToCode,
    parseIID,
    hasTaint,
    checkTaints,
    extractFunctionNames,
    extractFunctions,
    getSinkBlacklist,
    checkTaintDeep,
    unwrapDeep,
    isTaintProxy,
    isAnalysisWrapper,
    createInternalFunctionWrapper,
    taintCompResult,
    updateAndCheckBranchCounter
}