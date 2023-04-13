// DO NOT INSTRUMENT

const fs = require('fs');
const {parseIID, iidToLocation} = require("./utils");

function replaceIID(obj) {
    // skip if already parsed or invalid iid
    if (!obj?.iid || obj?.location) {
        return obj;
    }

    const {iid, ...rest} = obj;
    return {...parseIID(iid), ...rest};
}

function writeFlows(flows, resultPath) {
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
        console.log(`Results written to ${resultPath}`);
    } else {
        console.log(JSON.stringify(flows));
    }
}

function addAndWriteFlows(flowsToAdd, flows, processedFlows = null, resultPath = null) {
    if (processedFlows) {
        flowsToAdd = removeDuplicateFlows(flowsToAdd, processedFlows);
    }

    if (flowsToAdd.length === 0) return;

    flows.push(...flowsToAdd);

    // only parse and write if resultPath is set
    if (resultPath) {
        flowsToAdd.forEach(flow => {
            flow.source = replaceIID(flow.source);
            flow.entryPoint = replaceIID(flow.entryPoint);
            flow.codeFlow?.forEach((cf, index) => {
                flow.codeFlow[index] = replaceIID(cf);
            });
            flow.sink = replaceIID(flow.sink);
        });

        fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
    }
}

function removeDuplicateFlows(flows, processedFlows = new Map(), resultPath = null) {
    if (!flows || flows.length === 0) return flows;

    // remove duplicates flows by checking sources and sinks
    flows = flows.filter(flow => {
        // const jsonString = JSON.stringify(flow);
        if (processedFlows.get(flow.source.iid)?.includes(flow.sink.iid)) {
            return false;
        } else {
            if (!processedFlows.has(flow.source.iid)) {
                processedFlows.set(flow.source.iid, []);
            }
            processedFlows.get(flow.source.iid).push(flow.sink.iid);
            return true;
        }
    });

    if (resultPath) {
        console.log(flows.length + ' are unique');
        fs.writeFileSync(resultPath, JSON.stringify(flows), {encoding: 'utf8'});
    }
    return flows;
}

function writeCrashReport(taint, err, filename) {
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

function addAndWriteBranchedOn(propName, iid, result, branchedOn, resultPath) {
    if (branchedOn.has(iid)) return;

    branchedOn.set(iid, [iidToLocation(iid), result]);
    if (resultPath) {
        fs.writeFileSync(resultPath, JSON.stringify(branchedOn), {encoding: 'utf8'});
    }
}

module.exports = {writeFlows, addAndWriteFlows, removeDuplicateFlows, writeCrashReport, addAndWriteBranchedOn};

