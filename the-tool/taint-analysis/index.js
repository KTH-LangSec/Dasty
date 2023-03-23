// DO NOT INSTRUMENT

const TaintAnalysis = require('./analysis/taint-analysis');
const fs = require('fs');
const {getSinkBlacklist} = require('./utils/utils');
const resultHandler = require('./utils/result-handler');

// function run() {
const blacklistFilepath = __dirname + '/conf/sink-blacklist.json';

const pkgName = J$.initParams.pkgName ?? null;
const resultFilename = J$.initParams.resultFilename ?? __dirname + `/results/${pkgName ?? 'result'}`;

let propBlacklist = null;
if (J$.initParams.propBlacklist) {
    propBlacklist = JSON.parse(fs.readFileSync(J$.initParams.propBlacklist, {encoding: 'utf8'}));
}

function executionDone(err) {
    const flows = analysis.flows;

    console.log(flows.length > 0 ? flows.length + " flows found" : "No flows found");
    const ts = Date.now();
    resultHandler.writeFlowsToFile(flows, `${resultFilename}-${ts}.json`);
    if (err !== undefined && analysis.lastReadTaint) {
        resultHandler.writeCrashReport(analysis.lastReadTaint, err, resultFilename ? `${resultFilename}-${ts}-crash-report.json` : null);
    }
}

const analysis = new TaintAnalysis(
    pkgName,
    getSinkBlacklist(blacklistFilepath),
    propBlacklist,
    resultFilename, // for the child process runs
    executionDone
);

J$.addAnalysis(analysis);