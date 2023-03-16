const url = require('url');
const cp = require('child_process');

const obj = {};

const parsedUrl = url.parse('https://' + obj.url);

cp.exec('echo ' + parsedUrl);

