const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
const {exec} = require('child_process');
const fs = require('fs');
const {getDb, closeConnection} = require('./db/conn');
const {ObjectId} = require("mongodb");
const path = require("path");

// const DEFAULT_TIMEOUT = 1 * 60 * 1000;
// const DEFAULT_TIMEOUT = 20000;
const DEFAULT_TIMEOUT = -1;
const MAX_RUNS = 5;

const TAINT_ANALYSIS = __dirname + '/../taint-analysis/';
const PRE_ANALYSIS = __dirname + '/pre-analysis/';
const NPM_WRAPPER = __dirname + '/node-wrapper/npm';
const NODE_WRAPPER = __dirname + '/node-wrapper/node';
const PROP_BLACKLISTS_DIR = __dirname + '/blacklists/';

const PKG_TYPE = {
    NODE_JS: 0,
    FRONTEND: 1
}

const CLI_ARGS = {
    '--out': 1,
    '--outDir': 1,
    '--onlyPre': 0,
    '--sarif': 0,
    '--fromFile': 0,
    '--skipTo': 1,
    '--skipToLast': 0,
    '--force': 0
}

// keywords of packages that are known to be not interesting (for now)
const DONT_ANALYSE = ['react', 'angular', 'vue', 'webpack', 'vite', 'babel', 'gulp', 'bower', 'eslint', '/types', '@type/', 'electron', 'tailwind', 'jest', 'mocha', 'nyc', 'typescript', 'jquery'];

function getCliArg(name, numValues = 1) {
    const index = process.argv.findIndex(arg => arg === `--${name}`);
    return index >= 0 && args.length >= index + numValues ? args.splice(index, numValues + 1) : null;
}

function parseCliArgs() {
    // Set default values (also so that the ide linter shuts up)
    const parsedArgs = {
        out: undefined,
        outDir: undefined,
        onlyPre: false,
        sarif: false,
        fromFile: false,
        skipTo: undefined,
        skipToLast: undefined,
        force: false,
        pkgName: undefined
    };

    // a copy of the args with all parsed args removed
    const trimmedArgv = process.argv.slice();
    let removedArgs = 0;

    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        const expectedLength = CLI_ARGS[arg];

        if (expectedLength === undefined) continue;

        if (process.argv.length <= i + expectedLength) {
            console.log(arg + ' expects ' + expectedLength + ' values');
            process.exit(1);
        }

        // remove leading -
        const argName = arg.replace(/^(-)+/g, '');
        if (expectedLength === 0) {
            parsedArgs[argName] = true;
        } else {
            const values = process.argv.slice(i + 1, i + 1 + expectedLength);
            parsedArgs[argName] = expectedLength === 1 ? values[0] : values;
        }

        trimmedArgv.splice(i - removedArgs, expectedLength + 1);
        removedArgs += expectedLength + 1;

        i += expectedLength;
    }

    // the pkgName (or file) should now be the last (and only) arg
    parsedArgs.pkgName = trimmedArgv.length > 2 ? trimmedArgv[trimmedArgv.length - 1] : null;
    return parsedArgs;
}

function execCmd(cmd, live = false, throwOnErr = true, timeout = DEFAULT_TIMEOUT) {
    console.error(cmd + '\n');

    return new Promise((resolve, reject) => {
        const childProcess = exec(cmd);
        let out = '';
        let err = '';

        let killTimeout;
        const setKillTimout = () => {
            if (timeout === -1 || killTimeout === null) return;

            if (killTimeout) clearTimeout(killTimeout);
            killTimeout = setTimeout(() => {
                console.error('TIMEOUT');

                killTimeout = null;
                childProcess.kill('SIGINT');
            }, timeout);
        };

        setKillTimout();

        childProcess.stdout.on('data', data => {
            if (live) process.stderr.write(data);
            out += data;

            setKillTimout();
        });
        childProcess.stderr.on('data', data => {
            if (live) process.stderr.write(data);

            err += data;

            setKillTimout();
        });

        childProcess.on('close', code => {
            clearTimeout(killTimeout);
            if (code !== 0) {
                if (!live) process.stderr.write(err);
                if (throwOnErr) reject(err);
            }

            resolve(out, err);
        });
    });
}

