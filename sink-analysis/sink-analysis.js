// DO NOT INSTRUMENT

const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const {parseIID, iidToLocation} = require('../taint-analysis/utils/utils');

class SinkAnalysis {
    sinks = [];
    #resultFilepath = null;

    constructor(pkgName, resultFilepath, executionDone) {
        this.pkgName = pkgName;
        this.#resultFilepath = resultFilepath;
        this.executionDone = executionDone;
    }

    invokeFunPre = (iid, f, base, args, isConstructor, isMethod, functionScope, proxy) => {
        if (f === undefined || !functionScope?.startsWith('node:')) return;

        // require(<arg1>)
        if (f.name === 'require' && args?.length > 0 && (args[0].startsWith('.') || args[0].startsWith('/'))) {
            let reqPath = args[0];
            if (args[0].startsWith('.')) {
                const loc = iidToLocation(iid);
                const filepath = loc.substring(1, loc.indexOf(':'));
                reqPath = path.join(path.dirname(filepath), args[0]);
            }

            if (fs.existsSync(reqPath) && fs.lstatSync(reqPath).isDirectory() // is it a directory ...
                && !fs.readdirSync(reqPath).includes('package.json')  // ... that does not contain 'package.json' ...
                && !require.cache[reqPath + '/index.js'] && !require.cache[reqPath + 'index.js']) { // ... and is not cached
                this.writeSink(iid, 'require', args);
            }
            return;
        }

        if ([cp.exec, cp.execSync, cp.spawn, cp.spawnSync, cp.fork].includes(f)) {
            let argOpt = f === cp.exec || f === cp.execSync || args.length <= 2 ? args[1] : args[2];

            if (typeof argOpt !== 'object') { // it can be callback
                argOpt = undefined;
            }

            if (Object.prototype.isPrototypeOf(argOpt)
                && !argOpt.hasOwnProperty('shell')
                && (!argOpt.env || Object.prototype.isPrototypeOf(argOpt.env))) {
                this.writeSink(iid, 'child_process.' + f.name, args);
                return;
            }

            if (f === cp.fork) return;

            if (args[0] && typeof args[0] === 'string' && (!argOpt?.env || Object.prototype.isPrototypeOf(argOpt.env))) {
                const execPath = args[0].split(' ')[0];
                if (execPath.endsWith('.js') || execPath.endsWith('node') || execPath.endsWith('npm') || execPath.endsWith('git')) {
                    this.writeSink(iid, 'child_process.' + f.name, args);
                }
            }
        }
    }

    uncaughtException = (err, origin) => {
        if (this.executionDone) {
            this.executionDone(err);
            this.executionDone = null;
        }
    }

    endExecution = () => {
        if (this.executionDone) {
            this.executionDone();
        }
    }

    writeSink = (iid, fn, args) => {
        if (!this.#resultFilepath) return;

        this.sinks.push({
            ...parseIID(iid),
            fn,
            args: args.map(a => a?.toString())
        });
        fs.writeFileSync(this.#resultFilepath, JSON.stringify(this.sinks), {encoding: 'utf8'});
    }
}

module.exports = SinkAnalysis;