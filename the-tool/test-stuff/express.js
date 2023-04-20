const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const serveStatic = require('serve-static');


app.get('/users/:id', (req, res) => {
    ({}).__proto__.id = [(req, res, paramCallback, paramVal, key) => {
        console.log('whut');
        throw new Error('whut');
    }];
    const userId = req.params.id;
    res.send(`User with id ${userId} requested`);
});

app.get('/file', (req, res) => {
    ({}).__proto__.flags = 'w';
    res.sendFile(__dirname + '/tmp/index.html');
});

// ejs

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'tmp', 'views'));

app.get('/inject', (req, res) => {
    Object.prototype['client'] = 'true';
    Object.prototype['escapeFunction'] = 'function (param) {console.log("whut")}';

    res.sendStatus(200);
});

app.get('/ejs', (req, res) => {
    const data = {name: 'John', age: 30};
    res.render('ejs', data);
});

app.listen(3000, () => {
    console.log('Server listening on port 3000');
});