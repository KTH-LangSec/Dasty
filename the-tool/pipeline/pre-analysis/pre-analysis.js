// DO NOT INSTRUMENT
const {isBuiltin} = require('node:module');
const {iidToLocation} = require("../../taint-analysis/utils/utils");

class PreAnalysis {
    builtinDependencies = [];

    constructor(pkgName, executionDone) {
        this.pkgName = pkgName;
        this.executionDone = executionDone;
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
        if (f?.name === 'require' && isBuiltin(args[0]) && !iidToLocation(iid).includes('node_modules/')) {
            this.builtinDependencies.push(args[0]);
        }
    };

    uncaughtException = (err, origin) => {
    }

    endExecution = () => {
        if (this.executionDone) {
            this.executionDone();
        }
    }

    getField = (iid, base, offset, val, isComputed, isOpAssign, isMethodCall, scope) => {
        // replace execPath which is often used to spawn a node child process
        if (offset === 'execPath') {
            return {result: __dirname + '../node-wrapper/node'};
        }
    }
}

module.exports = PreAnalysis;