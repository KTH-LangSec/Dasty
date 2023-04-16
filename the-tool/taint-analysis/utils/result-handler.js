// DO NOT INSTRUMENT

const fs = require('fs');
const {parseIID, iidToLocation} = require("./utils");

/**
 * Helper function that parses an iid and attaches the information to the passed object
 * @returns a new object containing parsedIID information as well as all other properties from the original object
 */
function replaceIID(obj) {
    // skip if already parsed or no iid
    if (!obj?.iid || obj?.location) {
        return obj;
    }

    const {iid, ...rest} = obj;
    return {...parseIID(iid), ...rest};
}

/**
 * Parses and writes flows (does not remove duplicates)
 */
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

/**
 * Adds flows to 'flows' and writes 'flows' to 'resultPath' (if specified). Only writes unique flows
 * Add new unique flows of 'flowsToAdd' to flows as a side effect and extends processedFlows
 * @param flowsToAdd the flows that should be added
 * @param flows an array of all flows that are written
 * @param processedFlows a map of already processed flows that should not be added
 * @param resultPath
 */
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

/**
 * Removes all flows that are either duplicate or are already contained in processed flows
 * Updates processedFlows as a side effect
 * Flows are considered duplicates when the source and the sink is equivalent
 * @param flows the flows that should be de-duplicated
 * @param processedFlows flows that are considered duplicates (empty by default)
 * @param resultPath the path to write the flows to (if not set, writing is skipped)
 * @returns an array of unique flows
 */
function removeDuplicateFlows(flows, processedFlows = new Map(), resultPath = null) {
    if (!flows || flows.length === 0) return flows;

    // remove duplicates flows by checking sources and sinks
    flows = flows.filter(flow => {
        // const jsonString = JSON.stringify(flow);
        try {
            if (processedFlows.get(flow.source.iid)?.includes(flow.sink.iid)) {
                return false;
            } else {
                if (!processedFlows.has(flow.source.iid)) {
                    processedFlows.set(flow.source.iid, []);
                }
                processedFlows.get(flow.source.iid).push(flow.sink.iid);
                return true;
            }
        } catch (e) {
            console.log(flow);
            throw e;
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

/**
 * Adds branching information to 'branchedOn' and optionally writes it to the resultPath (if given)
 */
function addAndWriteBranchedOn(propName, iid, result, branchedOn, resultPath = undefined) {
    if (branchedOn.has(iid)) return;

    branchedOn.set(iid, {prop: propName, loc: iidToLocation(iid), result});
    if (resultPath) {
        fs.writeFileSync(resultPath, JSON.stringify(Array.from(branchedOn.values())), {encoding: 'utf8'});
    }
}

function removeDuplicateTaints(taints) {
    const processedTaints = new Map();

    return taints.filter(taint => {
        // taint values are considered duplicates if the source and the last code flow are equivalent
        if (taint.codeFlow.length === 0 || processedTaints.get(taint.source.iid)?.includes(taint.codeFlow[taint.codeFlow.length - 1].iid)) {
            return false;
        } else {
            if (!processedTaints.has(taint.source.iid)) {
                processedTaints.set(taint.source.iid, []);
            }
            if (taint.codeFlow.length > 0) {
                processedTaints.get(taint.source.iid).push(taint.codeFlow[taint.codeFlow.length - 1].iid);
            }
            return true;
        }
    });
}

/**
 * Writes the parsed and de-duplicated taints of the given taintValues
 */
function writeTaints(taintValues, resultPath) {
    if (!resultPath) return;

    const taints = removeDuplicateTaints(taintValues.map(t => t.__taint));

    taints.forEach(taint => {
        taint.source = replaceIID(taint.source);
        taint.entryPoint = replaceIID(taint.entryPoint);
        taint.codeFlow?.forEach((cf, index) => {
            taint.codeFlow[index] = replaceIID(cf);
        });
    });

    fs.writeFileSync(resultPath, JSON.stringify(taints), {encoding: 'utf8'});
}

module.exports = {
    writeFlows,
    addAndWriteFlows,
    removeDuplicateFlows,
    writeCrashReport,
    addAndWriteBranchedOn,
    writeTaints,
    removeDuplicateTaints
};

