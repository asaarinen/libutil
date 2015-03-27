var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var async = require('async');

var log = require('./log.js');
var util = require('./libutil.js');
var tmpfileutil = require('./tmpfileutil.js');

var assert = require('assert');

exports.getHomeDir = function(subdirname) {
    return (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + path.sep + '.' + subdirname;
}

exports.getFreeDiskSpace2 = function(dir, callback) {
    util.waterfall([
        function(wfcb) {
            util.exec1('df', [ '-g', dir ], null, true, wfcb);
        },
        function(dfout, wfcb) {
            var m = dfout.match(/\/[^\s]+\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+\%)/);
            if( m ) {
                try { 
                    var free = parseInt(m[3]);
                    var cap = parseInt(m[1]);
                } catch(err) {}
                if( typeof free == 'number' && typeof cap == 'number' &&
                    isNaN(free) == false && isNaN(cap) == false )
                    wfcb(null, free, cap);
                else
                    wfcb('error parsing numbers: ' + m[1] + ', ' + m[3]);
            } else
                wfcb('error parsing df output: ' + dfout);
        }
    ], callback);
}

exports.mkDirP0 = function(filepath, callback) {
    var re1 = new RegExp(path.sep + '$');
    if( filepath.match(re1) )
        var dirs = filepath.split(path.sep);
    else
        var dirs = path.dirname(filepath).split(path.sep);
    var curdir = '';
    
    var re2 = new RegExp('^' + path.sep);
    if( filepath.match(re2) )
        curdir = path.sep;
    async.eachSeries(dirs, function(dirc, dircb) {
        if( curdir && curdir.length > 1 )
            curdir += path.sep;
        curdir += dirc;
        fs.mkdir(curdir, function(err) {
            dircb();
        });
    }, callback);
}

exports.writeTmpFileJSON1 = function(json, callback) {
    var jsonstr = null, tmpfile = null;
    util.waterfall([
        function(wfcb) {
            var jsonerr = null;
            try {
                jsonstr = JSON.stringify(json);
            } catch(err) {
                jsonerr = err;
                jsonstr = null;
            }
            if( jsonerr )
                wfcb('error stringifying json: ' + jsonerr);
            else
                wfcb();
        },
        tmpfileutil.tmpFileFun('fsutil.writeTmpFileJSON1'),
        function(_tmpfile, wfcb) {
            tmpfile = _tmpfile;
            log('writing json to file ' + tmpfile.filename());
            fs.writeFile(tmpfile.filename(), jsonstr, wfcb);
        }
    ], function(err) {
        if( err )
            tmpfileutil.releaseFun(tmpfile, callback)(err);
        else
            callback(null, tmpfile);
    });
}

exports.readTmpFileJSON1 = function(tmpfilename, tmpdir, callback) {
    log('reading json from file ' + tmpfilename);
    util.waterfall([
        function(wfcb) {
            fs.readFile(tmpfilename, tmpfileutil.releaseFun(tmpdir, wfcb));
        },
        function(jsondata, wfcb) {
            var jsonobj = null, jsonerr = null;
            try {
                if( typeof jsondata != 'string' )
                    jsondata = jsondata.toString('utf8');
                jsonobj = JSON.parse(jsondata);
            } catch(err) {
                log('error parsing json data: ' + err + '\nparsed data: ' + jsondata);
                jsonerr = err;
                jsonobj = null;
            }

            if( jsonerr )
                wfcb(jsonerr);
            else
                wfcb(null, jsonobj);
        }
    ], callback);
}

exports.copyFileP0 = function(file1, file2, callback) {
    util.waterfall([
        function(wfcb) {
            exports.mkDirP0(file2, wfcb);
        },
        function(wfcb) {
            exports.copyFile0(file1, file2, wfcb);
        }
    ], callback);
}

exports.copyFile0 = function(file1, file2, callback) {
    callback = util.safeCallback(callback);

    log('copying file ' + file1 + ' -> ' + file2);
    var tmpin = fs.createReadStream(file1);
    var tmpout = fs.createWriteStream(file2);
    tmpin.pipe(tmpout);
    tmpin.on('error', callback);
    tmpout.on('error', callback);
    tmpout.on('close', function() {
        log('copying done');
        callback();
    });    
}

exports.getFileSize1 = function(filename, callback) {
    util.waterfall([
        function(wfcb) {
            fs.stat(filename, wfcb);
        },
        function(stats, wfcb) {
            if( stats.isFile() == false )
                return wfcb('error, sizing non-file');
            wfcb(null, stats.size);
        }
    ], callback);
}

exports.getFileHash2 = function(filename, callback) {
    callback = util.safeCallback(callback);
    
    var fin = fs.createReadStream(filename);
    var md5 = crypto.createHash('md5');
    fin.pipe(md5);
    md5.on('readable', function() {
        var buf = md5.read();
        callback(null, buf.toString('hex'),
                 buf.toString('base64'));
    });
    fin.on('error', callback);
    md5.on('error', callback);
}

