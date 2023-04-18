const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
const {exec} = require('child_process');
const fs = require('fs');
const {getDb, closeConnection} = require('./db/conn');
const {ObjectId} = require("mongodb");
const path = require("path");
const {sanitizePkgName} = require("./utils/utils");
const {removeDuplicateFlows, removeDuplicateTaints} = require("../taint-analysis/utils/result-handler");

// const DEFAULT_TIMEOUT = 1 * 60 * 1000;
// const DEFAULT_TIMEOUT = 20000;
const DEFAULT_TIMEOUT = -1;
const MAX_RUNS = 5;

const TAINT_ANALYSIS = __dirname + '/../taint-analysis/';
const PRE_ANALYSIS = __dirname + '/pre-analysis/';
const NPM_WRAPPER = __dirname + '/node-wrapper/npm';
const NODE_WRAPPER = __dirname + '/node-wrapper/node';
const TMP_DIR = __dirname + '/tmp';
const FAILED_DB_WRITE = __dirname + '/results/failed-db-write';

const EXCLUDE_ANALYSIS_KEYWORDS = [
    'node_modules/istanbul-lib-instrument/',
    'node_modules/mocha/',
    'node_module/.bin/',
    'node_modules/nyc',
    'node_modules/jest',
    'node_modules/@jest',
    'node_modules/@babel',
    'node_modules/babel',
    'node_modules/grunt',
    'typescript',
    'eslint',
    'Gruntfile.js',
    'jest',
    '.node'
];

const PKG_TYPE = {
    NODE_JS: 0,
    FRONTEND: 1
}

const CLI_ARGS = {
    '--out': 1,
    '--outDir': 1,
    '--onlyPre': 0,
    '--sarif': 0,
    '--allTaints': 0,
    '--fromFile': 0,
    '--skipTo': 1,
    '--skipToLast': 0,
    '--skipDone': 0,
    '--force': 0,
    '--exportRuns': 1,
    '--maxRuns': 1,
    '--forceBranchExec': 0,
    '--execFile': 1
}

// keywords of packages that are known to be not interesting (for now)
const DONT_ANALYSE = ['react', 'angular', 'vue', 'webpack', 'vite', 'babel', 'gulp', 'bower', 'lint', '/types', '@type/', '@types/', 'electron', 'tailwind', 'jest', 'mocha', 'nyc', 'typescript', 'jquery'];

