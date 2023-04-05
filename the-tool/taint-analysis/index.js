// DO NOT INSTRUMENT

const TaintAnalysis = require('./analysis/taint-analysis');
const fs = require('fs');
const {getSinkBlacklist} = require('./utils/utils');
const {DEFAULT_CHECK_DEPTH} = require("./conf/analysis-conf");
const {writeFlows} = require("./utils/result-handler");

// function run() {
const blacklistFilepath = __dirname + '/conf/sink-blacklist.json';

const ts = Date.now();
const pkgName = J$.initParams.pkgName ?? null;
let resultFilename = J$.initParams.resultFilename ?? (pkgName ? __dirname + `/results/${pkgName}` : null);
let branchedOnFilename = null;
if (resultFilename) {
    branchedOnFilename = resultFilename + `-branched-on-${ts}.json`;
    resultFilename += `-${ts}.json`;
}
const forceBranchProp = J$.initParams.forceBranchProp ?? null;
const writeOnDetect = J$.initParams.writeOnDetect ?? false;

let propBlacklist = null;
if (J$.initParams.propBlacklist) {
    propBlacklist = JSON.parse(fs.readFileSync(J$.initParams.propBlacklist, {encoding: 'utf8'}));
}

function executionDone(err) {
    const flows = analysis.flows;

    console.log(flows.length > 0 ? flows.length + " flows found" : "No flows found");

    if (!writeOnDetect) {
        writeFlows(flows, resultFilename);
        if (analysis.branchedOn.length > 0) {
            fs.writeFileSync(branchedOnFilename, JSON.stringify(analysis.branchedOn), {encoding: 'utf8'});
        }
    }
}

const analysis = new TaintAnalysis(
    pkgName,
    getSinkBlacklist(blacklistFilepath),
    propBlacklist,
    writeOnDetect ? resultFilename : null,
    writeOnDetect ? branchedOnFilename : null,
    executionDone,
    forceBranchProp
);

J$.addAnalysis(analysis);