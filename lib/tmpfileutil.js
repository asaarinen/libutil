var fs = require('fs');
var assert = require('assert');
var path = require('path');

var async = require('async');

var log = require('./log.js');
var util = require('./libutil.js');
var fsutil = require('./fsutil.js');

var tmpDirCreated = false;
function createTmpDir0(tmpdir, callback) {
    if( !tmpDirCreated ) {
        tmpDirCreated = true;
        log('creating directory ' + tmpdir + '/tmp/');
        fsutil.mkDirP0(tmpdir + '/tmp/', callback);
    } else
        callback();
}

function TmpFile(filename) {
    var retobj = {};

    retobj.filename = function() {
        return filename;
    }

    retobj.release = function(callback) {
        //log('deleting tmp file ' + filename);
        fs.unlink(filename, function(err) {     
            if( err )
                log('error unlinking tmp file: ' + filename);
            callback();
            //else
            //    log('deleted tmp file ' + filename);
        });
    }

    return retobj;
}


function TmpDir(dirname) {
    var retobj = {};
    
    retobj.dirname = function() {
        return dirname;
    }

    retobj.release = function(callback) {
        //log('deleting tmp dir ' + dirname);
        fsutil.unlinkDirR0(dirname, function(err) {
            if( err )
                log('error unlinking tmp directory ' + dirname + ': ' + err);
            callback();
        });
    }
    
    return retobj;
}

exports.notTmpFile = function(_filename) {
    return {
        filename: function() {
            return _filename;
        },
        release: function(callback) {
            process.nextTick(callback);
        }
    }
}

exports.tmpFileTouchFun = function(prefix, ext) {
    return function(callback) {
        var tmpfile = null, tmpfilesize = 0;
        util.waterfall([
            exports.tmpFileFun(prefix, ext),
            function(_tmpfile, wfcb) {
                tmpfile = _tmpfile;
                tmpfilesize = Math.floor(Math.random() * 10 * 1024 / 4) * 4;
                var buf = new Buffer(tmpfilesize);
                for( var bi = 0; bi < tmpfilesize / 4; bi++ )
                    buf.writeFloatLE(Math.random(), bi * 4);
                fs.writeFile(tmpfile.filename(), buf, wfcb);
            },
            function(wfcb) {
                wfcb(null, tmpfile, tmpfilesize);
            }
        ], callback);
    }
}

var tmpfiledirectory = null;
exports.setTmpFileDirectory = function(dir) {
    tmpfiledirectory = dir;
}

exports.tmpFileFun = function(prefix, ext) {
    if( !prefix )
        prefix = 'tmp';
    return function(callback) {
        if( !tmpfiledirectory )
            tmpfiledirectory = fsutil.getHomeDir('tmp');
        var str = tmpfiledirectory + '/tmp/' +
            prefix + '-' + 
            util.getRandomStr(40) + 
            (ext ? ext : '');
        fs.exists(str, function(exists) {
            if( exists ) // loop 
                return exports.tmpFileFun(prefix, ext)(callback);
            util.waterfall([
                function(wfcb) {
                    createTmpDir0(tmpfiledirectory, wfcb);
                },
                function(wfcb) {
                    wfcb(null, TmpFile(str));
                }
            ], callback);
        });
    }
}

exports.tmpDirFun = function(prefix) {
    return function(callback) {
        var tmpfile = null;
        util.waterfall([
            exports.tmpFileFun(prefix),
            function(tmpf, wfcb) {
                tmpfile = tmpf;
                fs.mkdir(tmpfile.filename(), wfcb);
            },
            function(wfcb) {
                wfcb(null, TmpDir(tmpfile.filename()));
            }
        ], callback);
    }
}

exports.releaseFun = function(tmpf, callback) {
    return function() {
        var origargs = arguments;
        util.waterfall([
            function(wfcb) {
                if( typeof tmpf == 'function' )
                    tmpf = tmpf();
                if( tmpf ) {
                    //log('releasing tmp file/dir ' + tmpf.filename());
                    tmpf.release(wfcb);
                } else
                    wfcb();
                //    log('trying to release null file');
            },
            function(wfcb) {
                if( origargs.length > 0 )
                    if( origargs[0] )
                        return wfcb(origargs[0]);
                wfcb.apply({}, origargs);
            }
        ], callback);
    }
}
