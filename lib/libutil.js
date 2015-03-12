var fs = require('fs');
var childp = require('child_process');
var async = require('async');
var nodeutil = require('util');
var path = require('path');
var assert = require('assert');

var log = require('./log.js');

exports.passCallbackArgs = function(fun) {
    return function() {
        var origargs = arguments;
        var origcb = origargs[origargs.length-1];

        var newargs = [ null ];
        for( var ni = 0; ni < origargs.length - 1; ni++ )
            newargs.push(origargs[ni]);

        origargs[origargs.length-1] = function(err) {
            if( err )
                origcb(err);
            else {
                for( var ai = 1; ai < arguments.length; ai++ )
                    newargs.push(arguments[ai]);
                origcb.apply({}, newargs);  
            }
        }

        fun.apply({}, origargs);
    }
}

exports.wrapCallbackMethods = function(obj) {
    for( var fun in obj ) {
        if( typeof obj[fun] != 'function' )
            continue;
        var m = fun.match(/([0-9])$/);
        if( !m || obj[fun].length < 1 ) // do not wrap anonymous functions
            continue;
        m = parseInt(m[1]);

        obj[fun] = function(origfun, numargs, funname) {
            return function() {

                // when calling all arguments must be supplied
                assert(arguments.length == origfun.length, 'invalid number of arguments to ' + funname + 
                       ' (' + arguments.length + '/' + origfun.length + ')');
                // last argument must be callback function
                var cb = arguments[arguments.length-1];
                assert(typeof cb == 'function', 'last argument to ' + funname + ' is not callback function but ' + (typeof cb));

                // enforce that callback is called exactly once
                // however, this enforcement is soft e.g. even
                // if called multiple times, rest are just ignored.
                cb = exports.safeCallback(cb);

                arguments[arguments.length-1] = function() {
                    if( arguments.length == 0 ) {
                        // clear callback allowed only if no args
                        assert(numargs == 0, 
                               'invalid number of callback arguments A(' + 
                               arguments.length + ', was expecting ' + numargs + ') from ' + funname);
                        cb();
                    } else if( arguments.length == 1 ) 
                        // if error, no more args
                        cb(arguments[0]);
                    else {
                        // if multiple args, must not have error
                        if( arguments[0] )
                            assert( arguments.length == 1, 
                                    'invalid number of callback arguments B(' + 
                                    arguments.length + ', was expecting ' + 1 + ') from ' + funname);
                        // must have correct number of args
                        assert(arguments.length == 1 + numargs, 
                               'invalid number of callback arguments C(' +
                               arguments.length + ', was expecting ' + (numargs+1) + ') from ' + funname);
                        cb.apply({}, arguments);
                    }
                };
                origfun.apply({}, arguments);
            }
        }(obj[fun], m, fun);
    }
    return obj;
}

exports.getCached1 = function(cache, id, getter, callback) {
    if( cache[id] ) {
        if( cache[id].error || cache[id].obj ) {
            process.nextTick(function() {
                if( cache[id].error )
                    callback(cache[id].error);
                else
                    callback(null, cache[id].obj);
            });
        } else
            cache[id].queue.push(callback);
    } else if( typeof getter == 'function' ) {
        cache[id] = {
            queue: [ callback ],
            error: null,
            obj: null,
        }
        
        getter(function(err, obj) {
            log('created item to cache for ' + id);

            cache[id].obj = obj;
            cache[id].error = err;
            
            var queue = cache[id].queue;
            cache[id].queue = [];

            async.eachSeries(queue, function(qitem, qcb) {
                try {
                    if( err )
                        qitem(err);
                    else
                        qitem(null, obj);
                } catch(exc) {
                    log('error running cached callback: ' + exc);
                }
                qcb();
            }, function() {
                log('done calling cached callbacks');
            });
        });
    } else {
        callback('could not get cached object and no getter');
    }
}

