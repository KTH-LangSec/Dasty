// DO NOT INSTRUMENT

const fs = require('fs');
const {parseIID} = require("./utils");

function replaceIID(obj) {
    if (!obj?.iid) {
        return obj;
    }

    const {iid, ...rest} = obj;
    return {...parseIID(iid), ...rest};
}

const resultHandler = {
    writeFlowsToFile(flows, resultPath) {
        if (!flows || flows.length === 0) return;

        flows = structuredClone(flows);
        // remove duplicates
        const processed = [];
        flows = flows.filter(flow => {
            const jsonString = JSON.stringify(flow);
            if (processed.includes(jsonString)) {
                return false;
            } else {
                processed.push(jsonString);
                return true;
            }
        });

        // parse iid
        flows.forEach(flow => {
            flow.source = replaceIID(flow.source);
            flow.entryPoint = replaceIID(flow.entryPoint);
            flow.codeFlow.forEach((cf, index) => {
                flow.codeFlow[index] = replaceIID(cf);
            });
            flow.sink = replaceIID(flow.sink);
        });

        console.log(flows.length + ' are unique');

        if (resultPath) {
            fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
            console.log(`Results written to ${resultPath}`);
        } else {
            console.log(JSON.stringify(flows));
        }
    },

    writeCrashReport(taint, err, filename) {
        taint.source = replaceIID(taint.source);
        taint.codeFlow.forEach((cf, index) => {
            taint.codeFlow[index] = replaceIID(cf);
        });

        const report = JSON.stringify({
            lastReadTaint: taint,
            err: err
        })
        if (filename) {
            fs.writeFileSync(filename, report, {encoding: 'utf8'});
            console.log(`Crash report written to ${filename}`);
        } else {
            console.log(report);
        }

        throw err;
    }
}

module.exports = resultHandler;

