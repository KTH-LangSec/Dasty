// DO NOT INSTRUMENT

const fs = require("fs");
const {MAX_UNWRAP_DEPTH} = require("../conf/analysis-conf");

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
        // iid,
        location,
        // filename: sourceObject.name,
        code
    };
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

function checkTaintDeep(arg, depth = 0, done = []) {
    if (!arg || depth > MAX_UNWRAP_DEPTH) return [];

    if (arg.__taint) {
        return [arg.__taint, ...checkTaintDeep(arg.valueOf())];
    }

    if (typeof arg !== 'object' && typeof arg !== 'function') return [];

    if (arg instanceof Array) {
        return arg.flatMap(a => checkTaintDeep(a, ++depth, done));
    } else if (arg instanceof Set) {
        return Array.from(arg, a => checkTaintDeep(a, done)).flat();
    } else if (arg instanceof Map) {
        return Array.from(arg, ([key, val]) => [...checkTaintDeep(key, ++depth, done), ...checkTaintDeep(val, ++depth, done)]).flat();
        // ToDo - other built-in objects?
    } else {
        const taints = [];
        for (const prop in arg) {
            let propVal;
            try {
                propVal = arg[prop];
            } catch (e) {
                // getter problem
                continue;
            }

            if (done.includes(propVal)) continue;

            done.push(propVal);
            taints.push(...checkTaintDeep(propVal, ++depth, done));
        }
        return taints;
    }
}

function unwrapDeep(arg, depth = 0, done = []) {
    if (!arg || depth > MAX_UNWRAP_DEPTH) return arg;

    if (arg.__taint) {
        return unwrapDeep(arg.valueOf());
    }

    if (typeof arg !== 'object' && typeof arg !== 'function') return arg;

    if (arg instanceof Array) {
        return arg.map(a => unwrapDeep(a, ++depth, done));
    } else if (arg instanceof Set) {
        return new Set(Array.from(arg, a => unwrapDeep(a, ++depth, done)));
    } else if (arg instanceof Map) {
        return new Map(Array.from(arg, ([key, val]) => [unwrapDeep(key, ++depth, done), unwrapDeep(val, ++depth, done)]));
        // ToDo - other built-in objects?
    } else {
        for (const prop in arg) {
            let propVal;
            try {
                propVal = arg[prop];
            } catch (e) {
                // getter problem
                continue;
            }

            if (done.includes(propVal)) continue;

            done.push(propVal);

            arg[prop] = unwrapDeep(propVal, ++depth, done);
        }
        return arg;
    }
}

module.exports = {
    iidToLocation,
    iidToSourceObject,
    iidToCode,
    parseIID,
    extractFunctionNames,
    extractFunctions,
    getSinkBlacklist,
    checkTaintDeep,
    unwrapDeep
}