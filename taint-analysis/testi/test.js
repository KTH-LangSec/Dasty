// import {PassThrough} from "stream";
// import fs from "fs";

const content = {};

if (content && typeof content.path === 'string' && !content.href) {
    // if (this.disableFileAccess) {
    //     contentStream = new PassThrough();
    //     setImmediate(() => contentStream.emit('error', new Error('File access rejected for ' + content.path)));
    //     return contentStream;
    // }
    // // read file
    // return fs.createReadStream(content.path);
    console.log(content.path.__val);
}