async function fetchURL(pkgName) {
    let url = (await execCmd(`npm view ${pkgName} repository.url`)).trim();

    if (url.startsWith('git+')) {
        return url.substring(4);
    } else if (url.startsWith('git://')) {
        return 'https' + url.substring(3);
    } else if (url.startsWith('https://')) {
        return url;
    } else {
        console.error('No git repository found');
        return null;
    }
}

function getBin(repoPath, pkgName) {
    const modulePath = `${repoPath}/node_modules/${pkgName}/`;
    if (!fs.existsSync(modulePath)) return null;

    const pkgJson = JSON.parse(fs.readFileSync(modulePath + 'package.json', {encoding: 'utf8'}));
    if (typeof pkgJson?.bin) {
        if (typeof pkgJson.bin === 'string') {
            return modulePath + pkgJson.bin;
        } else if (pkgJson.bin[pkgName]) {
            return modulePath + pkgJson.bin[pkgName];
        }
    }

    return null;
}

function adaptTestScript(script, scripts, repoPath) {
    const argParts = script.trim().split(' ');
    switch (argParts[0]) {
        case 'node':
            return argParts.slice(1).join(' ');
        case 'mocha':
            argParts[0] = './node_modules/mocha/bin/' + (fs.existsSync(repoPath + '/node_modules/mocha/bin/mocha.js') ? 'mocha.js' : 'mocha');
            const bailIndex = argParts.findIndex(a => a === '--bail');
            if (bailIndex >= 0) {
                argParts[bailIndex] = '--exit';
            }
            return argParts.join(' ');
        case 'jest':
            argParts[0] = './node_modules/jest/bin/jest.js'
            return argParts.join(' ');
        case 'npm':
            if (argParts[1] === 'run' && !argParts[2].includes('lint')) {
                return adaptTestScript(scripts[argParts[2]], scripts, repoPath);
            }
            // ignore other npm commands (e.g. audit)
            return null;
        case 'c8':
        case 'nyc':
            return adaptTestScript(argParts.slice(1).join(' '), scripts, repoPath);
        case 'cross-env':
            return `${getBin(repoPath, 'cross-env')} ${argParts[1]} ${adaptTestScript(argParts.slice(2).join(' '), scripts, repoPath)}`;
        // blacklist for linters and similar
        case 'xo':
        case 'tsd':
            return null;
        default:
            // if nothing else matches check try to find the module and extract the 'bin' file
            const bin = getBin(repoPath, argParts[0]);

            if (bin === null) return null;

            // skip shell files for now - ToDo extract with npm (see node-wrapper dir)
            if (bin.endsWith('.sh')) {
                return adaptTestScript(argParts.slice(1).join(' '), scripts, repoPath);
            }

            argParts[0] = bin;
            return argParts.join(' ');
    }
}

function findTestScripts(repoPath) {
    const pkgJson = fs.readFileSync(`${repoPath}/package.json`, 'utf8');
    const pkg = JSON.parse(pkgJson);

    // ToDo - it's not always defined with 'test'
    if (!pkg.scripts.test) {
        console.error('No test found');
        process.exit(1);
    }

    // split multiple scripts
    const cmds = pkg.scripts.test.split(/(&&)|;/);
    return cmds.map(cmd =>
        cmd !== '&&' && cmd !== ';' ? adaptTestScript(cmd, pkg.scripts, repoPath) : null
    ).filter(s => s !== null);
}

