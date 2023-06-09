// DO NOT INSTRUMENT

module.exports = {
    DEFAULT_UNWRAP_DEPTH: 5,
    DEFAULT_CHECK_DEPTH: 5,
    NODE_EXEC_PATH: __dirname + '../../pipeline/node-wrapper/node',
    MAX_LOOPS: 100000,
    FORCE_MAX_BRANCHES: 10,
    EXCLUDE_INJECTION: [
        'acorn',
        'test/',
        'tests/',
        'examples/',
        '/node_modules/superagent/node_modules/'
    ],
    DONT_UNWRAP: [
        'emit',
        'setTimeout',
        'nextTick'
    ]
}