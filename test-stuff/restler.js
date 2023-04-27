const rest = require('restler');
const url = require('url');

({})['__proto__']['headers'] = {'Host': url.parse('http://localhost').host};

const requestUrl = 'https://google.com'
const request = rest.get(requestUrl)

request.on('request', function (request) {
    console.log('request', request);
});

request.on('complete', result => {
    // console.log(result);
});