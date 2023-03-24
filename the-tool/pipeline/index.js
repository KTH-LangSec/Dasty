const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
const {exec} = require('child_process');
const fs = require('fs');
const {getDb, closeConnection} = require('./db/conn');
const {ObjectId} = require("mongodb");

const args = process.argv;

// const DEFAULT_TIMEOUT = 1 * 60 * 1000;
// const DEFAULT_TIMEOUT = 20000;
const DEFAULT_TIMEOUT = -1;
const MAX_RUNS = 3;

const TAINT_ANALYSIS = __dirname + '/../taint-analysis/';
const PRE_ANALYSIS = __dirname + '/pre-analysis/';
const NPM_WRAPPER = __dirname + '/node-wrapper/npm';
const PROP_BLACKLISTS_DIR = __dirname + '/blacklists/';

function getCliArg(name, numValues = 1) {
    const index = process.argv.findIndex(arg => arg === `--${name}`);
    return index >= 0 && args.length >= index + numValues ? args.splice(index, numValues + 1) : null;
}

function execCmd(cmd, live = false, throwOnErr = true, timeout = DEFAULT_TIMEOUT) {
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
    let url = await execCmd(`npm view ${pkgName} repository.url`);

    if (!url.startsWith('git+')) {
        console.error('No git repository found');
        process.exit(1);
    }

    return url.substring(4).trim();
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
    if (fs.readFileSync(script, PRE_ANALYSIS + '/results/nodejs-modules.txt').split('\n').includes(pkgName)) {
        return true;
    } else if (fs.readFileSync(script, PRE_ANALYSIS + '/results/frontend-modules.txt').split('\n').includes(pkgName)) {
        return false;
    }

    await runAnalysis(script, PRE_ANALYSIS, repoName, {pkgName}/*, ['/node_modules']*/);

    return fs.existsSync(PRE_ANALYSIS + `/results/${pkgName}.json`);
}

