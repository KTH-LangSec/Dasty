const express = require('express');
// const serveStatic = require("serve-static");

const app = express();

// app.use('/', serveStatic('public', { 'index': ['index.html'], redirect: true}));

app.use(express.static('public'));

app.get('/hey', (req, res) => {
    res.send('hey');
});

app.get('/inject', (req, res) => {
    Object.prototype['originalUrl'] = 'http://localhost/flub';

    res.sendStatus(200);
});

app.listen(3000, () => {
    console.log('Server listening on port 3000');
});