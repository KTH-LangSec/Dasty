// DO NOT INSTRUMENT

const {createModuleWrapper} = require("../../analysis/module-wrapper");

class Analysis {
    // an object that keeps track of the current entry point (is updated by the module wrapper object)
    entryPointObj = {entryPoint: []};

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) => {
        if (f?.name !== 'require' || f?.toString() !== require.toString()) return;

        const wrapper = createModuleWrapper(result, 'mock-module', this.entryPointObj);
        return {result: wrapper};
    };

    getField = (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) => {
        if (val === undefined) {
            console.log('undefinedPropRead', this.entryPointObj.entryPoint);
        }
    };

    endExecution = () => {
        // console.log(this.entryPointObj.entryPoint);
    }
}


module.exports = Analysis;
