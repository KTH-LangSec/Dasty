const cp = require('child_process');

const p = cp.spawn(process.execPath, [__dirname + '/test-slow.js'], {
    stdio: 'inherit'
});

setTimeout(() => p.kill('SIGINT'), 3000);

p.on('exit', () => {
    console.log('child exit');
});