// async.waterfall that makes sure final callback is only given err,
// if err was not null
exports.waterfall = function(wfname, funs, cb) {

    if( typeof wfname != 'string' && typeof cb != 'function' ) {
        cb = funs;
        funs = wfname;
        wfname = null;
    }

    if( typeof cb != 'function' ) {
        log('creating a waterfall without end callback');
        var fun = function() {
            log('waterfall completed');
        }
    } else
        var fun = function(err) { 
            if( err ) 
                cb(err); 
            else
                cb.apply({}, arguments);
        }

    if( typeof wfname == 'string' ) 
        wfname += '-';
    else
        wfname = '';
    wfname += exports.getRandomStr(10) + ' ';

    for( var fi = 0; fi < funs.length; fi++ ) {
        funs[fi] = function(index, origfun) {
            
            var timercount = 0;
            return function() {
                var cbtimer = setInterval(function() {
                    log('waterfall ' + wfname + 'callback ' + 
                        index + ' not called in ' + ((++timercount)*10) + ' seconds');
                }, 10000);
                var origcb = arguments[arguments.length-1];
                arguments[arguments.length-1] = function() {
                    clearInterval(cbtimer);
                    if( origcb ) {
                        if( timercount > 0 )
                            log('waterfall ' + wfname + 'callback ' + index + ' finally called');
                        origcb.apply({}, arguments);
                        origcb = null;
                    } else
                        log('double callback call at ' + wfname);
                }
                origfun.apply({}, arguments);
            }
        }(fi, funs[fi]);
    }
    async.waterfall(funs, fun);
}

exports.attr = function(obj, attrname, defval) {
    var attrs = attrname.split('.');
    for( var ai = 0; ai < attrs.length; ai++ ) {
        if( obj == null )
            break;
        if( typeof obj == 'object' )
            obj = obj[attrs[ai]];
        else
            obj = null;
    }
    if( obj == null )
        return defval;
    return obj;
}

exports.getRandomHexStr = function(len) {
    if( len == 0 )
        return '';
    var str = '';
    while(str.length < len) 
        str += (parseInt((Math.random()+'').substring(2, 6))).toString(16);
    return str.substring(0, len);
}

exports.getRandomStr = function(len) {
    if( len == 0 )
        return '';
    var str = '';
    while(str.length < len) 
        str += (Math.random()+'').substring(2);
    return str.substring(0, len);
}

exports.deepCompare = function(obj1, obj2) {
    try {
        assert.deepEqual(obj1, obj2);
    } catch(err) {
        return false;
    }
    return true;
}

exports.deepCopy = function(obj, stack) {
    if( typeof stack != 'number' )
        stack = 0;
    if( stack >= 10 ) {
        log('stack overflowing at deepCopy');
        return null;
    }
    if( typeof obj == 'object' ) {
        if( Array.isArray(obj) ) {
            var copy = [];
            for( var ai = 0; ai < obj.length; ai++ )
                copy.push(exports.deepCopy(obj[ai], stack + 1));
            return copy;
        } else if( obj ) {
            var copy = {};
            for( var key in obj )
                copy[key] = exports.deepCopy(obj[key], stack + 1);
            return copy;
        } else
            return null;
    }
    return obj;
}

exports.createResumableFun = function(fun, interval) {

    if( typeof interval == 'undefined' )
        interval = 10000;

    var retobj = {
        status: null,
        progress: null,
        interval: interval
    };

    var progress = {};
    var status = 'paused';
    var timer = null;

    var prevmsg = null;
    var state = { 
        stop: false,
        setProgress: function(message) {
            if( !message ) {
                retobj.progress = null;
                progress = null;
            } else {
                if( typeof message == 'string' ) {
                    retobj.progress = { message: message };
                    progress = { message: message };
                } else if( typeof message != 'undefined' ) {
                    progress = message;
                    retobj.progress = message;
                }
                // also log to stderr
                if( prevmsg != progress.message && typeof progress.message == 'string' )
                    log(progress.message);
                prevmsg = progress.message;
            }
        }
    };

    var listeners = {};
    var csection = exports.criticalSection('createResumableFun');

    var waitcallback = null;

    function setStatus(newstatus) {
        status = newstatus;
        retobj.status = newstatus;
        for( var vi in listeners ) {
            try {
                listeners[vi](status);
            } catch(exc) {
                log('exception in status listener: ' + exc);
            }
        }
    }

    function run() {
        timer = null;
        setStatus('processing');

        var resfun = function(err) {
            if( err == 'skip' )
                err = null;
            if( err )
                log('error running function: ' + err);
            if( state.stop ) {
                setStatus('paused');
                var wcb = waitcallback;
                waitcallback = null;
                try {
                    if( wcb )
                        wcb();
                } catch(exc) {
                    log('exception in wait callback: ' + exc);
                }
            } else {
                setStatus('resumed');
                timer = setTimeout(run, interval);
            }
        }

        resfun = exports.safeCallback(resfun);

        try {
            fun(state, resfun);
        } catch(err) {
            resfun(err);
        }
    }

    retobj.runOnce0 = csection.wrap(function(callback) {
        state.stop = true;
        setStatus('resumed');
        setTimeout(run, 0);
        callback();
    });

    retobj.resume0 = csection.wrap(function(callback) {
        if( interval < 0 ) // do nothing for interval = -1, only runnable once
            return callback();
        state.stop = false;
        if( status == 'paused' ) {
            setStatus('resumed');
            if( !timer )
                timer = setTimeout(run, 0);
        }
        callback();
    });

    retobj.pause0 = csection.wrap(function(callback) {
        state.stop = true;
        if( status == 'resumed' ) {
            setStatus('paused');
            clearTimeout(timer);
            timer = null;
            callback();
        } else if( status == 'processing' ) {
            waitcallback = callback;
        } else // already paused
            callback();
    });

    retobj.getStatus = function() {
        return status;
    };

    retobj.getProgress = function() {
        return progress;
    };
    
    retobj.addListener1 = function(listener, callback) {
        do {
            var listenerid = exports.getRandomStr(10);
        } while( listeners[listenerid] );
        listeners[listenerid] = listener;
        callback(null, listenerid);
    };

    retobj.removeListener0 = function(listenerid, callback) {
        delete listeners[listenerid];
        callback();
    };

    return retobj;
}

