const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
const {exec, spawn} = require('child_process');
const fs = require('fs');
const {getDb, closeConnection} = require('./db/conn');
const {ObjectId, Db} = require("mongodb");
const path = require("path");
const {sanitizePkgName} = require("./utils/utils");
const {removeDuplicateFlows, removeDuplicateTaints} = require("../taint-analysis/utils/result-handler");

// const DEFAULT_TIMEOUT = 1 * 60 * 1000;
// const DEFAULT_TIMEOUT = 20000;
const DEFAULT_TIMEOUT = -1;
const MAX_RUNS = 1;
const NPM_INSTALL_TIMEOUT = 8 * 60 * 1000;

const DEFAULT_RESULTS_COLL = 'resultsForcedBranchExec';

const TAINT_ANALYSIS = __dirname + '/../taint-analysis/';
const PRE_ANALYSIS = __dirname + '/pre-analysis/';
const PACKAGE_DATA = __dirname + '/package-data/';
const NPM_WRAPPER = __dirname + '/node-wrapper/npm';
const NODE_WRAPPER = __dirname + '/node-wrapper/node';
const TMP_DIR = __dirname + '/tmp';
const FAILED_DB_WRITE = __dirname + '/results/failed-db-write';
const NODE_WRAPPER_STATUS_FILE = __dirname + '/node-wrapper/status.csv';

// keywords of packages that are known to be not interesting (for now)
// if encountered the analysis is terminated
const DONT_ANALYSE = [
    'react',
    'angular',
    'vue',
    'webpack',
    'vite',
    'babel',
    'gulp',
    'grunt',
    'bower',
    'lint',
    '/types',
    '@type/',
    '@types/',
    'electron',
    'tailwind',
    'jest',
    'mocha',
    'nyc',
    'typescript',
    'jquery',
    'browser'
];

// specific keyword that if included in the filepath won't be instrumented during the analysis
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
    'ts-node',
    'tslib',
    'tsutils',
    'eslint',
    'Gruntfile.js',
    'jest',
    '.node'
];

const PKG_TYPE = {
    NODE_JS: 'Node.js',
    FRONTEND: 'Frontend',
    NOT_INSTRUMENTED: 'Not Instrumented',
    PRE_FILTERED: 'Pre Filtered',
    ERR: 'Uncaught Error',
    NPM_TIMEOUT: 'Npm Install Timeout'
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
    '--onlyForceBranchExec': 0,
    '--execFile': 1,
    '--noForIn': 0,
    '--resultsCollection': 1
}

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
        onlyForceBranchExec: false,
        execFile: undefined,
        noForIn: false,
        resultsCollection: DEFAULT_RESULTS_COLL
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

