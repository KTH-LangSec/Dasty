// DO NOT INSTRUMENT

const TaintAnalysis = require('./analysis/taint-analysis');
const fs = require('fs');
const {getSinkBlacklist} = require('./utils/utils');
const {DEFAULT_CHECK_DEPTH} = require("./conf/analysis-conf");
const {writeFlows, writeTaints} = require("./utils/result-handler");

// function run() {
const blacklistFilepath = __dirname + '/conf/sink-blacklist.json';

const ts = Date.now();
const pkgName = J$.initParams.pkgName ?? null;

let resultFilename = J$.initParams.resultFilename ?? (pkgName ? __dirname + `/results/${pkgName}` : null);
let branchedOnFilename = null;
let taintsFilename = null;
if (resultFilename) {
    branchedOnFilename = resultFilename + `-branched-on-${ts}.json`;
    taintsFilename = resultFilename + `-taints-${ts}.json`;
    resultFilename += `-${ts}.json`;
}
let forceBranches = null;
if (J$.initParams.forceBranchesFilename) {
    const forceBranchesArr = JSON.parse(fs.readFileSync(J$.initParams.forceBranchesFilename, {encoding: "utf8"}));
    forceBranches = new Map(forceBranchesArr);
}

const writeOnDetect = J$.initParams.writeOnDetect ?? false;

let propBlacklist = null;
if (J$.initParams.propBlacklist) {
    propBlacklist = JSON.parse(fs.readFileSync(J$.initParams.propBlacklist, {encoding: 'utf8'}));
}

const recordAllFunCalls = J$.initParams.recordAllFunCalls ?? false;
const injectForIn = J$.initParams.recordAllFunCalls ?? false;

function executionDone(allTaintValues, err) {
    const flows = analysis.flows;

    console.log(flows.length > 0 ? flows.length + " flows found" : "No flows found");

    if (!writeOnDetect && resultFilename) {
        if (flows.length > 0) writeFlows(flows, resultFilename);

        if (analysis.branchedOn.size > 0) {
            fs.writeFileSync(branchedOnFilename, JSON.stringify(Array.from(analysis.branchedOn.values())), {encoding: 'utf8'});
        }
    }

    // only write taints when recordAllFunCalls is set
    if (recordAllFunCalls && taintsFilename) {
        writeTaints(allTaintValues, taintsFilename);
    }
}

const analysis = new TaintAnalysis(
    pkgName,
    getSinkBlacklist(blacklistFilepath),
    propBlacklist,
    writeOnDetect ? resultFilename : null,
    writeOnDetect ? branchedOnFilename : null,
    executionDone,
    forceBranches,
    recordAllFunCalls,
    injectForIn
);

J$.addAnalysis(analysis);