function parseCliArgs() {
    // Set default values (also so that the ide linter shuts up)
    const parsedArgs = {
        out: undefined,
        outDir: undefined,
        onlyPre: false,
        sarif: false,
        allTaints: false,
        fromFile: false,
        skipTo: undefined,
        skipToLast: false,
        skipDone: false,
        force: false,
        pkgName: undefined,
        maxRuns: MAX_RUNS,
        exportRuns: undefined,
        forceBranchExec: false,
        execFile: undefined
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
        url = url.substring(4);
    }

    if (url.startsWith('git://') || url.startsWith('ssh://')) {
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
    // add it to the no-pre-modules to inspect it later
    if (type === null) {
        fs.appendFileSync(__dirname + '/other/no-pre-modules.txt', pkgName + '\n', {encoding: 'utf8'});
    }

    return type === PKG_TYPE.NODE_JS;
}

async function runAnalysisNodeWrapper(analysis, dir, initParams, exclude, execFile = null) {
    const nodeprofHome = process.env.NODEPROF_HOME;

    let params = ' --jvm '
        + ' --experimental-options'
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

    const exec = execFile ? NODE_WRAPPER + ' ' + execFile : NPM_WRAPPER + ' test';
    await execCmd(`cd ${dir}; ${exec}`, true, false);
}

async function runAnalysis(script, analysis, dir, initParams, exclude) {
    const graalNode = process.env.GRAAL_NODE_HOME;
    const nodeprofHome = process.env.NODEPROF_HOME;

    let cmd = `cd ${dir}; `
    cmd += graalNode
        + ' --jvm '
        + ' --experimental-options'
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

async function writeResultsToDB(pkgName, resultId, runName, resultFilenames, taintsFilenames) {
    let results = [];
    let taints = [];

    // parse and merge all results
    resultFilenames?.forEach(resultFilename => {
        results.push(...JSON.parse(fs.readFileSync(resultFilename, 'utf8')));
    });

    taintsFilenames?.forEach(taintsFilename => {
        taints.push(...JSON.parse(fs.readFileSync(taintsFilename, 'utf8')));
    });

    if (results.length === 0 && taints.length === 0) return {resultId, runId: null, nowFlows: true};

    results = removeDuplicateFlows(results);
    taints = removeDuplicateTaints(taints);

    const db = await getDb();

    const resultsColl = await db.collection('results');
    if (!resultId) {
        resultId = (await resultsColl.insertOne({package: pkgName, timestamp: Date.now(), runs: []})).insertedId;
    }

    const run = {
        _id: new ObjectId(),
        runName,
        results,
        taints
    };

    await resultsColl.updateOne({_id: resultId}, {$push: {runs: run}});


    // we are storing every taint set in as separate document as it might be too big
    const taintsColl = await db.collection('taints');
    const taintVals = {
        resultId: resultId,
        runId: run._id,
        package: pkgName,
        timestamp: Date.now(),
        taints
    }

    await taintsColl.insertOne(taintVals);

    return {resultId, runId: run._id, noFlows: results.length === 0};
}

async function fetchExceptions(resultId, runId) {
    const db = await getDb();

    const resultColl = await db.collection('results');

    const query = {
        "_id": resultId,
        "runs._id": runId,
        "runs.results.sink.type": "functionCallArgException"
    };
    const pkgResults = await resultColl.findOne(query);

    return pkgResults?.runs.find(r => r._id.equals(runId)).results.filter(res => res.sink.type === 'functionCallArgException').map(res => res.source) ?? null;
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
        || fs.readFileSync(PRE_ANALYSIS + '/results/err-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)
        || fs.readFileSync(__dirname + '/other/no-pre-modules.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.FRONTEND;
    } else {
        return null;
    }
}

async function runForceBranchExec(pkgName, resultBasePath, resultFilename, dbResultId, repoPath, execFile) {
    const allBranchedOns = new Map(); // all so far encountered branchings (loc -> result)
    const branchedOnPerProp = new Map(); // all branchings per prop (prop -> (loc -> result))

    const {branchedOnFilenames} = getResultFilenames(pkgName, resultBasePath);

    // parse files
    branchedOnFilenames.forEach(branchedOnFilename => {
        const branchedOn = JSON.parse(fs.readFileSync(branchedOnFilename, {encoding: 'utf8'}));
        branchedOn.forEach(b => {
            allBranchedOns.set(b.loc, b.result);
            if (!branchedOnPerProp.has(b.prop)) {
                branchedOnPerProp.set(b.prop, new Map());
            }
            branchedOnPerProp.get(b.prop).set(b.loc, b.result);
        });
    });

    branchedOnFilenames.forEach(fs.unlinkSync);

    const forcedProps = new Set(); // keeps track of all force executed props

    console.log(`\nFound ${branchedOnPerProp.size} injected properties used for branching. Force executing.`)

    // force branching for every property separately
    for (const [prop, b] of branchedOnPerProp.entries()) {
        // check if already done (this can be the case when a prop was force executed with another one)
        if (forcedProps.has(prop)) continue;
        forcedProps.add(prop);

        let newBranchingFound = b.size > 0;

        const props = new Set([prop]); // keeps track of all properties that are currently enforced

        while (newBranchingFound) {
            console.log(`\nRunning force branch execution for: ${Array.from(props).join(', ')}\n`);

            // write to branched on file
            const forceBranchesFilename = `${TMP_DIR}/force-branching/${pkgName}.json`;
            fs.writeFileSync(forceBranchesFilename, JSON.stringify(Array.from(b)), {encoding: 'utf8'});

            // run analysis
            await runAnalysisNodeWrapper(
                TAINT_ANALYSIS,
                repoPath,
                {pkgName, resultFilename, writeOnDetect: true, forceBranchesFilename},
                EXCLUDE_ANALYSIS_KEYWORDS,
                execFile
            );

            let {resultFilenames, branchedOnFilenames} = getResultFilenames(pkgName, resultBasePath);

            const runName = `forceBranchProps: ${Array.from(props).join(', ')}`;
            try {
                const {resultId} = await writeResultsToDB(pkgName, dbResultId, runName, resultFilenames);
                dbResultId = resultId; // if no results found dbResultId might be still null
            } catch (e) {
                // if there is a problem writing to the database move files to not lose the data
                resultFilenames.forEach(file => {
                    const filename = path.basename(file);
                    fs.renameSync(file, `${FAILED_DB_WRITE}/${filename}`);
                });
                resultFilenames = [];
            }


            // check for new branchings
            newBranchingFound = false;
            branchedOnFilenames.forEach(branchedOnFilename => {
                const branchedOn = JSON.parse(fs.readFileSync(branchedOnFilename, {encoding: 'utf8'}));
                branchedOn.forEach(b => {
                    if (allBranchedOns.has(b.loc)) return;

                    allBranchedOns.set(b.loc, b.result);
                    branchedOnPerProp.get(prop).set(b.loc, b.result);

                    if (!props.has(b.prop)) {
                        // add all branchings from the other property
                        branchedOnPerProp.get(b.prop)?.forEach((res, loc) => {
                            if (!branchedOnPerProp.get(prop).has(loc)) {
                                branchedOnPerProp.get(prop).set(loc, res);
                            }
                        });

                        forcedProps.add(b.prop); // add to all props that were already force executed
                        props.add(b.prop); // add to props for the next run
                    }

                    newBranchingFound = true;
                });
            });

            console.error('\nCleaning up result files');
            resultFilenames.forEach(fs.unlinkSync);
            branchedOnFilenames.forEach(fs.unlinkSync);

            if (newBranchingFound) {
                console.log('\nNew (sub-)branches found');
            }
        }
    }
}

/**
 * Returns filtered result files from in the result base path as {resultFilenames, branchedOnFilenames}
 */
function getResultFilenames(pkgName, resultBasePath) {
    const resultDirFilenames = fs.readdirSync(resultBasePath);
    const resultFilenames = resultDirFilenames
        .filter(f => f.startsWith(pkgName) && !f.includes('crash-report') && !f.includes('branched-on') && !f.includes('-taints'))
        .map(f => resultBasePath + f);
    const branchedOnFilenames = resultDirFilenames.filter(f => f.startsWith(`${pkgName}-branched-on`)).map(f => resultBasePath + f);
    const taintsFilenames = resultDirFilenames.filter(f => f.startsWith(`${pkgName}-taints`)).map(f => resultBasePath + f);

    return {resultFilenames, branchedOnFilenames, taintsFilenames};
}

/**
 * Sets up package by fetching the git repository and installing the dependencies
 * @param pkgName - the actual name of the package
 * @param sanitizedPkgName - a sanitized version the is used as the directory name of the repository
 * @returns path to local repository
 */
async function setupPkg(pkgName, sanitizedPkgName) {
    console.error('Fetching URL');
    const url = await fetchURL(pkgName);
    if (url === null) return;

    const repoPath = __dirname + `/packages/${sanitizedPkgName}`;
    if (!fs.existsSync(repoPath)) {
        console.error(`\nFetching repository ${url}`);
        await execCmd(`cd packages; git clone ${url} ${sanitizedPkgName}`, true);
    } else {
        console.error(`\nDirectory ${repoPath} already exists. Skipping git clone.`)
    }

    console.error('\nInstalling dependencies');
    await execCmd(`cd ${repoPath}; npm install --force;`, true, true, -1);

    return repoPath;
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

    const sanitizedPkgName = sanitizePkgName(pkgName);

    const resultBasePath = __dirname + '/results/';

    fs.writeFileSync(__dirname + '/other/last-analyzed.txt', pkgName, {encoding: 'utf8'});

    let propBlacklist = null;
    try {
        // set repo path and execFile (if specified)
        let repoPath;
        let execFile;
        if (!cliArgs.execFile) {
            // if no execFile is specified fetch the pkg repository and install the dependencies
            repoPath = await setupPkg(pkgName, sanitizedPkgName);
        } else {
            // if a execFile is specified, set its directory as the repository path
            execFile = path.resolve(cliArgs.execFile);
            repoPath = path.dirname(execFile);
        }

        if (!repoPath) return;

        // only run the pre analysis for fetched packages
        if (!execFile) {
            // run a non-instrumented run that does e.g. all the compiling/building, so we can skip it for the multiple instrumented runs
            // console.error('\nRunning non-instrumented run');
            // await execCmd(`cd ${repoPath}; npm test;`, true, false);

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
        }

        if (cliArgs.onlyPre) return;

        console.error('\nRunning analysis');
        let run = 0;
        let blacklistedProps = [];
        const resultFilename = `${resultBasePath}${sanitizedPkgName}`;
        let forceBranchProp = null; // the property that is currently force branch executed
        let dbResultId = null; // the db id for the current analysis run

        let forInRun = true; // make one for in run

        while (true) {
            const runName = `run: ${forInRun ? 'forIn' : run + 1}`;
            console.log(`\nStarting ${runName}`);

            await runAnalysisNodeWrapper(
                TAINT_ANALYSIS,
                repoPath,
                {
                    pkgName,
                    resultFilename,
                    propBlacklist,
                    writeOnDetect: true,
                    forceBranchProp,
                    recordAllFunCalls: true,
                    injectForIn: forInRun
                },
                EXCLUDE_ANALYSIS_KEYWORDS,
                execFile
            );

            const {resultFilenames, branchedOnFilenames, taintsFilenames} = getResultFilenames(pkgName, resultBasePath);

            console.error('\nWriting results to DB');

            let noFlows = false;
            let runId = null;
            try {
                const result = await writeResultsToDB(pkgName, dbResultId, runName, resultFilenames, taintsFilenames);
                dbResultId = result.resultId;
                runId = result.runId;
                noFlows = result.noFlows;

                console.error('\nCleaning up result files');
                resultFilenames.forEach(fs.unlinkSync);
                taintsFilenames.forEach(fs.unlinkSync);
            } catch {
                // if there is a problem writing to the database move files to not lose the data
                resultFilenames.concat(taintsFilenames).forEach(file => {
                    const filename = path.basename(file);
                    fs.renameSync(file, `${FAILED_DB_WRITE}/${filename}`);
                });
            }

            // we currently only care for branchings of the first run
            // because we do not blacklist properties in the force branching (for now)
            if (run !== 0 || forInRun) {
                branchedOnFilenames.forEach(fs.unlinkSync);
            }

            // if it was a forInRun continue without checking for exceptions
            if (forInRun && run < cliArgs.maxRuns) {
                forInRun = false;
                continue;
            }

            // if max run or if no flows stop
            if (noFlows || ++run === +cliArgs.maxRuns) break;

            console.error('\nChecking for exceptions');
            const exceptions = await fetchExceptions(dbResultId, runId);

            // if no exceptions found stop
            if (!exceptions || exceptions.length === 0) break;

            console.error('\nExceptions found');

            // add properties to blacklist
            const newBlacklistedProps = exceptions.map(e => e.prop).filter(p => !blacklistedProps.includes(p));

            console.error('\nAdding properties to blacklist');
            blacklistedProps.push(...newBlacklistedProps);
            blacklistedProps = Array.from(new Set(blacklistedProps));

            propBlacklist = `${TMP_DIR}/blacklists/${sanitizedPkgName}.json`;
            fs.writeFileSync(propBlacklist, JSON.stringify(blacklistedProps), {encoding: 'utf8'});

            console.error('Rerunning analysis with new blacklist (' + blacklistedProps.join(', ') + ')');
        }

        if (cliArgs.forceBranchExec) {
            await runForceBranchExec(pkgName, resultBasePath, resultFilename, dbResultId, repoPath, execFile);
        }

    } finally {
        console.error('\nCleaning up');
        if (propBlacklist) fs.unlinkSync(propBlacklist);

        // fetch all files that are still remaining
        const {resultFilenames, branchedOnFilenames, taintsFilenames} = getResultFilenames(pkgName, resultBasePath);
        // resultFilenames.forEach(fs.unlinkSync);
        // branchedOnFilenames.forEach(fs.unlinkSync);
        // taintsFilenames.forEach(fs.unlinkSync);

        fs.appendFileSync(__dirname + '/other/already-analyzed.txt', pkgName + '\n', {encoding: 'utf8'});
    }
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
        const sarifCalls = await getSarifData(pkgName, 'functionCallArg', cliArgs.exportRuns);
        const sarifException = await getSarifData(pkgName, 'functionCallArgException', cliArgs.exportRuns);
        const sarifAllTaints = cliArgs.allTaints ? await getAllTaintsSarifData(pkgName, cliArgs.exportRuns) : null;

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
            if (sarifAllTaints) {
                const outFilename = outFile + '-all-taints.sarif';
                fs.writeFileSync(outFilename, JSON.stringify(sarifAllTaints), {encoding: 'utf8'});
                console.error(`All taints written to ${outFilename}.`);
            }
        }
    }
}

async function getSarifData(pkgName, sinkType, amountRuns = 1) {
    const db = await getDb();
    const query = {package: pkgName};
    if (sinkType) {
        query["runs.results.sink.type"] = sinkType
    }

    let results = await db.collection('results').find(query).toArray();
    if (!results) return null;

    if (amountRuns >= 0) {
        results = results.slice(-amountRuns);
    }

    const runs = results.flatMap(r => r.runs);
    if (runs.length === 0) return null;

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
            runName: run.runName,
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
                message: {text: `Flow found from {prop: ${result.source.prop}} into sink {type: ${result.sink.type}, functionName: ${result.sink.functionName}, value: ${result.sink.value}, module: ${result.sink.module}, runName: ${run.runName}}`},
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
                            {location: locToSarif(result.source.location, `Undefined property read {prop: ${result.source.prop}, inferredType ${result.source.inferredType}}`)},
                            ...result.codeFlow.map(cf => ({location: locToSarif(cf.location, cf.type + ' ' + cf.name)})),
                            {location: locToSarif(result.sink.location, `Sink {argIndex: ${result.sink.argIndex}, value: ${result.sink.value}, module: ${result.sink.module}}`)}
                        ]
                    }]
                }]
            }))
        }))
    };
}

