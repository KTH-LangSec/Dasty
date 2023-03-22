// DO NOT INSTRUMENT

const fs = require('fs');
const PreAnalysis = require('./pre-analysis');

const pkgName = J$.initParams.pkgName ?? 'result';

const resultPath = __dirname + '/results';

const analysis = new PreAnalysis(pkgName, () => {
    if (analysis.builtinDependencies.length === 0) {
        fs.appendFileSync(`${resultPath}/frontend-modules.txt`, pkgName + '\n', {encoding: 'utf8'});
        return;
    }

    fs.appendFileSync(`${resultPath}/nodejs-modules.txt`, pkgName + '\n', {encoding: 'utf8'});

    const resultFilename = `${resultPath}/${pkgName}.json`;
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