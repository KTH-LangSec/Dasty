const cp = require('child_process');

// const content = {};
//
// if (content && typeof content.path === 'string' && !content.href) {
//     // if (this.disableFileAccess) {
//     //     contentStream = new PassThrough();
//     //     setImmediate(() => contentStream.emit('error', new Error('File access rejected for ' + content.path)));
//     //     return contentStream;
//     // }
//     // // read file
//     // return fs.createReadStream(content.path);
//     console.log(content.path.__val);
// }

function test() {
    console.log('test');
}

test();

const obj = {blub: 'blub'};

const x = obj.flub || 'hey';

// const y = x + 'b';

// console.log(x);

cp.execSync(x);