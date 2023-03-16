// DO NOT INSTRUMENT

const {createCodeFlow} = require('./taint-val');

const builtins = new Map([
    [
        Array.prototype.join,
        (iid, result, arr, f, args) => {
            const taintArg = arr.find(arg => arg?.__taint);
            if (!taintArg) return null;

            taintArg.__type = 'string';
            const cf = createCodeFlow(iid, 'functionArgResult', 'join')
            return taintArg.__copyTaint(result, cf, 'string', false);
        }
    ]
]);

const nodeJsFns = new Map([]);

function emulateBuiltin(iid, result, target, f, args) {
    const builtin = builtins.get(f);
    return builtin ? builtin(iid, result, target, f, args) : null;
}

function emulateNodeJs(iid, result, target, f, args) {
    const nodeFn = nodeJsFns.get(f);
    return nodeFn ? nodeFn(iid, result, target, f, args) : result;
}

module.exports = {emulateBuiltin, emulateNodeJs}