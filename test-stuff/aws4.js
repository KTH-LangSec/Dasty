const https = require('https')
const aws4 = require('aws4')

Object.prototype.hostname = 'localhost';
// Object.prototype.Host = 'google.com';

// aws4 will sign an options object as you'd pass to http.request, with an AWS service and region
// const opts = { host: 'my-bucket.s3.us-west-1.amazonaws.com', path: '/my-object', service: 's3', region: 'us-west-1' }

// and for services with simple hosts, aws4 can infer the host from service and region:
const opts = {service: 'sqs', region: 'us-east-1', path: '/?Action=ListQueues'}

// aws4.sign() will sign and modify these options, ready to pass to http.request
aws4.sign(opts, {accessKeyId: '', secretAccessKey: 'secret'})

// or it can get credentials from process.env.AWS_ACCESS_KEY_ID, etc
aws4.sign(opts);

// console.log(opts);

// we can now use this to query AWS
const req = https.request(opts, function (res) {
    console.log('hey')
}).end(opts.body || '')
console.log(req.getHeaders());