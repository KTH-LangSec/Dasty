const express = require('express');
const app = express();
const path = require('path');


app.get('/users/:id', (req, res) => {
    ({}).__proto__.id = [(req, res, paramCallback, paramVal, key) => {
        console.log('whut');
        throw new Error('whut');
    }];
    const userId = req.params.id;
    res.send(`User with id ${userId} requested`);
});

app.get('/file', (req, res) => {
    res.sendFile(__dirname + '/tmp/index.html', {root: 'http://google.com'});
});

// ejs

({}).__proto__['client'] = 'true';
({}).__proto__['escapeFunction'] = 'function (param) {console.log("whut")}'

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'tmp', 'views'));

app.get('/ejs', (req, res) => {
    const data = {name: 'John', age: 30};
    res.render('ejs', data);
});

app.listen(3000, () => {
    console.log('Server listening on port 3000');
});