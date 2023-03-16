// DO NOT INSTRUMENT

const {createCodeFlow} = require('./taint-val');
const url = require('url');

const builtins = new Map([
    [
        Array.prototype.join,
        (iid, result, arr, f, args) => {
            const taintArg = arr.find(arg => arg?.__taint);
            if (!taintArg) return null;

            taintArg.__type = 'string';
            const cf = createCodeFlow(iid, 'functionArgResult', 'join');
            return taintArg.__copyTaint(result, cf, 'string', false);
        }
    ]
]);

const nodeJsFns = new Map();
nodeJsFns.set(
    'node:url',
    new Map([
        [
            url.parse,
            (iid, result, target, f, args) => {
                if (!args[0].__taint) return null;

                const cf = createCodeFlow(iid, 'functionArgResult', 'parse');
                return args[0].__copyTaint(result, cf, 'string', false);
            }
        ], [
            url.format,
            (iid, result, target, f, args) => {
                if (!args[0].__taint) return null;

                const cf = createCodeFlow(iid, 'functionArgResult', 'parse');
                return args[0].__copyTaint(result, cf, 'string', false);
            }
        ]
    ]));

function emulateBuiltin(iid, result, target, f, args) {
    const builtin = builtins.get(f);
    return builtin ? builtin(iid, result, target, f, args) : null;
}

function emulateNodeJs(module, iid, result, target, f, args) {
    const nodeFn = nodeJsFns.get(module)?.get(f);
    return nodeFn ? nodeFn(iid, result, target, f, args) : null;
}

module.exports = {emulateBuiltin, emulateNodeJs}