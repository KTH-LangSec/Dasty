// DO NOT INSTRUMENT

const builtinModules = require('node:module').builtinModules;
const TaintAnalysis = require('./analysis/taint-analysis');
const fs = require('fs');
const {getSinkBlacklist} = require('./utils/utils');
const resultHandler = require('./utils/result-handler');
const path = require('path');

function executionDone(flows, resultPath) {
    console.log(flows.length > 0 ? "Flows found" : "No flows found");
    resultHandler.writeFlowsToFile(flows, resultPath);
}

const blacklistFilepath = __dirname + '/conf/sink-blacklist.json';

const pkgName = J$.initParams.pkgName ?? null;
const resultPath = J$.initParams.resultPath ?? __dirname + `/results/${pkgName ?? 'result'}.json`;

const analysis = new TaintAnalysis(pkgName, getSinkBlacklist(blacklistFilepath), flows => executionDone(flows, resultPath));

J$.addAnalysis(analysis);