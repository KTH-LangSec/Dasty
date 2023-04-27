const cp = require('child_process');

export function run() {
    cp.exec('$GRAAL_NODE_HOME --jvm --experimental-options --vm.Dtruffle.class.path.append=$NODEPROF_HOME/build/nodeprof.jar --nodeprof.Scope=module --nodeprof.ExcludeSource=excluded/ --nodeprof $NODEPROF_HOME/src/ch.usi.inf.nodeprof/js/jalangi.js --analysis /home/pmoosi/Documents/KTH/2023-ss/thesis/analysis/custom/index.js ' + file)
}