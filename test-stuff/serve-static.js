const express = require('express');
// const serveStatic = require("serve-static");

const app = express();

// app.use('/', serveStatic('public', { 'index': ['index.html'], redirect: true}));

app.use(express.static('public'));

app.get('/hey', (req, res) => {
    res.send('hey');
});

app.get('/inject', (req, res) => {
    Object.prototype['originalUrl'] = 'http://localhost/injected';

    res.sendStatus(200);
});

// app.use((req, res, next) => {
//     res.status(404).send("Sorry can't find that!")
// });

app.listen(3000, () => {
    console.log('Server listening on port 3000');
});