async function runPreAnalysis(script, repoName, pkgName) {
    // first check if pre-analysis was already done
    if (fs.readFileSync(script, PRE_ANALYSIS + '/results/nodejs-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return true;
    } else if (fs.readFileSync(script, PRE_ANALYSIS + '/results/frontend-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return false;
    }

    await runAnalysis(script, PRE_ANALYSIS, repoName, {pkgName}, ['/node_modules']);

    return fs.existsSync(PRE_ANALYSIS + `/results/${pkgName}.json`);
}

async function runPreAnalysisNodeWrapper(repoName, pkgName) {
    await runAnalysisNodeWrapper(PRE_ANALYSIS, repoName, {pkgName},
        ['/node_modules', 'tests/', 'test/', 'test-', 'test.js'] // exclude some classic test patterns to avoid false positives
    );

    const type = getPreAnalysisType(pkgName);

    // if it is still not found it means that it was never instrumented
    // for now add it to the err-modules to inspect it later
    if (type === null) {
        fs.appendFileSync(PRE_ANALYSIS + '/results/err-modules.txt', pkgName + '\n', {encoding: 'utf8'});
    }

    return type === PKG_TYPE.NODE_JS;

    // return fs.existsSync(PRE_ANALYSIS + `/results/${pkgName}.json`);
}

async function runAnalysisNodeWrapper(analysis, dir, initParams, exclude) {
    const nodeprofHome = process.env.NODEPROF_HOME;

    let params = ' --jvm '
        + ' --experimental-options'
        + ' --engine.WarnInterpreterOnly=false'
        + ` --vm.Dtruffle.class.path.append=${nodeprofHome}/build/nodeprof.jar`
        + ' --nodeprof.Scope=module'
        + ' --nodeprof.IgnoreJalangiException=false'
        + ' --nodeprof';

    if (exclude && exclude.length > 0) {
        params += ` --nodeprof.ExcludeSource=${exclude.join(',')}`
    }

    params += ` ${nodeprofHome}/src/ch.usi.inf.nodeprof/js/jalangi.js --analysis ${analysis}`;
    params += ` --exec-path ${NODE_WRAPPER}`; // overwrite the exec path in the analysis

    for (const initParamName in initParams) {
        const initParam = initParams[initParamName];
        if (initParam !== null && initParam !== undefined) {
            params += ` --initParam ${initParamName}:${initParam}`;
        }
    }

    fs.writeFileSync(__dirname + '/node-wrapper/params.txt', params, {encoding: 'utf8'});

    await execCmd(`cd ${dir}; ` + NPM_WRAPPER + ' test', true, false);
}

async function runAnalysis(script, analysis, dir, initParams, exclude) {
    const graalNode = process.env.GRAAL_NODE_HOME;
    const nodeprofHome = process.env.NODEPROF_HOME;

    let cmd = `cd ${dir}; `
    cmd += graalNode
        + ' --jvm '
        + ' --experimental-options'
        + ' --engine.WarnInterpreterOnly=false'
        + ` --vm.Dtruffle.class.path.append=${nodeprofHome}/build/nodeprof.jar`
        + ' --nodeprof.Scope=module'
        + ' --nodeprof.IgnoreJalangiException=false'
        + ' --nodeprof';

    if (exclude && exclude.length > 0) {
        cmd += ` --nodeprof.ExcludeSource=${exclude.join(',')}`
    }

    cmd += ` ${nodeprofHome}/src/ch.usi.inf.nodeprof/js/jalangi.js --analysis ${analysis}`;
    cmd += ` --exec-path ${NODE_WRAPPER}`; // overwrite the exec path in the analysis

    for (const initParamName in initParams) {
        cmd += ` --initParam ${initParamName}:${initParams[initParamName]}`;

    }

    cmd += ` ${script};`;

    await execCmd(cmd, true, false);
}

async function writeResultsToDB(pkgName, resultFilenames) {
    const results = [];

    // parse and merge all results
    resultFilenames.forEach(resultFilename => {
        if (!fs.existsSync(resultFilename)) return;

        results.push(...JSON.parse(fs.readFileSync(resultFilename, 'utf8')));
    });

    if (results.length === 0) return null;

    const db = await getDb();

    const resultsColl = await db.collection('results');
    let pkgId = (await resultsColl.findOne({package: pkgName}, {_id: 1}))?._id;
    if (!pkgId) {
        pkgId = (await resultsColl.insertOne({package: pkgName, runs: []})).insertedId;
    }

    const run = {
        _id: new ObjectId(),
        timestamp: Date.now(),
        results
    };

    await resultsColl.updateOne({_id: pkgId}, {$push: {runs: run}});

    return run._id;
}

async function fetchExceptions(pkgName, runId) {
    const db = await getDb();

    const resultColl = await db.collection('results');

    const pkgResults = await resultColl.findOne({
        package: pkgName,
        "runs._id": runId,
        "runs.results.sink.type": "functionCallArgException"
    });
    return pkgResults ? pkgResults.runs.find(r => r._id.equals(runId)).results.filter(res => res.sink.type === 'functionCallArgException').map(res => res.source) : null;
}

function locToSarif(dbLocation, message = null) {
    if (!dbLocation) return undefined;
    const sarifLoc = {
        physicalLocation: {
            artifactLocation: {uri: 'file://' + dbLocation.artifact},
            region: {
                startLine: dbLocation.region.start.line,
                startColumn: dbLocation.region.start.column,
                endLine: dbLocation.region.end.line,
                endColumn: dbLocation.region.end.column
            }
        },
    };

    if (message) {
        sarifLoc.message = {text: message};
    }

    return sarifLoc;
}

function getPreAnalysisType(pkgName) {
    if (fs.readFileSync(PRE_ANALYSIS + '/results/nodejs-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.NODE_JS;
    } else if (fs.readFileSync(PRE_ANALYSIS + '/results/frontend-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)
        || fs.readFileSync(PRE_ANALYSIS + '/results/err-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.FRONTEND;
    } else {
        return null;
    }
}

async function runPipeline(pkgName, cliArgs) {
    if (DONT_ANALYSE.find(keyword => pkgName.includes(keyword)) !== undefined) {
        console.log(`${pkgName} is a 'don't analyse' script`);
        return;
    }

    // first check if pre-analysis was already done
    const preAnalysisType = getPreAnalysisType(pkgName);
    if (preAnalysisType === PKG_TYPE.FRONTEND && !cliArgs.force) {
        console.error(`Looks like ${pkgName} is a frontend module (from a previous analysis). Use --force to force re-evaluation.`);
        return;
    }

    fs.writeFileSync(__dirname + '/other/last-analyzed.txt', pkgName, {encoding: 'utf8'});

    console.error('Fetching URL');
    const url = await fetchURL(pkgName);
    if (url === null) return;

    const resultBasePath = __dirname + '/results/';

    const sanitizedPkgName = sanitizePkgName(pkgName);
    const repoPath = __dirname + `/packages/${sanitizedPkgName}`;
    if (!fs.existsSync(repoPath)) {
        console.error(`\nFetching repository ${url}`);
        await execCmd(`cd packages; git clone ${url} ${sanitizedPkgName}`, true);
    } else {
        console.error(`\nDirectory ${repoPath} already exists. Skipping git clone.`)
    }

    console.error('\nInstalling dependencies');
    await execCmd(`cd ${repoPath}; npm install;`, true, true, -1);

    // console.error('Finding test scripts');
    // const testScripts = findTestScripts(repoPath);
    //
    // if (testScripts.length === 0) {
    //     console.error('No test scripts found');
    //     fs.appendFileSync(resultBasePath + 'no-test-scripts.txt', pkgName + '\n', {encoding: 'utf8'});
    //     return;
    // }

    console.error('\nRunning pre-analysis');
    const preAnalysisSuccess = preAnalysisType === null || cliArgs.force
        ? await runPreAnalysisNodeWrapper(repoPath, pkgName)
        : preAnalysisType === PKG_TYPE.NODE_JS;

    if (!preAnalysisSuccess) {
        console.error('\nNo internal dependencies detected.');
        if (preAnalysisType !== null && !cliArgs.force) {
            console.error('Use force to enforce re-evaluation.');
        }

        fs.rmSync(repoPath, {recursive: true, force: true});
        return;
    }

    if (cliArgs.onlyPre) return;

    console.error('\nRunning analysis');
    let run = 0;
    let propBlacklist = null;
    let blacklistedProps = [];

    while (true) {
        const resultFilename = `${resultBasePath}${sanitizedPkgName}`;
        await runAnalysisNodeWrapper(
            TAINT_ANALYSIS,
            repoPath,
            {pkgName, resultFilename, propBlacklist},
            [
                'node_modules/istanbul-lib-instrument/',
                'node_modules/mocha/',
                '.bin/',
                'node_modules/jest/',
                'node_modules/nyc',
                'node_modules/jest',
                'node_modules/@jest',
                'node_modules/@babel',
                'node_modules/babel'
            ]
        );

        const resultFiles = fs.readdirSync(resultBasePath)
            .filter(f => f.startsWith(pkgName) && !f.includes('crash-report'))
            .map(f => resultBasePath + f);

        console.error('\nWriting results to DB');
        const runId = await writeResultsToDB(pkgName, resultFiles);

        console.error('\nCleaning up result files');
        resultFiles.forEach(fs.unlinkSync); // could also be done async

        // break if max run or if no flows found
        if (!runId || ++run === MAX_RUNS) break;

        console.error('\nChecking for exceptions');
        const exceptions = await fetchExceptions(pkgName, runId);

        if (!exceptions || exceptions.length === 0) {
            console.error('\nNo exceptions found');
            break;
        }

        console.error('\nExceptions found');

        const newBlacklistedProps = exceptions.map(e => e.prop).filter(p => !blacklistedProps.includes(p));

        console.error('\nAdding properties to blacklist');
        blacklistedProps.push(...newBlacklistedProps);
        blacklistedProps = Array.from(new Set(blacklistedProps));

        propBlacklist = PROP_BLACKLISTS_DIR + sanitizedPkgName + '.json';
        fs.writeFileSync(propBlacklist, JSON.stringify(blacklistedProps), {encoding: 'utf8'});

        console.error('Rerunning analysis with new blacklist (' + blacklistedProps.join(', ') + ')');
    }

    console.error('\nCleaning up');
    if (propBlacklist) fs.unlinkSync(propBlacklist);

    // let preAnalysisSuccess = false;
    // for (const testScript of testScripts) {
    //     if (await runPreAnalysis(testScript, repoPath, pkgName) === true) {
    //         preAnalysisSuccess = true;
    //     }
    // }
    //
    // if (!preAnalysisSuccess) {
    //     console.error('No internal dependencies detected');
    //     return;
    // }
    //
    // console.error('Running analysis');
    // for (const [index, testScript] of testScripts.entries()) {
    //     console.error(`Running test '${testScript}'`);
    //
    //     const resultFilename = `${resultBasePath}${pkgName}-${index}`;
    //     await runAnalysis(
    //         testScript,
    //         TAINT_ANALYSIS,
    //         repoPath,
    //         {pkgName, resultFilename}
    //     );
    // }
    //
    // // fetch all result files (it could be that child processes create their own result files)
    // const resultFiles = fs.readdirSync(resultBasePath)
    //     .filter(f => f.startsWith(pkgName + '-'))
    //     .map(f => resultBasePath + f);
    //
    // console.error('Writing results to DB');
    // // await writeResultsToDB(pkgName, resultFiles);
    //
    // console.error('Cleaning up');
    // resultFiles.forEach(fs.unlinkSync); // could also be done async
}

async function getSarif(pkgName, cliArgs) {
    let pkgNames;
    if (pkgName === null) {
        const db = await getDb();
        const results = await db.collection('results');
        pkgNames = new Set(await results.find({}, {package: 1}).map(p => p.package).toArray());
    } else {
        pkgNames = [pkgName];
    }

    for (pkgName of pkgNames) {
        const sarifCalls = await getSarifData(pkgName, 'functionCallArg');
        const sarifException = await getSarifData(pkgName, 'functionCallArgException');

        if (!cliArgs.out && !cliArgs.outDir) {
            console.error('No output file (--out) specified. Writing to stdout.');
            console.error('Function calls');
            console.error(JSON.stringify(sarifCalls));
            console.error('Exceptions');
            console.error(JSON.stringify(sarifException));
        } else {
            let outFile;
            if (cliArgs.out) {
                const endIndex = cliArgs.out.indexOf('.sarif');
                outFile = endIndex >= 0 ? cliArgs.out.substring(0, endIndex) : cliArgs.out;
            } else {
                outFile = cliArgs.outDir + '/' + sanitizePkgName(pkgName);
            }

            if (sarifCalls) {
                const outFilename = outFile + '.sarif';
                fs.writeFileSync(outFilename, JSON.stringify(sarifCalls), {encoding: 'utf8'});
                console.error(`Function calls written to ${outFilename}.`);
            }
            if (sarifException) {
                const outFilename = outFile + '-exceptions.sarif';
                fs.writeFileSync(outFilename, JSON.stringify(sarifException), {encoding: 'utf8'});
                console.error(`Exceptions written to ${outFilename}.`);
            }
        }
    }
}

async function getSarifData(pkgName, sinkType) {
    const db = await getDb();
    const query = {package: pkgName};
    if (sinkType) {
        query["runs.results.sink.type"] = sinkType
    }

    let runs = (await db.collection('results').findOne(query))?.runs;
    if (!runs) return null;

    const filteredRuns = [];
    runs.forEach(run => {
        run.results = run.results?.filter(res => res.sink.type === sinkType);
        if (run.results?.length > 0) {
            filteredRuns.push(run);
        }
    });
    if (filteredRuns.length === 0) return null;

    return {
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: filteredRuns.map(run => ({
            tool: {
                driver: {
                    name: 'GadgetTaintTracker',
                    version: '0.1',
                    informationUri: "https://ToDoLinktoRepo.com"
                }
            },
            results: run.results.map(result => ({
                ruleId: run._id,
                level: 'error',
                message: {text: `Flow found from {prop: ${result.source.prop}} into sink {type: ${result.sink.type}, functionName: ${result.sink.functionName}, value: ${result.sink.value}}`},
                locations: [locToSarif(result.sink.location)],
                codeFlows: [{
                    message: {text: 'ToDo'},
                    threadFlows: [{
                        locations: [
                            // ToDo (maybe) - add state, messages and nesting level
                            {
                                location: locToSarif(
                                    result.entryPoint.location,
                                    `Entry point {callTrace: ${result.entryPoint.entryPoint.join('')}}`
                                )
                            },
                            {location: locToSarif(result.source.location, `Undefined property read {prop: ${result.source.prop}}`)},
                            ...result.codeFlow.map(cf => ({location: locToSarif(cf.location, cf.type + ' ' + cf.name)})),
                            {location: locToSarif(result.sink.location, `Sink {argIndex: ${result.sink.argIndex}, value: ${result.sink.value}, module: ${result.sink.module}}`)}
                        ]
                    }]
                }]
            }))
        }))
    };
}

function getPkgsFromFile(filename) {
    const contents = fs.readFileSync(filename, {encoding: 'utf8'});
    return contents.split('\n').map(pkg => pkg.trim());
}

function sanitizePkgName(pkgName) {
    return pkgName.replace('/', '-').replace('@', '');
}

async function run() {
    const cliArgs = parseCliArgs();

    const pkgNames = cliArgs.fromFile ? getPkgsFromFile(cliArgs.pkgName) : [cliArgs.pkgName];

    let skipTo = cliArgs.skipTo;
    if (!skipTo && cliArgs.skipToLast) {
        skipTo = fs.readFileSync(__dirname + '/other/last-analyzed.txt', {encoding: 'utf8'});
    }
    for (const pkgName of pkgNames) {
        if (skipTo && skipTo !== pkgName) {
            continue;
        }
        skipTo = null;

        try {
            if (cliArgs.sarif) {
                console.error(`Creating sarif`);
                await getSarif(pkgName, cliArgs);
            } else {
                console.error(`Analysing '${pkgName}'`);
                await runPipeline(pkgName, cliArgs)
                console.error(`Analyzing ${pkgName} complete`);
            }
        } catch (e) {
            console.error(`Could not process '${pkgName}'`);
            console.error(e);
        }
    }
    closeConnection();
}

run().then(() => console.error('done'));