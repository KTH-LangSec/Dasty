const cp = require('child_process');
const dir = require('./test-dir');

cp.execSync('echo', {});

cp.exec(process.execPath + ' ./test-dir/index.js', (err) => {

});