const express = require('express');
const session = require('express-session');

const app = express();

// has to happen before setting up
Object.prototype['key'] = 'blub';

// Set up session middleware
app.use(session({
    secret: 'my-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {secure: false}
}));

app.get('/inject', (req, res) => {
    Object.prototype['session'] = 'blub';
    Object.prototype['key'] = 'blub';

    res.sendStatus(200);
});

// Set a session variable
app.get('/set', (req, res) => {
    req.session.hey = 'hey';
    res.send('Session set');
});

// Get a session variable
app.get('/get', (req, res) => {
    res.send(`Session variable value: ${req.session.hey}`);
});

app.listen(3000, () => {
    console.log('Server listening on port 3000');
});