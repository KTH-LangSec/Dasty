// DO NOT INSTRUMENT

const builtinModules = require('node:module').builtinModules;
const TaintAnalysis = require('./analysis/taint-analysis');
const fs = require('fs');
const {getSinkBlacklist} = require('./utils/utils');
const resultHandler = require('./utils/result-handler');
const path = require('path');

function executionDone(flows, resultPath) {
    console.log(flows.length > 0 ? flows.length + " flows found" : "No flows found");
    resultHandler.writeFlowsToFile(flows, resultPath);
}

const blacklistFilepath = __dirname + '/conf/sink-blacklist.json';

const pkgName = J$.initParams.pkgName ?? null;
const resultFilename = J$.initParams.resultFilename ?? __dirname + `/results/${pkgName ?? 'result'}.json`;

const analysis = new TaintAnalysis(pkgName, getSinkBlacklist(blacklistFilepath), resultFilename, flows => executionDone(flows, resultFilename));

J$.addAnalysis(analysis);

require('module').runMain();