function execCmd(cmd, args, workingDir = null, live = false, throwOnErr = true, timeout = DEFAULT_TIMEOUT) {
    console.error(cmd + ' ' + args.join(' ') + '\n');

    return new Promise((resolve, reject) => {
        const options = workingDir ? {cwd: workingDir} : {};
        const childProcess = spawn(cmd, args, options);
        let out = '';
        let err = '';
        let timedOut = false;

        let killTimeout;
        const setKillTimout = () => {
            if (timeout === -1 || killTimeout === null) return;

            if (killTimeout) clearTimeout(killTimeout);
            killTimeout = setTimeout(() => {
                console.error('TIMEOUT');

                killTimeout = null;
                timedOut = true;
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

            resolve({out, err, timedOut});
        });
    });
}

async function fetchURL(pkgName) {
    let url = (await execCmd('npm', ['view', pkgName, 'repository.url'], null)).out.trim();

    if (url.startsWith('git+')) {
        url = url.substring(4);
    }

    if (url.startsWith('git://') || url.startsWith('ssh://')) {
        url = 'https' + url.substring(3);
    } else if (!url.startsWith('https://')) {
        console.error('No git repository found');
        return null;
    }

    // add some password to skip password prompts
    console.log(url);
    let urlNoProt = url.substring('https://'.length);
    console.log(urlNoProt);
    if (urlNoProt.includes("@")) {
        const atIdx = urlNoProt.indexOf("@");
        urlNoProt = urlNoProt.substring(atIdx + 1);
    }

    return 'https://flub:blub@' + urlNoProt;
}

async function runPreAnalysisNodeWrapper(repoName, pkgName) {
    await runAnalysisNodeWrapper(PRE_ANALYSIS, repoName, {pkgName},
        ['/node_modules', 'tests/', 'test/', 'test-', 'test.js'] // exclude some classic test patterns to avoid false positives
    );

    let type = getPreAnalysisType(pkgName);

    // if it is still not found it means that it was never instrumented
    // save it separately to inspect it later
    if (type === null) {
        fs.appendFileSync(PACKAGE_DATA + 'non-instrumented-packages.txt', pkgName + '\n', {encoding: 'utf8'});
        type = PKG_TYPE.NOT_INSTRUMENTED;
    }

    return type;
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

    // delete previous status file
    if (fs.existsSync(NODE_WRAPPER_STATUS_FILE)) {
        fs.unlinkSync(NODE_WRAPPER_STATUS_FILE);
    }

    const cmd = execFile ? NODE_WRAPPER : NPM_WRAPPER;
    const args = execFile ? [execFile] : ['test'];
    await execCmd(cmd, args, dir, true, false);
}

async function writePackageDataToDB(pkgName, type, preAnalysisStatuses) {
    const db = await getDb();
    const packageDataColl = await db.collection('packageData');

    let pkgDataId = await packageDataColl.findOne({"package": pkgName})?._id;
    if (!pkgDataId) {
        pkgDataId = (await packageDataColl.insertOne({package: pkgName})).insertedId;
    }

    await packageDataColl.updateOne({_id: pkgDataId}, {$set: {type, preAnalysisStatuses}});
}

async function writeResultsToDB(pkgName, resultId, runName, resultFilenames, taintsFilenames, branchedOnFilenames, runExecStatuses, resultsCollection = DEFAULT_RESULTS_COLL) {
    const db = await getDb();
    const runId = new ObjectId();

    const resultsColl = await db.collection(resultsCollection);

    // create an empty result document (if it does not exist yet)
    if (!resultId) {
        resultId = (await resultsColl.insertOne({package: pkgName, timestamp: Date.now(), runs: []})).insertedId;
    }

    let results = [];

    // parse and merge all results
    resultFilenames?.forEach(resultFilename => {
        results.push(...JSON.parse(fs.readFileSync(resultFilename, {encoding: 'utf8'})));
    });

    results = removeDuplicateFlows(results);

    const run = {
        _id: runId,
        runName,
        runExecStatuses,
        results
    };

    await resultsColl.updateOne({_id: resultId}, {$push: {runs: run}});

    // store branched on
    const branchedOn = [];
    branchedOnFilenames?.forEach(boFilenames => {
        const bo = JSON.parse(fs.readFileSync(boFilenames, {encoding: 'utf8'}));
        branchedOn.push(...bo.map(b => ({prop: b.prop, loc: b.src, result: b.result})));
    });

    if (branchedOn.length > 0) {
        const branchedOnColl = await db.collection('branchedOn');

        const bo = {
            resultId: resultId,
            runId: runId,
            package: pkgName,
            timestamp: Date.now(),
            branchedOn
        }

        await branchedOnColl.insertOne(bo);
    }

    let taints = [];
    taintsFilenames?.forEach(taintsFilename => {
        taints.push(...JSON.parse(fs.readFileSync(taintsFilename, {encoding: 'utf8'})));
    });
    taints = removeDuplicateTaints(taints);

    // we are storing every taint set in as separate document as it might be too big
    if (taints.length > 0) {
        const taintsColl = await db.collection('taints');
        const taintVals = {
            resultId: resultId,
            runId: runId,
            package: pkgName,
            timestamp: Date.now(),
            taints
        }

        await taintsColl.insertOne(taintVals);
    }

    return {resultId, runId: runId, noFlows: results.length === 0};
}

async function fetchExceptions(resultId, runId, resultsCollection) {
    const db = await getDb();

    const resultColl = await db.collection(resultsCollection);

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

/**
 * Checks the results of the pre analysis
 * First checks nodejs-packages then frontend-packages, err-packages and non-instrumented-packages
 */
function getPreAnalysisType(pkgName) {
    if (fs.readFileSync(PACKAGE_DATA + 'nodejs-packages.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.NODE_JS;
    } else if (fs.readFileSync(PACKAGE_DATA + 'frontend-packages.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.FRONTEND;
    } else if (fs.readFileSync(PACKAGE_DATA + 'err-packages.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.ERR
    } else if (fs.readFileSync(PACKAGE_DATA + 'non-instrumented-packages.txt', {encoding: 'utf8'}).split('\n').includes(pkgName)) {
        return PKG_TYPE.NOT_INSTRUMENTED;
    } else {
        return null;
    }
}

function parseExecStatuses() {
    if (!fs.existsSync(NODE_WRAPPER_STATUS_FILE)) return null;

    const statusLines = fs.readFileSync(NODE_WRAPPER_STATUS_FILE, {encoding: 'utf8'}).trim().split('\n');
    // note that the parent status is written after the child status as it finishes later
    return statusLines.map(statusLine => {
        const statusData = statusLine.split(';');
        return {
            bin: statusData[0],
            status: statusData[1],
            instrumented: statusData[2]?.trim() === 'instrumented'
        }
    });
}

async function runForceBranchExec(pkgName, resultBasePath, resultFilename, dbResultId, repoPath, execFile, cliArgs) {
    const allBranchedOns = new Map(); // all so far encountered branchings (loc -> result)
    const branchedOnPerProp = new Map(); // all branchings per prop (prop -> (loc -> result))

    // const {branchedOnFilenames} = getResultFilenames(pkgName, resultBasePath);

    const db = await getDb();
    const branchedOnColl = await db.collection('branchedOn');

    const branchedOn = (await branchedOnColl.findOne({package: pkgName}, {sort: {timestamp: -1}}))?.branchedOn;

    if (!branchedOn || branchedOn.length === 0) {
        return;
    }

    // parse files
    branchedOn.forEach(b => {
        allBranchedOns.set(b.loc, b.result);
        if (!branchedOnPerProp.has(b.prop)) {
            branchedOnPerProp.set(b.prop, new Map());
        }
        // convert loc object to loc string for analysis
        const locStart = b.loc.region.start;
        const locEnd = b.loc.region.end;
        const loc = `(${b.loc.artifact}:${locStart.line}:${locStart.column}:${locEnd.line}:${locEnd.column + 1})`;

        branchedOnPerProp.get(b.prop).set(loc, b.result);
    });

    console.log(`\nFound ${branchedOnPerProp.size} injected properties used for branching. Force executing.`)

    // force branching for every property separately
    for (const [prop, b] of branchedOnPerProp.entries()) {
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
            const execStatuses = parseExecStatuses();

            try {
                const {resultId} = await writeResultsToDB(pkgName, dbResultId, runName, resultFilenames, null, null, execStatuses, cliArgs.resultsCollection);
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
 * @returns path to the local repository
 */
async function setupPkg(pkgName, sanitizedPkgName) {
    console.error('Fetching URL');
    const url = await fetchURL(pkgName);
    if (url === null) return;

    const repoPath = __dirname + `/packages/${sanitizedPkgName}`;
    if (!fs.existsSync(repoPath)) {
        console.error(`\nFetching repository ${url}`);
        await execCmd('git', ['clone', url, sanitizedPkgName], __dirname + '/packages/', true);

        console.error('\nInstalling dependencies');
        const timedOut = (await execCmd('npm', ['install'], repoPath, true, false, NPM_INSTALL_TIMEOUT)).timedOut;

        if (timedOut) {
            await writePackageDataToDB(pkgName, PKG_TYPE.NPM_TIMEOUT, null);
            throw new Error("npm install timeout");
        }
    } else {
        console.error(`\nDirectory ${repoPath} already exists. Skipping git clone.`)
    }

    return repoPath;
}

async function runPipeline(pkgName, cliArgs) {
    if (DONT_ANALYSE.find(keyword => pkgName.includes(keyword)) !== undefined) {
        fs.appendFileSync(PACKAGE_DATA + 'filtered-packages.txt', pkgName + '\n', {encoding: 'utf8'});
        console.log(`${pkgName} is a 'don't analyse' script`);
        await writePackageDataToDB(pkgName, PKG_TYPE.PRE_FILTERED, null);
        return;
    }

    // first check if pre-analysis was already done
    let preAnalysisType = getPreAnalysisType(pkgName);
    if (preAnalysisType !== null && preAnalysisType !== PKG_TYPE.NODE_JS && !cliArgs.force) {
        console.error(`Looks like ${pkgName} is not a node.js package (from a previous analysis). Use --force to force re-evaluation.`);
        return;
    }

    const sanitizedPkgName = sanitizePkgName(pkgName);

    const resultBasePath = __dirname + '/results/';

    fs.writeFileSync(PACKAGE_DATA + 'last-analyzed.txt', pkgName, {encoding: 'utf8'});

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
            if (preAnalysisType === null || cliArgs.force) {
                preAnalysisType = await runPreAnalysisNodeWrapper(repoPath, pkgName)
                const preAnalysisStatuses = parseExecStatuses();
                await writePackageDataToDB(pkgName, preAnalysisType, preAnalysisStatuses);
            }

            if (preAnalysisType !== PKG_TYPE.NODE_JS) {
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
        let dbResultId = null; // the db id for the current analysis run

        let forInRun = !cliArgs.noForIn; // make one for in run

        // this is the unintrusive analysis - it is only run when onlyForceBranchExec is not set
        // the break condition is inside the loop
        while (!cliArgs.onlyForceBranchExec) {
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
                const execStatuses = parseExecStatuses();
                const result = await writeResultsToDB(pkgName, dbResultId, runName, resultFilenames, taintsFilenames, branchedOnFilenames, execStatuses, cliArgs.resultsCollection);
                dbResultId = result.resultId;
                runId = result.runId;
                noFlows = result.noFlows;

                console.error('\nCleaning up result files');
                resultFilenames.forEach(fs.unlinkSync);
                taintsFilenames.forEach(fs.unlinkSync);
                branchedOnFilenames.forEach(fs.unlinkSync);
            } catch {
                // if there is a problem writing to the database move files to not lose the data
                resultFilenames.concat(taintsFilenames).forEach(file => {
                    const filename = path.basename(file);
                    fs.renameSync(file, `${FAILED_DB_WRITE}/${filename}`);
                });
            }

            // if it was a forInRun continue without checking for exceptions
            if (forInRun && run < cliArgs.maxRuns) {
                forInRun = false;
                continue;
            }

            // if max run or if no flows stop
            if (noFlows || ++run === +cliArgs.maxRuns) break;

            console.error('\nChecking for exceptions');
            const exceptions = await fetchExceptions(dbResultId, runId, cliArgs.resultsCollection);

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

        if (cliArgs.forceBranchExec || cliArgs.onlyForceBranchExec) {
            await runForceBranchExec(pkgName, resultBasePath, resultFilename, dbResultId, repoPath, execFile, cliArgs);
        }
    } finally {
        console.error('\nCleaning up');
        if (propBlacklist) fs.unlinkSync(propBlacklist);

        // fetch all files that are still remaining
        const {resultFilenames, branchedOnFilenames, taintsFilenames} = getResultFilenames(pkgName, resultBasePath);
        resultFilenames.forEach(fs.unlinkSync);
        branchedOnFilenames.forEach(fs.unlinkSync);
        taintsFilenames.forEach(fs.unlinkSync);

        fs.appendFileSync(PACKAGE_DATA + 'already-analyzed.txt', pkgName + '\n', {encoding: 'utf8'});
    }
}

async function getSarif(pkgName, cliArgs) {
    let pkgNames;
    if (pkgName === null) {
        const db = await getDb();
        const results = await db.collection(cliArgs.resultsCollection);
        pkgNames = new Set(await results.find({}, {package: 1}).map(p => p.package).toArray());
    } else {
        pkgNames = [pkgName];
    }

    for (pkgName of pkgNames) {
        const sarifCalls = await getSarifData(pkgName, 'functionCallArg', cliArgs.resultsCollection, cliArgs.exportRuns);
        const sarifException = await getSarifData(pkgName, 'functionCallArgException', cliArgs.resultsCollection, cliArgs.exportRuns);
        const sarifAllTaints = cliArgs.allTaints ? await getAllTaintsSarifData(pkgName) : null;
        const sarifBranchedOn = cliArgs.allTaints ? await getBranchedOnSarifData(pkgName) : null;

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
            if (sarifBranchedOn) {
                const outFilename = outFile + '-branched-on.sarif';
                fs.writeFileSync(outFilename, JSON.stringify(sarifBranchedOn), {encoding: 'utf8'});
                console.error(`Branchings written to ${outFilename}.`);
            }
        }
    }
}

async function getSarifData(pkgName, sinkType, resultsCollection, amountRuns = 1) {
    const db = await getDb();
    const query = {package: pkgName};
    if (sinkType) {
        query["runs.results.sink.type"] = sinkType
    }

    let results = await db.collection(resultsCollection).find(query).toArray();
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

async function getAllTaintsSarifData(pkgName) {
    const db = await getDb();

    const taintsColl = db.collection('taints');
    const pkgRuns = (await taintsColl.find({package: pkgName}).toArray());
    if (pkgRuns.length === 0) return null;
    const resId = pkgRuns[pkgRuns.length - 1]?.resultId;
    if (!resId) return null;

    let runs = await taintsColl.find({resultId: resId}).toArray();

    if (!runs || runs.length === 0) return null;

    return {
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: runs.map(run => ({
            runName: run.runId,
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
                message: {text: `TaintValue {prop: ${taint.source.prop}}, runName: ${run.runId}}`},
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

async function getBranchedOnSarifData(pkgName) {
    const db = await getDb();

    const branchedOnColl = db.collection('branchedOn');
    const pkgRuns = (await branchedOnColl.find({package: pkgName}).toArray());
    if (pkgRuns.length === 0) return null;
    const resId = pkgRuns[pkgRuns.length - 1]?.resultId;
    if (!resId) return null;

    let runs = await branchedOnColl.find({resultId: resId}).toArray();

    if (!runs || runs.length === 0) return null;

    return {
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: runs.map(run => ({
            runName: run.runId,
            tool: {
                driver: {
                    name: 'GadgetTaintTracker',
                    version: '0.1',
                    informationUri: "https://ToDoLinktoRepo.com"
                }
            },
            results: run.branchedOn.map(bo => ({
                ruleId: run._id,
                level: 'error',
                message: {text: `BranchedOn {prop: ${bo.prop}}, result: ${bo.result}}`},
                locations: [locToSarif(bo.loc)]
            }))
        }))
    };
}

function getPkgsFromFile(filename) {
    const filepath = path.resolve(filename);
    if (!fs.existsSync(filepath)) {
        throw new Error("File does not exists");
    }

    const contents = fs.readFileSync(filepath, {encoding: 'utf8'});
    return contents.split('\n').map(pkg => pkg.trim());
}

async function run() {
    const cliArgs = parseCliArgs();
    const startTs = Date.now();

    const pkgNames = cliArgs.fromFile ? getPkgsFromFile(cliArgs.pkgName) : [cliArgs.pkgName];

    let skipTo = cliArgs.skipTo;
    if (!skipTo && cliArgs.skipToLast) {
        skipTo = fs.readFileSync(PACKAGE_DATA + 'last-analyzed.txt', {encoding: 'utf8'});
    }

    let packagesToSkip = [];
    if (cliArgs.skipDone) {
        packagesToSkip = fs.readFileSync(PACKAGE_DATA + 'already-analyzed.txt', {encoding: 'utf8'}).split('\n').map(p => p.trim());
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

    const endTs = Date.now();

    // insert data about the run
    const db = await getDb();
    const runData = await db.collection('runData');
    await runData.insertOne({
        cmd: process.argv.slice(2).join(' '),
        startTs,
        endTs,
        duration: endTs - startTs
    })

    closeConnection();
}

run().then(() => console.error('done'));