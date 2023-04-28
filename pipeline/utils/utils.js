//DO NOT INSTRUMENT

function sanitizePkgName(pkgName) {
    return pkgName.replace('/', '-').replace('@', '');
}

module.exports = {sanitizePkgName};