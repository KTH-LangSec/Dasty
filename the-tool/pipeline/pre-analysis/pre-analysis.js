// DO NOT INSTRUMENT
const {isBuiltin} = require('node:module');
const spawn = require('child_process').spawn;

class PreAnalysis {
    builtinDependencies = [];

    constructor(pkgName, executionDone) {
        this.pkgName = pkgName;
        this.executionDone = executionDone;
    }

    invokeFunStart = (iid, f, receiver, index, isConstructor, isAsync, scope) => {
        if (isConstructor || f === undefined || f === console.log) return;

        if (f === spawn) {
            const analysisFilename = __dirname + '/index.js';

            // special wrapper child_process.spawn that if a new node process is spawned appends the analysis
            const spawnWrapper = (command, args, options) => {
                if (!command.endsWith('node')) {
                    return f.call(receiver, command, args, options);
                }

                console.log('Spawning child process analysis ' + args.join(' '));

                const graalNode = process.env.GRAAL_NODE_HOME;
                const nodeProfHome = process.env.NODEPROF_HOME;
                const analysisArgs = [
                    '--jvm',
                    '--experimental-options',
                    '--engine.WarnInterpreterOnly=false',
                    `--vm.Dtruffle.class.path.append=${nodeProfHome}/build/nodeprof.jar`,
                    '--nodeprof.Scope=module',
                    // '--nodeprof.ExcludeSource=node_modules/',
                    '--nodeprof.IgnoreJalangiException=false',
                    '--nodeprof=true',
                    `${nodeProfHome}/src/ch.usi.inf.nodeprof/js/jalangi.js`,
                    '--analysis', analysisFilename,
                    '--initParam', `pkgName:${this.pkgName}`
                ];

                // remove other node flags
                while (args[0]?.startsWith('-')) args.shift();

                analysisArgs.push(...args);

                const p = f.call(receiver, graalNode, analysisArgs, options);

                // ToDo - improve (i.e. only on idle)
                const killTimeout = setTimeout(() => p.kill(), 5 * 60 * 1000);
                p.on('exit', () => clearTimeout(killTimeout));

                return p;
            };

            spawnWrapper['__name__'] = f.name;

            return {result: spawnWrapper};
        }
    }

    invokeFun = (iid, f, base, args, result, isConstructor, isMethod, functionScope, functionIid, functionSid) => {
        if (!functionScope?.startsWith('file://')) return;

        if (f?.name === 'require' && isBuiltin(args[0])) {
            this.builtinDependencies.push(args[0]);
        }
    };

    uncaughtException = (err, origin) => {
    }

    endExecution = () => {
        if (this.executionDone) {
            this.executionDone();
        }
    }

    /* the following hooks are needed so that wrapping the function works
       (without them onInput is not triggered for every input which leads to unexpected behavior) */
    literal = () => {
    }

    getField = () => {
    }

    read = () => {
    };
}

module.exports = PreAnalysis;