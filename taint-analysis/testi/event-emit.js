const EventEmitter = require('events');

const eventEmitter = new EventEmitter();

const eventHandler = (param) => {
    console.log(param.__taint);
    eval(param);
};

eventEmitter.on('someEvent', eventHandler);

const obj = {};

const script = obj.script || 'console.log("hey");';
eventEmitter.emit('someEvent', script);