exports.getFileInfo3 = function(filename, callback) {
    var size = 0;
    util.waterfall([
        function(wfcb) {
            exports.getFileSize1(filename, wfcb);
        },
        function(_size, wfcb) {
            size = _size;
            exports.getFileHash2(filename, wfcb);
        },
        function(h1, h2, wfcb) {
            wfcb(null, size, h1, h2);
        }
    ], callback);
}

exports.readDirR1 = function(dirname, callback) {
    util.waterfall([
        function(wfcb) {
            exports.readDirR2(dirname, wfcb);
        },
        function(files, dirs, wfcb) {
            wfcb(null, files);
        }
    ], callback);
}

exports.readDirR2 = function(dirname, callback) {
    var filesdb = [], dirsdb = [];
    
    function browse(basepath, directory, bcb) {
        util.waterfall([
            function(wfcb) {
                fs.readdir(basepath + directory, wfcb);
            },
            function(files, wfcb) {
                async.eachSeries(files, function(filename, filecb) {
                    var filepath = directory + path.sep + filename;
                    util.waterfall([
                        function(wfcb2) {
                            fs.stat(basepath + filepath, wfcb2);
                        },
                        function(stats, wfcb2) {
                            if( stats.isDirectory() ) {
                                dirsdb.push(basepath + filepath);
                                browse(basepath, filepath, wfcb2);
                            } else if( stats.isFile() ) {
                                filesdb.push(basepath + filepath);
                                process.nextTick(wfcb2);
                            } else
                                process.nextTick(wfcb2);
                        }
                    ], function(err) { filecb(); });
                }, wfcb);
            }
        ], bcb);
    }
    
    util.waterfall([
        function(wfcb) {
            browse(dirname, '', wfcb);
        },
        function(wfcb) {
            wfcb(null, filesdb, dirsdb);
        }
    ], callback);
}

exports.unlinkDirR0 = function(dirname, callback) {
    util.waterfall([
        function(wfcb) {
            //log('removing tmp directory ' + dirname);
            exports.readDirR2(dirname, wfcb);
        },
        function(files, dirs, wfcb) {
            util.waterfall([
                function(wfcb2) {
                    async.eachSeries(files, 
                                     function(file, filecb) {
                                         // make sure we don't delete other files 
                                         assert(file.indexOf(dirname) == 0);
                                         //log('unlinking subdir file ' + file);
                                         fs.unlink(file, filecb);
                                     }, wfcb2);
                },
                function(wfcb2) {
                    // remove longest subdirs first
                    dirs.sort(function(a, b) { if( a < b ) return 1; if( a > b ) return -1; return 0; });
                    async.eachSeries(dirs,
                                     function(dir, dircb) {
                                         // make sure we don't delete other files 
                                         assert(dir.indexOf(dirname) == 0);
                                         //log('unlinking subdir ' + dir);
                                         fs.rmdir(dir, dircb);
                                     }, wfcb2);
                }
            ], wfcb);
        },
        function(wfcb) {
            fs.rmdir(dirname, wfcb);
        }
    ], callback);
}

exports.fileMimeType1 = function(file, callback) {
    util.waterfall([
        function(wfcb) {
            util.exec1('file', [ '--mime-type', file ], null, true, wfcb);
        },
        function(mimetype, wfcb) {
            var m = mimetype.match(/^[^\:]+\: (.+)\s+$/);
            if( m )
                wfcb(null, m[1]);
            else
                wfcb('could not parse mimetype ' + mimetype);
        }
    ], callback);
}

exports.zipFile2 = function(localpath, filename, callback) {
    var tmpdir = null;
    util.waterfall([
        util.tmp.tmpDirFun('util.fs.zipFile1'),
        function(_tmpdir, wfcb) {
            tmpdir = _tmpdir;
            exports.copyFile0(localpath, tmpdir.dirname() + '/' + filename, wfcb);
        },
        function(wfcb) {
            util.exec0('zip', [ '-j', tmpdir.dirname() + '/' + filename + '.zip', tmpdir.dirname() + '/' + filename ], wfcb);
        },
        function(wfcb) {
            wfcb(null, tmpdir, tmpdir.dirname() + '/' + filename + '.zip');
        }
    ], callback);
}

exports.unzipFile0 = function(localpath, filename, copytofile, callback) {
    var tmpdir = null;
    util.waterfall([
        util.tmp.tmpDirFun('util.fs.unzipFile1'),
        function(_tmpdir, wfcb) {
            tmpdir = _tmpdir;
            util.exec0('unzip', [ '-d', tmpdir.dirname(), localpath ], wfcb);
        },
        function(wfcb) {
            exports.copyFile0(tmpdir.dirname() + '/' + filename, copytofile, wfcb);
        }
    ], util.tmp.releaseFun(function() { return tmpdir; }, callback));
}




