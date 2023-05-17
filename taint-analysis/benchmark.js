// DO NOT INSTRUMENT

const BenchmarkAnalysis = require('./analysis/benchmark-analysis');

function runAnalysis(sandbox) {
    sandbox.addAnalysis(new BenchmarkAnalysis());
}

// console.log = () => {};

runAnalysis(J$);