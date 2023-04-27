const fs = require('fs');

fs.createReadStream(__dirname + '/tmp/index.html', {flags: 'w'});

