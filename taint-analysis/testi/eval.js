const obj = {};

const fn = obj.fn || 'return 10';

// console.log(new Function(fn)());

csv({});


// new Function(  'esc',
//     'return function toRow(obj) {\n' +
//     'var a0 = a == null ? "" : a\n' +
//     'var a1 = b == null ? "" : b\n' +
//     'var result = (/[,\\r\\n"]/.test(a0) ? esc(a0+"") : a0)+","+(/[,\\r\\n"]/.test(a1) ? esc(a1+"") : a1)\n' +
//     'return result +\n' +
//     '}'
// );

function csv(opts) {
    var newline = opts.newline || '\n'
    var sep = opts.separator || opts.seperator || ','
    var str = 'function toRow(obj) {\n'

    let headers = ['a', 'b'];

    if (!headers.length) str += '""'

    headers = headers.map(function(prop, i) {
        str += 'var a'+i+' = '+prop+' == null ? "" : '+prop+'\n'
        return 'a'+i
    })

    for (var i = 0; i < headers.length; i += 500) { // do not overflowi the callstack on lots of cols
        var part = headers.length < 500 ? headers : headers.slice(i, i + 500)
        str += i ? 'result += "'+sep+'" + ' : 'var result = '
        part.forEach(function(prop, j) {
            str += (j ? '+"'+sep+'"+' : '') + '(/['+sep+'\\r\\n"]/.test('+prop+') ? esc('+prop+'+"") : '+prop+')'
        })
        str += '\n'
    }

    str += 'return result +'+JSON.stringify(newline)+'\n}'

    return new Function('esc', 'return '+str)
}

// function toRow(obj) {
//     var a0 = a == null ? "" : a
//     var a1 = b == null ? "" : b
//     var result = (/[,\r\n"]/.test(a0) ? esc(a0+"") : a0)+","+(/[,\r\n"]/.test(a1) ? esc(a1+"") : a1)
//     return result +
// }

// function toRow(obj) {
//     var a0 = a == null ? "" : a
//     var a1 = b == null ? "" : b
//     var result = (/[,\r\n"]/.test(a0) ? esc(a0+"") : a0)+","+(/[,\r\n"]/.test(a1) ? esc(a1+"") : a1)
//     return result +"\n"
// }

