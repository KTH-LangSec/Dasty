const cp = require('child_process');

const p = cp.spawn(process.execPath, [__dirname + '/test.js'], {
    stdio: 'inherit',
    execPath: 'blub'
});

// p.execPath = 'blub';

p.on('exit', () => {
    console.log('child exit');
});