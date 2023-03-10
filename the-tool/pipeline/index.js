const util = require('node:util');
// const exec = util.promisify(require('child_process').exec);
const {exec} = require('child_process');
const fs = require('fs');

const args = process.argv;

function getCliArg(name) {
    const index = process.argv.findIndex(arg => arg === `--${name}`);
    return index >= 0 && process.argv.length > index ? args.splice(index, 2)[1] : null;
}

function execCmd(cmd, live = false) {
    return new Promise(resolve => {
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

        childProcess.on('close', () => {
            if (err !== '') {
                if (!live) console.error(err);
                process.exit(1);
            }

            resolve(out);
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

function adaptTestScript(script, scripts) {
    const argParts = script.trim().split(' ');
    switch (argParts[0]) {
        case 'node':
            return argParts.slice(1).join(' ');
        case 'mocha':
            argParts[0] = './node_modules/mocha/bin/mocha.js';
            const bailIndex = argParts.findIndex(a => a === '--bail');
            if (bailIndex >= 0) {
                argParts[bailIndex] = '--exit';
            }
            return argParts.join(' ');
        case 'npm':
            if (argParts[1] === 'run') {
                return adaptTestScript(scripts[argParts[2]], scripts);
            }

            // ignore other npm commands (e.g. audit)
            return null;
        // ToDo add other testing frameworks
        default:
            return null;
    }
}

function findTestScripts(repoName) {
    const pkgJson = fs.readFileSync(`./packages/${repoName}/package.json`, 'utf-8');
    const pkg = JSON.parse(pkgJson);

    // ToDo - it's not always defined with 'test'
    if (!pkg.scripts.test) {
        console.log('No test found');
        process.exit(1);
    }

    // split multiple scripts
    const cmds = pkg.scripts.test.split(/(&&)|;/);
    return cmds.map(cmd =>
        cmd !== '&&' && cmd !== ';' ? adaptTestScript(cmd, pkg.scripts) : null
    ).filter(s => s !== null);
}

async function runAnalysis(testScript, pkgName, resultFilename, repoName) {

    const analysisPath = __dirname + '/../taint-analysis/index.js';
    const resultPath = __dirname + `/results/${resultFilename}.json`;

    let cmd = `cd ./packages/${repoName}; `
    cmd += '$GRAAL_NODE_HOME'
        + ' --jvm '
        + ' --experimental-options'
        + ' --engine.WarnInterpreterOnly=false'
        + ' --vm.Dtruffle.class.path.append=$NODEPROF_HOME/build/nodeprof.jar'
        + ' --nodeprof.Scope=module'
        + ' --nodeprof.ExcludeSource=excluded/'
        + ' --nodeprof.IgnoreJalangiException=false'
        + ' --nodeprof $NODEPROF_HOME/src/ch.usi.inf.nodeprof/js/jalangi.js'
        + ` --analysis ${analysisPath}`
        + ` --initParam pkgName:${pkgName}`
        + ` --initParam resultPath:${resultPath}`
        + ` ${testScript};`;

    console.log(cmd);

    await execCmd(cmd, true);

}

async function run() {
    if (args.length < 1) {
        // ToDo - usage info
        console.log('No package name specified')
        process.exit(-1);
    }

    const pkgName = process.argv[args.length - 1];

    console.log('Fetching URL');
    const url = await fetchURL(pkgName);
    // const url = 'https://github.com/aheckmann/gm.git';

    console.log(`Fetching repository ${url}`);
    // await execCmd(`cd packages; git clone ${url}`, true);

    const repoName = url.split('/').pop().split('.')[0];

    console.log('Installing dependencies');
    // await execCmd(`cd packages/${repoName}; npm install;`, true);

    console.log('Finding test script');
    const testScripts = findTestScripts(repoName);

    console.log(testScripts);

    console.log('Run analysis')
    for (const [index, testScript] of testScripts.entries()) {
        await runAnalysis(testScript, pkgName, `${pkgName}-${index}`, repoName);
    }
}

run().then(() => console.log('Analyzation complete'));