async function runPreAnalysisNodeWrapper(repoName, pkgName) {
    // first check if pre-analysis was already done
    if (fs.readFileSync(PRE_ANALYSIS + '/results/nodejs-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return true;
    } else if (fs.readFileSync(PRE_ANALYSIS + '/results/frontend-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return false;
    }

    await runAnalysisNodeWrapper(PRE_ANALYSIS, repoName, {pkgName});

    return fs.existsSync(PRE_ANALYSIS + `/results/${pkgName}.json`);
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

    for (const initParamName in initParams) {
        cmd += ` --initParam ${initParamName}:${initParams[initParamName]}`;
    }

    cmd += ` ${script};`;

    console.error(cmd);

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
    let pkgId = (await resultsColl.findOne({package: pkgName}, {projection: {_id: 0}}))?._id;
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
    return pkgResults ? pkgResults.runs[0].results.map(res => res.source) : null;
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

async function runPipeline(pkgName) {
    console.error('Fetching URL');
    const url = await fetchURL(pkgName);
    const resultBasePath = __dirname + '/results/';

    const repoPath = __dirname + `/packages/${pkgName}`;
    if (!fs.existsSync(repoPath)) {
        console.error(`Fetching repository ${url}`);
        await execCmd(`cd packages; git clone ${url} ${pkgName}`, true);
    } else {
        console.error(`Directory ${repoPath} already exists. Skipping git clone.`)
    }

    console.error('Installing dependencies');
    await execCmd(`cd ${repoPath}; npm install;`, true, true, -1);

    // console.error('Finding test scripts');
    // const testScripts = findTestScripts(repoPath);
    //
    // if (testScripts.length === 0) {
    //     console.error('No test scripts found');
    //     fs.appendFileSync(resultBasePath + 'no-test-scripts.txt', pkgName + '\n', {encoding: 'utf8'});
    //     return;
    // }

    console.error('Running pre-analysis');
    const preAnalysisSuccess = await runPreAnalysisNodeWrapper(repoPath, pkgName);

    if (!preAnalysisSuccess) {
        console.error('No internal dependencies detected');
        return;
    }

    console.error('Running analysis');
    let run = 0;
    let propBlacklist = null;
    let blacklistedProps = [];

    while (true) {
        const resultFilename = `${resultBasePath}${pkgName}`;
        await runAnalysisNodeWrapper(
            TAINT_ANALYSIS,
            repoPath,
            {pkgName, resultFilename, propBlacklist}
        );

        const resultFiles = fs.readdirSync(resultBasePath)
            .filter(f => f.startsWith(pkgName) && !f.includes('crash-report'))
            .map(f => resultBasePath + f);

        console.error('Writing results to DB');
        const runId = await writeResultsToDB(pkgName, resultFiles);

        console.error('Cleaning up result files');
        resultFiles.forEach(fs.unlinkSync); // could also be done async

        // break if max run or if no flows found
        if (!runId || ++run === MAX_RUNS) break;

        console.error('Checking for exceptions');
        const exceptions = await fetchExceptions(pkgName, runId);

        if (!exceptions || exceptions.length === 0) {
            console.error('No exceptions found');
            break;
        }

        console.error('Exceptions found');

        const newBlacklistedProps = exceptions.map(e => e.prop).filter(p => !blacklistedProps.includes(p));

        console.error('Adding properties to blacklist');
        blacklistedProps.push(...newBlacklistedProps);
        blacklistedProps = Array.from(new Set(blacklistedProps));

        propBlacklist = PROP_BLACKLISTS_DIR + pkgName + '.json';
        fs.writeFileSync(propBlacklist, JSON.stringify(blacklistedProps), {encoding: 'utf8'});

        console.error('Rerunning analysis with new blacklist (' + blacklistedProps.join(', ') + ')');
    }

    console.error('Cleaning up');
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

async function getSarif(pkgName) {
    const db = await getDb();
    const results = await db.collection('results').findOne({package: pkgName});

    const sarif = {
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: results.runs.map(run => ({
            tool: {
                driver: {
                    name: 'GadgetTaintTracker',
                    version: '0.1',
                    informationUri: "https://ToDoLinktoRepo.com"
                }
            },
            results: run.results.map(result => ({
                ruleId: 'ToDo',
                level: 'error',
                message: {text: `Flow found into sink {type: ${result.sink.type}, value: ${result.sink.value}, code: ${result.sink.code}}`},
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
                            {location: locToSarif(result.source.location, 'Undefined property read')},
                            ...result.codeFlow.map(cf => ({location: locToSarif(cf.location, cf.type + ' ' + cf.name)})),
                            {location: locToSarif(result.sink.location, 'Sink')}
                        ]
                    }]
                }]
            }))
        }))
    };

    const out = getCliArg('out', 1);
    if (!out) {
        console.error('No output file (--out) specified. Writing to stdout.');
        console.error(JSON.stringify(sarif));
    } else {
        fs.writeFileSync(out[1], JSON.stringify(sarif), {encoding: 'utf8'});
        console.error(`Output written to ${out[1]}.`);
    }
}

function getPkgsFromFile(filename) {
    const contents = fs.readFileSync(filename, {encoding: 'utf8'});
    return contents.split('\n').map(pkg => pkg.trim());
}

async function run() {
    const sarif = getCliArg('sarif', 0);
    const fromFile = getCliArg('fromFile', 0);

    if (args.length < 1) {
        // ToDo - usage info
        console.error('No package name specified')
        process.exit(1);
    }

    const pkgNames = fromFile ? getPkgsFromFile(args[args.length - 1]) : [args[args.length - 1]];

    for (const pkgName of pkgNames) {
        try {
            if (sarif) {
                console.error(`Getting sarif for '${pkgName}'`);
                await getSarif(pkgName)
            } else {
                console.error(`Analysing '${pkgName}'`);
                await runPipeline(pkgName)
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