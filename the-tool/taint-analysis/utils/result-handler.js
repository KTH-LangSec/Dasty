// DO NOT INSTRUMENT

const fs = require('fs');
const {parseIID} = require("./utils");

function replaceIID(obj) {
    if (!obj?.iid) {
        return obj;
    }

    const iid = obj.iid;
    delete obj.iid;

    return {...parseIID(iid), ...obj};
}

const resultHandler = {
    writeFlowsToFile(flows, resultPath) {
        if (!flows || flows.length === 0) return;

        flows.forEach(flow => {
            flow.source = parseIID(flow.source);
            flow.entryPoint = replaceIID(flow.entryPoint);
            flow.codeFlow.forEach((cf, index) => {
                flow.codeFlow[index] = replaceIID(cf);
            });
            flow.sink = replaceIID(flow.sink);
        });

        if (resultPath) {
            fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
            console.log(`Results written to ${resultPath}`);
        } else {
            console.log(JSON.stringify(flows));
        }
    }
}

module.exports = resultHandler;