async function getAllTaintsSarifData(pkgName, amountRuns = 1) {
    const db = await getDb();

    let results = await db.collection('results').find({package: pkgName}).toArray();
    if (!results) return null;

    if (amountRuns >= 0) {
        results = results.slice(-amountRuns);
    }

    const runs = results.flatMap(res => res.runs).filter(run => run.taints?.length > 0);
    if (runs.length === 0) return null;

    return {
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: runs.map(run => ({
            runName: run.runName,
            tool: {
                driver: {
                    name: 'GadgetTaintTracker',
                    version: '0.1',
                    informationUri: "https://ToDoLinktoRepo.com"
                }
            },
            results: run.taints.map(taint => ({
                ruleId: run._id,
                level: 'error',
                message: {text: `TaintValue {prop: ${taint.source.prop}}, runName: ${run.runName}}`},
                locations: [locToSarif(taint.source.location)],
                codeFlows: [{
                    message: {text: 'ToDo'},
                    threadFlows: [{
                        locations: [
                            {
                                location: locToSarif(
                                    taint.entryPoint.location,
                                    `Entry point {callTrace: ${taint.entryPoint.entryPoint.join('')}}`
                                )
                            },
                            {location: locToSarif(taint.source.location, `Undefined property read {prop: ${taint.source.prop}}`)},
                            ...taint.codeFlow.map(cf => ({location: locToSarif(cf.location, cf.type + ' ' + cf.name)}))
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

async function run() {
    const cliArgs = parseCliArgs();

    const pkgNames = cliArgs.fromFile ? getPkgsFromFile(cliArgs.pkgName) : [cliArgs.pkgName];

    let skipTo = cliArgs.skipTo;
    if (!skipTo && cliArgs.skipToLast) {
        skipTo = fs.readFileSync(__dirname + '/other/last-analyzed.txt', {encoding: 'utf8'});
    }

    let packagesToSkip = [];
    if (cliArgs.skipDone) {
        packagesToSkip = fs.readFileSync(__dirname + '/other/already-analyzed.txt', {encoding: 'utf8'}).split('\n').map(p => p.trim());
    }

    for (const pkgName of pkgNames) {
        if (skipTo && skipTo !== pkgName) {
            continue;
        }
        skipTo = null;
        if (packagesToSkip.includes(pkgName)) {
            continue;
        }

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