exports.criticalSection = function(sectionname) {
    var blocked = false;
    var queue = [];
    var retobj = {
        enterFun: function() {
            var timer = null, timercount = 0;
            return function(callback) {
                if( blocked ) {
                    timer = setInterval(function() { log('have been waiting for ' + ((timercount++) * 10) + ' seconds at ' + sectionname); }, 10000);
                    queue.push(function() {
                        clearInterval(timer);
                        callback();
                    });
                } else {
                    blocked = true;
                    callback();
                }
            }
        },
        exitFun: function() {
            return function(callback) {
                if( queue.length > 0 ) {
                    var next = queue.shift();
                    process.nextTick(next);
                } else 
                    blocked = false;
                callback();
            }
        },
        wrap: function(fun) {
            return function() {
                var origargs = arguments;
                var origcb = origargs[origargs.length - 1];
                
                var callbackargs = null;

                retobj.enterFun()(function() {
                    origargs[origargs.length-1] = function() {
                        callbackargs = arguments;
                        retobj.exitFun()(function() {
                            origcb.apply({}, callbackargs);
                        });
                    }
                    fun.apply({}, origargs);
                });
            }   
        }
    }
    return retobj;
}

exports.exec1 = function(procname, args, options, getoutput, callback) {
    callback = exports.safeCallback(callback);

    if( !options )
	options = {};

    var str = '';
    for( var ai = 0; ai < args.length; ai++ )
        str += args[ai] + ' ';
    log('executing ' + procname + ' ' + str);
    var proc = childp.spawn(procname, args, options);
    proc.on('error', callback);
    
    var chunks = [];

    // these are read in order to prevent hang up of process that
    // outputs a lot. For some reason this may happen with at least
    // when running python scripts.
    proc.stdout.on('readable', function() {
        var buf = proc.stdout.read();
        if( buf && getoutput )
            chunks.push(buf);
    });
    if( !options.nostderr )
	proc.stderr.on('readable', function() {
            var buf = proc.stderr.read();
	});

    proc.on('close', function(exitcode) {
        if( exitcode )
            return callback('exitcode ' + exitcode);
        if( !getoutput )
            return callback(null, '');
        if( chunks.length > 0 ) {
            var output = Buffer.concat(chunks).toString('utf8');
            log('exec1 output ' + output);
            return callback(null, output);
        }
        return callback(null, '');
    });

    return proc;
}

exports.safeCallback = function(timeout, cb) {
    if( typeof timeout == 'function' ) {
        cb = timeout;
        timeout = -1;
    }
    var applytimeout = null;
    var applyfun = function() {
        try {
            if( applytimeout )
                clearTimeout(applytimeout);
            var tmpcb = cb;
            cb = null;
            if( tmpcb ) {
                if( !arguments[0] )
                    tmpcb.apply({}, arguments);
                else
                    tmpcb.apply({}, [ arguments[0] ]);
            }
            // else
            //    log('double calling function');
        } catch(err) {
            log('error calling function: ' + err);
        }
    }
    if( typeof timeout == 'number' && timeout >= 0 )
        applytimeout = setTimeout(function() {
            applytimeout = null;
            applyfun('timeout');
        },  timeout);
    return applyfun;
}

exports.safeFun = function(cb) {
    return function() {
        try {
            cb.apply({}, arguments);
        } catch(err) {
            log('error calling function: ' + err);
        }
    }
}

