// DO NOT INSTRUMENT

const Analysis = require('./analysis');

function runAnalysis(sandbox, log) {
    sandbox.addAnalysis(new Analysis(), {includes: 'tests/module-wrapper/'});
}

// console.log = () => {};

runAnalysis(J$, false);