// DO NOT INSTRUMENT

const {isBuiltin} = require('node:module');
const {iidToLocation} = require("../../taint-analysis/utils/utils");

const MODULE_EXCEPTION = ['node:assert']; // These are not sufficient for a package to be regarded 'node.js'

class PreAnalysis {
    builtinDependencies = [];

    constructor(pkgName, executionDone) {
        this.pkgName = pkgName;
        this.executionDone = executionDone;
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
        // if (f?.name === 'require' && isBuiltin(args[0]) && !iidToLocation(iid).includes('node_modules/')) {
        //     this.builtinDependencies.push(args[0]);
        // } else
        if (functionScope?.startsWith('node:') && !MODULE_EXCEPTION.includes(functionScope) && !iidToLocation(iid).includes('node_modules/')) {
            const prefixLength = 'node:'.length;
            this.builtinDependencies.push(functionScope.substring(prefixLength));
        }
    };

    uncaughtException = (err, origin) => {
        if (this.executionDone) {
            this.executionDone(err);
            this.executionDone = null;
        }
    }

    endExecution = () => {
        if (this.executionDone) {
            this.executionDone();
        }
    }
}

module.exports = PreAnalysis;