exports.timeoutRetryFun = function(error, retries, timeout, fun) {
    return function() {
        var origargs = arguments;
        var origcb = origargs[origargs.length-1];
        
        var cont = true;
        var results = null;
        async.whilst(
            function() { return cont; },
            function(whcb) {
                var args = [];
                for( var ai = 0; ai < origargs.length; ai++ )
                    args.push(origargs[ai]);
                args[args.length-1] = function() {
                    if( nodeutil.isError(arguments[0]) )
                        var err = arguments[0].message;
                    else if( typeof arguments[0] == 'string' )
                        var err = arguments[0];
                    else if( arguments[0] )
                        var err = (arguments[0] + '');
                    
                    if( typeof err == 'string' ) {
                        log('got error ' + err + ', matching with ' + error);
                        if( err.match(error) ) {
                            if( retries > 0 ) {
                                retries--;
                                log('timeout to retry fun');
                                return setTimeout(whcb, timeout);
                            } else {
                                log('maxed out retries');
                                cont = false;
                                results = [ arguments[0] ];
                                return whcb();
                            }
                        } 
                    }

                    results = arguments;
                    cont = false;
                    whcb();
                }
                fun.apply({}, args);
            },
            function(err) {
                if( err )
                    log('unknown exception ' + err);
                origcb.apply({}, results);
            });
    }
}

exports.removeDuplicates = function(arr, fun){
    for( var i1 = 0; i1 < arr.length; i1++ ) {
        for( var i2 = 0; i2 < arr.length; i2++ ) {
            if( i1 == i2 )
                continue;
            var cmp = fun(arr[i1], arr[i2]);
            if( cmp == 0 ) 
                continue;
            if( cmp < 0 )
                arr.splice(i1, 1);
            else
                arr.splice(i2, 1);
            i1--;
            i2--;
            break;
        }
    }
    return arr;
}

var Transform = require('stream').Transform;
require('util').inherits(ProgressStream, Transform);

function ProgressStream(size, progcb) {
    if( !(this instanceof ProgressStream) )
        return new ProgressStream();
    Transform.call(this, {});
    this.bytes = 0;
    this.max = size;
    this.progresscb = progcb;
}

ProgressStream.prototype._transform = function(chunk, encoding, done) {

    this.bytes += chunk.length;
    this.progresscb(Math.floor(100*this.bytes/this.max), this.bytes);

    this.push(chunk);
    done();
}

exports.ProgressStream = ProgressStream;

exports.findSmallest = function(collection, fun, limit) {
    var first = true;
    var result = null;
    var smallest = 0;
    if( collection.length ) {
        for( var vi = 0; vi < collection.length; vi++ ) {
            var val = fun(collection[vi]);
            if( ( first || val < smallest ) && val >= 0 && ( val < limit || limit < 0 ) ) {
                first = false;
                smallest = val;
                result = collection[vi];
            }
        }
    } else
        for( var vi in collection ) {
            var val = fun(collection[vi]);
            if( ( first || val < smallest ) && val >= 0 && ( val < limit || limit < 0 ) ) {
                first = false;
                smallest = val;
                result = collection[vi];
            }
        }
    return result;    
}

var indents = {};
function indentFun(num) {
    if( typeof indents[num] == 'undefined' ) {
        var str = '';
        for( var ni = 0; ni < num; ni++ )
            str += ' ';
        indents[num] = str;
    }
    return indents[num];
}

function prettyPrintJSON(obj, indent) {
    if( typeof indent != 'number' )
        indent = 0;
    var str = '';
    
    if( typeof obj == 'object' ) {
        if( Array.isArray(obj) ) {
            str += '[ ';
            for( var ai = 0; ai < obj.length; ai++ ) {
                str += prettyPrintJSON(obj[ai], indent + 2);

                if( ai < obj.length - 1 )
                    str += ', ';
            }
            str += ' ]';
        } else {
            str += '{';
            var first = true;
            for( var ai in obj ) {
                if( !first ) 
                    str += ',';
                first = false;
                str += '\n' + indentFun(indent + 2) + '"' + ai + '": '; 
                str += prettyPrintJSON(obj[ai], indent + 4);
            }
            str += '\n' + indentFun(indent-2) + '}';
        }
    } else {
        str += JSON.stringify(obj);
    }

    return str;
}

exports.prettify = function(obj) {
    var str = prettyPrintJSON(obj);

    try {
        var testobj = JSON.parse(str);
        assert.deepEqual(testobj, obj);
    } catch(error) {
        //process.stderr.write('invalid prettifying result\n');
        return JSON.stringify(obj);
    }

    return str;
}



