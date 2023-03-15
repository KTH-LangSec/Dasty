const cp = require('child_process');

const p = cp.spawn(process.execPath, [__dirname + '/test.js'], {
    stdio: 'inherit'
});

p.on('exit', () => {
    console.log('child exit');
});