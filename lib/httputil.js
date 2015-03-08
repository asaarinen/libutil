var log = require('./log.js');

exports.errorResponse = function(req, res, code, msg) {
    try {
        res.writeHead(code);
        if( !msg ) {
            switch(code) {
            case 400: msg = '400 Invalid Request'; break;
            case 403: msg = '403 Not Authorized'; break;
            case 404: msg = '404 Not Found'; break;
            case 500: msg = '500 Internal Server Error'; break;
            default: msg = ''; break;
            }
        }
        res.end(msg + '\n')
        log((msg ? msg : code) + ' ' + req.method + ' ' + req.url);
    } catch(err) {
        log('error creating error response for ' + req.method + ' ' + req.url);
    }
}
