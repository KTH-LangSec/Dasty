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
    writeFlows(flows, resultPath) {
        flows.forEach(flow => {
            flow.source = replaceIID(flow.source);
            flow.entryPoint = replaceIID(flow.entryPoint);
            flow.codeFlow?.forEach((cf, index) => {
                flow.codeFlow[index] = replaceIID(cf);
            });
            flow.sink = replaceIID(flow.sink);
        });

        if (resultPath) {
            fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
        }
    },

    addAndWriteFlows(flowsToAdd, flows, resultPath) {
        // flowsToAdd.forEach(flow => {
        //     flow.source = replaceIID(flow.source);
        //     flow.entryPoint = replaceIID(flow.entryPoint);
        //     flow.codeFlow?.forEach((cf, index) => {
        //         flow.codeFlow[index] = replaceIID(cf);
        //     });
        //     flow.sink = replaceIID(flow.sink);
        // });

        flows.push(...flowsToAdd);

        // if (resultPath) {
        // fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
        // } else {
        // console.log('New flows: ' + JSON.stringify(flowsToAdd));
        // }
    },

    removeDuplicateFlows(flows, resultPath) {
        if (!flows || flows.length === 0) return flows;

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

        if (resultPath) {
            console.log(flows.length + ' are unique');
            fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
        }
        return flows;
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
    }
}

module.exports = resultHandler;

