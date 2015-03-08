var async = require('async');
var assert = require('assert');
var fs = require('fs');

var log = require('../lib/log.js');
var util = require('../index.js');
var fsutil = util.fs;
var tmpfileutil = util.tmp;

exports.test0 = function(testcb) {

    var tmpfilein = null, tmpfileout = null;
    var tmpfileinhash = null, maxbytes = 0;

    log('testing libutil.js');
    async.waterfall([
        function(wfcb) {
            log('testing removeDuplicates');
            var uniq = util.removeDuplicates([ 
                { key: 'abc', time: 10 },
                { key: 'abc', time: 1 },
                { key: 'def', time: 10 },
                { key: 'ghi', time: 10 },
                { key: 'jkl', time: 10 },
                { key: 'ghi', time: 10 },
                { key: 'abc', time: 12 }
            ], function(a, b) {
                if( a.key == b.key ) {
                    if( a.time > b.time )
                        return 1;
                    return -1;
                } 
                return 0;
            });
            assert.deepEqual(uniq, [ 
                { key: 'def', time: 10 },
                { key: 'jkl', time: 10 },
                { key: 'ghi', time: 10 },
                { key: 'abc', time: 12 }
            ]);
            wfcb();
        },
        tmpfileutil.tmpFileFun('libutil-test'),
        function(_tmpfileout, wfcb) {
            tmpfileout = _tmpfileout;
            wfcb();
        },
        tmpfileutil.tmpFileTouchFun('libutil-test'),
        function(_tmpfilein, tmpsize, wfcb) {
            tmpfilein = _tmpfilein;
            log('testing ProgressStream');
            fsutil.getFileInfo3(tmpfilein.filename(), wfcb);
        },
        function(size, hash1, hash2, wfcb) {
            tmpfileinhash = hash1;
            var infs = fs.createReadStream(tmpfilein.filename());
            var progs = new util.ProgressStream(size, function(prog, bytes) {
                assert(prog >= 0 && prog <= 100);
                assert(bytes > maxbytes);
                maxbytes = bytes;
            });
            infs.pipe(progs);
            
            var outfs = fs.createWriteStream(tmpfileout.filename());
            progs.pipe(outfs);
            outfs.on('close', function(err) {
                assert(maxbytes == size);
                wfcb(err);
            });
        },
        function(wfcb) {
            fsutil.getFileInfo3(tmpfileout.filename(), wfcb);
        },
        function(size, hash1, hash2, wfcb) {
            assert(hash1 == tmpfileinhash);
            log('ProgressStream test ok');
            wfcb();
        },
        function(wfcb) {
            log('libutil.passCallbackArgs');
            util.waterfall([
                function(wfcb2) {
                    wfcb2(null, 5, 'abc');
                },
                util.passCallbackArgs(function(arg1, arg2, wfcb2) {
                    assert(arg1 == 5);
                    assert(arg2 == 'abc');          
                    wfcb2(null, 'boo');
                }),
                function(arg1, arg2, arg3, wfcb2) {
                    assert(arg1 == 5);
                    assert(arg2 == 'abc');
                    assert(arg3 == 'boo');
                    wfcb2();
                },
                function(wfcb2) {
                    util.passCallbackArgs(function(arg1, arg2, wfcb3) {
                        wfcb3('test error', 56);
                    })(3, 4, function(err, arg4) {
                        assert(err == 'test error');
                        assert(typeof arg4 == 'undefined');
                        wfcb2();
                    });
                }
            ], wfcb);
        },
        function(wfcb) {
            log('libutil.wrapCallbackMethods');
            var obj = function TestObject() {
                var retobj = {};

                retobj.testMethod3 = function(a, b, cb) {
                    log('testmethod3');
                    cb(null, 1, 2, null);
                    cb(null, 3, 4, 5);
                }

                retobj.testMethod0 = function(a, b, c, cb) {
                    cb('error');
                }

                retobj.testMethod6 = function(cb) {
                    cb(null, 3, 4, 'abc', 44, function() {}, 'tre');
                }

                retobj.errorMethod2 = function(cb) {
                    cb(null, 4);
                }
                
                retobj.errorMethod5 = function(cb) {
                    cb('error', 5);
                }

                return util.wrapCallbackMethods(retobj);
            }();

            async.waterfall([
                function(wfcb2) {
                    try {
                        obj.testMethod3(1, 2, function(){});
                        wfcb2();
                    } catch(err) {
                        wfcb2('error 1: ' + err);
                    }
                },
                function(wfcb2) {
                    try {
                        obj.testMethod0(1, 2, function(){});
                        wfcb2('error 2');
                    } catch(err) {
                        if( (err+'').match(/^AssertionError/) )
                            wfcb2();
                        else
                            wfcb2('error 2');
                    }
                },
                function(wfcb2) {
                    try {
                        obj.testMethod6(function(){});
                        wfcb2();
                    } catch(err) {
                        wfcb2('error 3');
                    }
                },
                function(wfcb2) {
                    try {
                        obj.errorMethod2(function(){});
                        wfcb2('error 4');
                    } catch(err) {
                        if( (err+'').match(/^AssertionError/) )
                            wfcb2();
                        else
                            wfcb2('error 4');
                    }
                },
                function(wfcb2) {
                    try {
                        obj.errorMethod2(function(){});
                        wfcb2('error 5');
                    } catch(err) {
                        if( (err+'').match(/^AssertionError/) )
                            wfcb2();
                        else
                            wfcb2('error 5');
                    }
                }
            ], wfcb);
        },
        function(wfcb) {
            log('libutil.waterfall 1');
            util.waterfall([
                function(wfcb2) {
                    wfcb2('error', 1, 2, 3);
                }
            ], function(err, a, b, c) {
                assert(err == 'error' &&
                       (typeof a == 'undefined') &&
                       (typeof b == 'undefined') &&
                       (typeof c == 'undefined'));
                wfcb();
            });
        },
        function(wfcb) {
            log('libutil.waterfall 2');
            util.waterfall([
                function(wfcb2) {
                    wfcb2(null, 1, 2, 3);
                }
            ], function(err, a, b, c, d) {
                assert(err == null &&
                       a == 1 && b == 2 && c == 3 &&
                       (typeof d == 'undefined'));
                wfcb();
            }); 
        },
        function(wfcb) {
            log('libutil.waterfall 3');
            util.waterfall('named', [
                function(wfcb2) {
                    setTimeout(function() {
                        wfcb2(null, 3, 4, 5);
                    }, 15000);
                },
                function(a, b, c, wfcb2) {
                    assert(a == 3 && b == 4 && c == 5);
                    setTimeout(function() {
                        wfcb2();
                    }, 15000);
                },
                function(wfcb2) {
                    setTimeout(function() {
                        wfcb2('error');
                    }, 5000);
                    setTimeout(function() {
                        wfcb2();
                    }, 7500);
                },
                function(wfcb2) {
                    assert(false);
                }
            ], function(err) {
                assert(err == 'error');
                wfcb();
            });
        },
        function(wfcb) {
            log('libutil.attr');
            var testobj = {
                attr1: {
                    nestedattr: {
                        nestedattr2: 'barfoo'
                    }
                },
                attr2: 'foobar'
            }
            var a1 = util.attr(testobj, 'attr1.nestedattr.nestedattr2', '234');
            assert(a1 == 'barfoo');
            var a2 = util.attr(testobj, 'attr1.nestedattr.foobar', '456');
            assert(a2 == '456');
            var a3 = util.attr(testobj, 'attr2');
            assert(a3 == 'foobar');
            var a4 = util.attr(testobj, 'attr3');
            assert(a4 == null);
            wfcb();
        },
        function(wfcb) {
            log('libutil.deepCopy');
            assert.deepEqual([], util.deepCopy([]));
            assert.deepEqual({}, util.deepCopy({}));
            assert.deepEqual(null, util.deepCopy(null));
            assert.deepEqual({ a: [], b: 'foo' }, util.deepCopy({ a: [], b: 'foo' }));
            assert.deepEqual({ a: [ 4, 5, { tre: 'abc' } ], b: 'foo' }, util.deepCopy({ a: [ 4, 5, { tre: 'abc' } ], b: 'foo' }));
            wfcb();
        },
        function(wfcb) {
            log('libutil.getRandomStr');
            var s1 = util.getRandomStr(20);
            assert(s1.match(/^[0-9]{20}$/));
            var s2 = util.getRandomStr(15);
            assert(s2.match(/^[0-9]{15}$/));
            var s3 = util.getRandomStr(10);
            assert(s3.match(/^[0-9]{10}$/));
            var s4 = util.getRandomStr();
            assert(s4 == '');
            wfcb();
        },
        function(wfcb) {
            log('libutil.getRandomHexStr');
            var s1 = util.getRandomHexStr(20);
            assert(s1.match(/^[0-9a-f]{20}$/));
            var s2 = util.getRandomHexStr(15);
            assert(s2.match(/^[0-9a-f]{15}$/));
            var s3 = util.getRandomHexStr(10);
            assert(s3.match(/^[0-9a-f]{10}$/));
            var s4 = util.getRandomHexStr();
            assert(s4 == '');
            wfcb();
        },
        function(wfcb) {
            log('libutil.exec1');
            util.exec1('echo', [ 'abc', 'def' ], {}, true, wfcb);
        },
        function(out, wfcb) {
            assert(out == 'abc def\n');
            util.exec1('echo', [ 'abc', 'def' ], {}, false, wfcb);
        },
        function(out, wfcb) {
            assert(out == '');
            util.exec1('nonexistentprog', [ 'a', 'b', 'c' ], {}, true, function(err) {
                assert(err);
                wfcb();
            });
        },
        function(wfcb) {
            log('libutil.safeCallback');
            var first = true;
            var callback = function(err, a1, a2, a3) {
                assert(first);
                first = false;
                assert(a1 == 1 && a2 == 2 && a3 == 3);
                wfcb();
            }
            callback = util.safeCallback(callback);
            callback(null, 1, 2, 3);
            callback(null, 4, 5, 6);
        },
        function(wfcb) {
            var callback = function(err) {
                assert(err == 'timeout');
                wfcb();
            }
            callback = util.safeCallback(1000, callback);
        },
        function(wfcb) {
            var resumable = util.createResumableFun(function(state, callback) {
                log('running');
                util.waterfall([
                    function(wfcb) {
                        log('running A');
                        if( state.stop )
                            return wfcb('stopped');
                        setTimeout(wfcb, 100);
                    },
                    function(wfcb) {
                        log('running B');
                        if( state.stop )
                            return wfcb('stopped');
                        setTimeout(wfcb, 100);
                    },
                    function(wfcb) {
                        log('running C');
                        if( state.stop )
                            return wfcb('stopped');
                        setTimeout(wfcb, 100);
                    },
                    function(wfcb) {
                        log('running D');
                        if( state.stop )
                            return wfcb('stopped');
                        setTimeout(wfcb, 100);
                    },
                    function(wfcb) {
                        log('running E');
                        if( state.stop )
                            return wfcb('stopped');
                        setTimeout(wfcb, 100);
                    }
                ], function(err) {
                    log('not running');
                    callback(err);
                });
            }, 500);
            
            assert(resumable.getStatus() == 'paused');

            util.waterfall([
                function(wfcb2) {
                    resumable.addListener1(function(status) {
                        log('resumable status ' + status);
                    }, wfcb2);
                },
                function(_listenerid, wfcb2) {
                    resumable.resume0(wfcb2);
                },
                function(wfcb2) {
                    log('running for 1250 ms');
                    setTimeout(wfcb2, 1250);
                },
                function(wfcb2) {
                    log('pausing mid processing');
                    resumable.pause0(wfcb2);
                }
            ], wfcb);
        },
        function(wfcb) {
            var resumable = util.createResumableFun(function(state, callback) {
                log('running with exception');
                throw 'error within resumable fun';
            }, 500);
            
            assert(resumable.getStatus() == 'paused');

            util.waterfall([
                function(wfcb2) {
                    resumable.addListener1(function(status) {
                        log('resumable status ' + status);
                    }, wfcb2);
                },
                function(_listenerid, wfcb2) {
                    resumable.resume0(wfcb2);
                },
                function(wfcb2) {
                    log('running for 1250 ms');
                    setTimeout(wfcb2, 1250);
                },
                function(wfcb2) {
                    log('pausing mid processing');
                    resumable.pause0(wfcb2);
                }
            ], wfcb);
        },
        function(wfcb) {
            log('libutil.criticalSection.wrap');

            var insidecount = 0;
            function testwf(n, callback) {
                insidecount++;
                assert(insidecount <= 1);
                //log('inside critical section');
                setTimeout(function() {
                    //log('leaving critical section');
                    insidecount--;
                    assert(insidecount == 0);
                    callback(null, n);
                }, 100);
            }

            testwf = util.criticalSection('test').wrap(testwf);
            async.times(15, testwf, function(err, data) { 
                assert(!err);
                assert(data.length == 15);
                for( var ti = 0; ti < 14; ti++ )
                    assert(data[ti] == ti);
                wfcb(); 
            });
        },
        function(wfcb) {
            log('libutil.criticalSection.enterFun');
            log('libutil.criticalSection.exitFun');
            var insidecount = 0;
            var cs = util.criticalSection();

            function testwf(n, callback) {
                util.waterfall([
                    function(wfcb2) {
                        //log('entering critical section');
                        wfcb2();
                    },
                    cs.enterFun(),
                    function(wfcb2) {
                        insidecount++;
                        assert(insidecount <= 1);
                        //log('inside critical section');
                        setTimeout(function() {
                            insidecount--;
                            assert(insidecount == 0);
                            wfcb2();
                        }, 100);
                    },
                    cs.exitFun(),
                    function(wfcb2) {
                        //log('exiting critical section');
                        wfcb2();
                    }
                ], callback);
            }
            async.times(15, testwf, function(err) { wfcb(err); });
        },
        function(wfcb) {
            log('libutil.timeoutRetryFun');
            var count = 0;
            util.timeoutRetryFun('NoSuchBucket', 3, 3000, (function(cb) {
                log('calling again');
                setTimeout(function() {
                    if( count == 0 )
                        cb('NoSuchBucketError');
                    else if( count == 1 )
                        cb('NoSuchBucketError2');
                    else
                        cb();
                    count++;
                }, 1000);
            }))(wfcb);
        },
        function(wfcb) {
            var count = 0;
            util.timeoutRetryFun('NoSuchBucket', 3, 3000, (function(cb) {
                log('calling again 2');
                setTimeout(function() {
                    cb('NoSuchBucketError');
                }, 0);
            }))(function(err) {
                assert(err);
                wfcb();
            });
        },
        function(wfcb) {
            log('got through');
            wfcb();
        }
    ], testcb);
}

if( process.argv[2] == 'run' ) {
    exports.test0(function(err) {
        log('run test ' + (err ? 'with error: ' + err : 'ok'));
    });
}
