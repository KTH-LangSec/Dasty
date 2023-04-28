// DO NOT INSTRUMENT

const fs = require('fs');
const PreAnalysis = require('./pre-analysis');
const {sanitizePkgName} = require("../utils/utils");

const pkgName = J$.initParams.pkgName ?? 'result';

const resultListPath = __dirname + '/../package-data/';
const resultPath = __dirname = '/results/';

const analysis = new PreAnalysis(pkgName, (err) => {

    if (err) {
        fs.appendFileSync(`${resultListPath}/err-packages.txt`, pkgName + '\n', {encoding: 'utf8'});
    }

    if (analysis.builtinDependencies.length === 0) {
        fs.appendFileSync(`${resultListPath}/frontend-packages.txt`, pkgName + '\n', {encoding: 'utf8'});
        return;
    }

    fs.appendFileSync(`${resultListPath}/nodejs-packages.txt`, pkgName + '\n', {encoding: 'utf8'});

    const resultFilename = `${resultPath}/${sanitizePkgName(pkgName)}.json`;
    const dependencies = analysis.builtinDependencies;
    if (fs.existsSync(resultFilename)) {
        dependencies.push(...JSON.parse(fs.readFileSync(resultFilename, {encoding: 'utf8'})));
    }
    fs.writeFileSync(
        resultFilename,
        JSON.stringify(Array.from(new Set(dependencies))),
        {encoding: 'utf8'}
    );
});

J$.addAnalysis(analysis);