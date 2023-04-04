const url = require('url');
const cp = require('child_process');

const obj = {};

const parsedUrl = url.parse('https://' + obj.url);

// console.log(parsedUrl);

cp.exec('echo ' + parsedUrl);

