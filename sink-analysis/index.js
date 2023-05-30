// DO NOT INSTRUMENT

const fs = require('fs');
const SinkAnalysis = require('./sink-analysis');
const {sanitizePkgName} = require("../pipeline/utils/utils");

const pkgName = J$.initParams.pkgName ?? 'result';

const ts = Date.now();
const resultFilepath = `${__dirname}/results/${sanitizePkgName(pkgName)}-${ts}.json`;
const processResultPath = __dirname + '/../pipeline/node-wrapper/exec-result.txt'; // writes a status for the node wrapper

const analysis = new SinkAnalysis(pkgName, resultFilepath, err => {
    const execStatus = err ? `UncaughtException:${err.name ?? 'undefined'}` : 'success';
    fs.writeFileSync(processResultPath, execStatus, {encoding: 'utf8'});

    console.log(analysis.sinks.length + ' sinks found');
});

J$.addAnalysis(analysis);