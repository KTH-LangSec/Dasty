// DO NOT INSTRUMENT

const TaintAnalysis = require('./analysis/taint-analysis');
const fs = require('fs');
const {getSinkBlacklist} = require('./utils/utils');
const resultHandler = require('./utils/result-handler');
const {DEFAULT_CHECK_DEPTH} = require("./conf/analysis-conf");

// function run() {
const blacklistFilepath = __dirname + '/conf/sink-blacklist.json';

const ts = Date.now();
const pkgName = J$.initParams.pkgName ?? null;
let resultFilename = J$.initParams.resultFilename ?? (pkgName ? __dirname + `/results/${pkgName}` : null);
if (resultFilename) {
    resultFilename += `-${ts}.json`;
}
const forceBranchProp = J$.initParams.forceBranchProp ?? null;

let propBlacklist = null;
if (J$.initParams.propBlacklist) {
    propBlacklist = JSON.parse(fs.readFileSync(J$.initParams.propBlacklist, {encoding: 'utf8'}));
}

function executionDone(err) {
    const flows = analysis.flows;

    console.log(flows.length > 0 ? flows.length + " flows found" : "No flows found");

    // ToDo - might be better to move to pipeline
    resultHandler.removeDuplicateFlows(flows, resultFilename);
}

const analysis = new TaintAnalysis(
    pkgName,
    getSinkBlacklist(blacklistFilepath),
    propBlacklist,
    resultFilename,
    executionDone,
    forceBranchProp
);

J$.addAnalysis(analysis);