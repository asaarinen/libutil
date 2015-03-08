module.exports = function(str, stream) {
    var now = new Date();
    var stack = new Error().stack.split('\n');
    
    for( var si = 2; si < stack.length; si++ ) {
        var m = stack[si].match(/at .+\/([^\/]+):[0-9]+/);
        if( m ) {
            stack = m[1];
            break;
        }
    }
    
    var msg = {
	    time: now.toISOString(),
	    stack: stack,
	    log: str
    };
    
    //process.stderr.write('{"time":"' + msg.time + '","stack":"' + msg.stack + '",\t"log":"' + msg.log + '"},\n');
    //return;
    
    var ms = msg.stack;
    while(ms.length < 30 )
        ms += ' ';
    
    var mt = msg.time.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T([0-9]{2}:[0-9]{2}:[0-9]{2})\.[0-9]{3}Z$/);
    if( mt )
        mt = mt[1];
    else
        mt = msg.time;
    
    if( !stream )
        stream = process.stderr;
    stream.write(mt + ' ' + ms + msg.log + '\n');
}

