const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
const {exec} = require('child_process');
const fs = require('fs');
const {getDb, closeConnection} = require('./db/conn');

const args = process.argv;

function getCliArg(name, numValues = 1) {
    const index = process.argv.findIndex(arg => arg === `--${name}`);
    return index >= 0 && args.length >= index + numValues ? args.splice(index, numValues + 1) : null;
}

function execCmd(cmd, live = false, throwOnErr = true) {
    return new Promise((resolve, reject) => {
        const childProcess = exec(cmd);
        let out = '';
        let err = '';

        childProcess.stdout.on('data', data => {
            if (live) process.stdout.write(data);
            out += data;
        });
        childProcess.stderr.on('data', data => {
            if (live) process.stderr.write(data);

            err += data;
        });

        childProcess.on('close', code => {
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
        console.log('No git repository found');
        process.exit(1);
    }

    return url.substring(4).trim();
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
            if (argParts[1] === 'run' && argParts[2] !== 'lint') {
                return adaptTestScript(scripts[argParts[2]], scripts, repoPath);
            }

            // ignore other npm commands (e.g. audit)
            return null;
        case 'c8':
        case 'nyc':
            return adaptTestScript(argParts.slice(1).join(' '), scripts, repoPath);
        default:
            // if nothing else matches check try to find the module and extract the 'bin' file
            const modulePath = `${repoPath}/node_modules/${argParts[0]}/`;
            if (!fs.existsSync(modulePath)) return null;

            const pkgJson = JSON.parse(fs.readFileSync(modulePath + 'package.json', {encoding: 'utf8'}));
            if (typeof pkgJson?.bin) {
                if (typeof pkgJson.bin === 'string') {
                    argParts[0] = modulePath + pkgJson.bin;
                } else if (pkgJson.bin[argParts[0]]) {
                    argParts[0] = modulePath + pkgJson.bin[argParts[0]];
                } else {
                    return null;
                }

                return argParts.join(' ');
            }

            return null;
    }
}

function findTestScripts(repoPath) {
    const pkgJson = fs.readFileSync(`${repoPath}/package.json`, 'utf8');
    const pkg = JSON.parse(pkgJson);

    // ToDo - it's not always defined with 'test'
    if (!pkg.scripts.test) {
        console.log('No test found');
        process.exit(1);
    }

    // split multiple scripts
    const cmds = pkg.scripts.test.split(/(&&)|;/);
    return cmds.map(cmd =>
        cmd !== '&&' && cmd !== ';' ? adaptTestScript(cmd, pkg.scripts, repoPath) : null
    ).filter(s => s !== null);
}

async function runAnalysis(testScript, pkgName, resultFilename) {

    const analysisFilename = __dirname + '/../taint-analysis/index.js';

    let cmd = `cd ./packages/${pkgName}; `
    cmd += '$GRAAL_NODE_HOME'
        + ' --jvm '
        + ' --experimental-options'
        + ' --engine.WarnInterpreterOnly=false'
        + ' --vm.Dtruffle.class.path.append=$NODEPROF_HOME/build/nodeprof.jar'
        + ' --nodeprof.Scope=module'
        + ' --nodeprof.ExcludeSource=excluded/'
        + ' --nodeprof.IgnoreJalangiException=false'
        + ' --nodeprof $NODEPROF_HOME/src/ch.usi.inf.nodeprof/js/jalangi.js'
        + ` --analysis ${analysisFilename}`
        + ` --initParam pkgName:${pkgName}`
        + ` --initParam resultFilename:${resultFilename}`
        + ` ${testScript};`;

    console.log(cmd);

    await execCmd(cmd, true, false);
}

async function writeResultsToDB(pkgName, resultFilenames) {
    const results = [];

    // parse and merge all results
    resultFilenames.forEach(resultFilename => {
        if (!fs.existsSync(resultFilename)) return;

        results.push(...JSON.parse(fs.readFileSync(resultFilename, 'utf8')));
    });

    if (results.length === 0) return;

    const db = await getDb();

    const resultsColl = await db.collection('results');
    let pkgId = (await resultsColl.findOne({package: pkgName}, {projection: {_id: 0}}))?._id;
    if (!pkgId) {
        pkgId = (await resultsColl.insertOne({package: pkgName, runs: []})).insertedId;
    }

    const run = {
        timestamp: Date.now(),
        results
    };

    await resultsColl.updateOne({_id: pkgId}, {$push: {runs: run}});
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
    console.log('Fetching URL');
    const url = await fetchURL(pkgName);

    const repoPath = __dirname + `/packages/${pkgName}`;
    if (!fs.existsSync(repoPath)) {
        console.log(`Fetching repository ${url}`);
        await execCmd(`cd packages; git clone ${url} ${pkgName}`, true);
    } else {
        console.log(`Directory ${repoPath} already exists. Skipping git clone.`)
    }

    console.log('Installing dependencies');
    await execCmd(`cd ${repoPath}; npm install;`, true);

    console.log('Finding test scripts');
    const testScripts = findTestScripts(repoPath);

    console.log('Running analysis');
    const resultBasePath = __dirname + '/results/';
    for (const [index, testScript] of testScripts.entries()) {
        console.log(`Running test '${testScript}'`);

        const resultFilename = `${resultBasePath}${pkgName}-${index}.json`;
        await runAnalysis(testScript, pkgName, resultFilename);
    }

    // fetch all result files (it could be that child processes create their own result files)
    const resultFiles = fs.readdirSync(resultBasePath)
        .filter(f => f.startsWith(pkgName + '-'))
        .map(f => resultBasePath + f);

    console.log('Writing results to DB');
    await writeResultsToDB(pkgName, resultFiles);

    console.log('Cleaning up');
    resultFiles.forEach(fs.unlinkSync); // could also be done async
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
        console.log('No output file (--out) specified. Writing to stdout.');
        console.log(JSON.stringify(sarif));
    } else {
        fs.writeFileSync(out[1], JSON.stringify(sarif), {encoding: 'utf8'});
        console.log(`Output written to ${out[1]}.`);
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
        console.log('No package name specified')
        process.exit(1);
    }

    const pkgNames = fromFile ? getPkgsFromFile(args[args.length - 1]) : [args[args.length - 1]];

    for (const pkgName of pkgNames) {
        try {
            if (sarif) {
                console.log(`Getting sarif for '${pkgName}'`);
                await getSarif(pkgName)
            } else {
                console.log(`Analysing '${pkgName}'`);
                await runPipeline(pkgName)
                console.log(`Analyzing ${pkgName} complete`);
            }
        } catch (e) {
            console.error(`Could not process '${pkgName}'`);
            console.error(e);
        }
    }
    closeConnection();
}

run().then(() => console.log('done'));