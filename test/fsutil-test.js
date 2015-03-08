var async = require('async');
var assert = require('assert');
var fs = require('fs');

var util = require('../index.js');
var log = util.log;
var fsutil = util.fs;

var path = require('path');

exports.test0 = function(testcb) {

    var tmpfilewrite = null;

    function localp(str) {
        return path.normalize(__dirname + '/../' + str);
    }

    log('testing fsutil.js');
    util.waterfall([
        function(wfcb) {
            log('fsutil.mkDirP0');
            fsutil.mkDirP0(localp('testdata/subdir1/subdir2/copytest1.json'), wfcb);
        },
        function(wfcb) {
            log('fsutil.freeDiskSpace2');
            fsutil.getFreeDiskSpace2(localp('testdata'), wfcb);
        },
        function(free, cap, wfcb) {
            assert(typeof free == 'number');
            assert(typeof cap == 'number');
            assert(free <= cap);
            assert(free >= 0 && cap > 0);

            fs.writeFile(localp('testdata/subdir1/subdir2/copytest1.json'), JSON.stringify({abc: 'foo', def: 'bar'}), wfcb);
        },
        function(wfcb) {
            log('fsutil.readDirR1');
            fsutil.readDirR1(localp('testdata/subdir1'), wfcb);
        },
        function(files, wfcb) {
            assert(files.length == 1);
            log('fsutil.unlinkDirR0');
            fsutil.unlinkDirR0(localp('testdata/subdir1'), wfcb);
        },
        function(wfcb) {
            log('fsutil.readDirR1');
            fsutil.readDirR1(localp('testdata'), wfcb);
        },
        function(files, wfcb) {
            var re = new RegExp('^' + localp('testdata/subdir1'));
            for( var fi = 0; fi < files.length; fi++ )
                if( files[fi].match(re) )
                    assert('not all files deleted');

            log('libutil.copyFile0');
            fs.writeFile(localp('testdata/copytest1.json'), JSON.stringify({abc: 'foo', def: 'bar'}), wfcb);
        },
        function(wfcb) {
            fsutil.copyFile0(localp('testdata/copytest1.json'), localp('testdata/copytest2.json'), wfcb);
        },
        function(wfcb) {
            fs.readFile(localp('testdata/copytest2.json'), wfcb);
        },
        function(data, wfcb) {
            var res = JSON.parse(data.toString('utf8'));
            assert(res.abc == 'foo' &&
                   res.def == 'bar');

            fsutil.copyFile0(localp('testdata/non-existent-file.json'), 
                             localp('testdata/another-non-existent-file.json'), 
                             function(err) {
                                 assert(err);
                                 wfcb();
                             });
        },
        function(wfcb) {
            log('libutil.getFileHash2');
            fsutil.getFileHash2(localp('testdata/test.jpg'), wfcb);
        },
        function(md5sum, base64sum, wfcb) {
            assert(md5sum == 'ba4112829550842f4fa5920d253ce801');
            assert(base64sum == 'ukESgpVQhC9PpZINJTzoAQ==');

            log('fsutil.read/writeTmpFileJSON1');
            
            fsutil.writeTmpFileJSON1({ foo: 'bar', bar: [ 1, 2, 3 ] }, wfcb);
        },
        function(tmpfile, wfcb) {
            log('got tmpfile ' + tmpfile.filename());
            tmpfilewrite = tmpfile.filename();
            fs.exists(tmpfilewrite, function(exists) {
                log('exists: ' + exists);
                assert(exists, 'error, tmp file ' + tmpfilewrite + ' does not exist');
                fsutil.readTmpFileJSON1(tmpfilewrite, tmpfile, wfcb);
            });
        },
        function(jsonobj, wfcb) {
            log('got jsonobj ' + JSON.stringify(jsonobj));
            assert.deepEqual(jsonobj, { foo: 'bar', bar: [ 1, 2, 3 ] }, 'reading or writing tmp json failed!');
            fs.exists(tmpfilewrite, function(exists) {
                assert(!exists, 'error, tmp file ' + tmpfilewrite + ' exists even after release');
                wfcb();
            }); 
        },
        function(wfcb) {
            log('fsutil.readDirR1 ' + localp(''));
            fsutil.readDirR1(path.normalize(__dirname + '/..'), wfcb);
        },
        function(files, wfcb) {
            var testfs = [ localp('lib/fsutil.js'), localp('testdata/test.jpg'), localp('test/fsutil-test.js') ];
            for( var fi = 0; fi < files.length; fi++ ) {
                assert(files[fi].indexOf(path.normalize(__dirname + '/..')) == 0);
                for( var ti = 0; ti < testfs.length; ti++ )
                    if( files[fi] == testfs[ti] )
                        testfs.splice(ti, 1);
            }
            assert(testfs.length == 0);
            wfcb();
        }
    ], testcb);
    
}

if( process.argv[2] == 'run' ) {
    exports.test0(function(err) {
        log('run test ' + (err ? 'with error: ' + err : 'ok'));
    });
}
