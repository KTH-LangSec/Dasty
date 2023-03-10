// DO NOT INSTRUMENT

const fs = require('fs');
const {parseIID} = require("./utils");

const resultHandler = {
    writeFlowsToFile(flows, resultPath) {
        if (!flows || flows.length === 0) return;

        flows.forEach(flow => {
            flow.source = parseIID(flow.source);
            flow.entryPoint.iid = parseIID(flow.entryPoint.iid);
            flow.sink.iid = parseIID(flow.sink.iid);
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

