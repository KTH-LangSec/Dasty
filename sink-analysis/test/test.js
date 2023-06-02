const cp = require('child_process');
const dir = require('./test-dir'); // sink
require('./test-dir'); // no sink (cached)

cp.execSync('echo', {});

cp.exec(process.execPath + ' ./test-dir/index.js', (err) => {

});