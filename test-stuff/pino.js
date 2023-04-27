const express = require('express');
const pino = require('pino');

const app = express();

Object.prototype['dest'] = 'blub.txt';
Object.prototype['destination'] = 'blub.txt';
const logger = pino({
    level: 'info',
    timestamp: pino.stdTimeFunctions.isoTime
}, pino.destination({}));

// Middleware that logs URL accesses
app.use((req, res, next) => {
    logger.info(`Accessed URL: ${req.url}`);
    next();
});

// Route that sends a response
app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.get('/inject', (req, res) => {
    Object.prototype['dest'] = 'blub.txt';
    logger.stream = pino.destination(process.stdout);

    res.sendStatus(200);
});

// Start the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});