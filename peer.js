function debug(...args){
    console.log(...args);
}
class VCPeer {
    constructor(id, data = {position:{x:0, y:0}}, options = {}) {
        this.peer = new Peer(id, options);
        this.init();
        this.data = {
            [id]:data
        };
    }
    init() {
        var inst = this;
        
        this.calls = { in: {}, out: {} };

        this.peer.on('open', function (id) {
            console.log('My peer ID is: ' + id);
            inst.connectToServer();
        });
        this.peer.on('call', function (call) {
            switch (call.metadata.type) {
                case 'voice':
                case 'video':
                case 'screen':
                    inst.answerCall(call);
                    break;
                default:
                    call.close();
                    throw Error("Unknown call type");
                    break;
            }
        })
    }
    connectToServer(){
        let inst = this;
        if (!inst.peer.id.startsWith("server")) {
            var options = {
                metadata: this.data[this.peer.id]
            }
            var conn = inst.serverConnection = inst.peer.connect("server", options);
            conn.on('open', function () {
                conn.on('data', inst.handleServerData.bind(inst, conn));
                console.log("Connection Established To Server.");
            });
        }
    }
    changePosition(x, y) {
        this.position.x = x;
        this.position.y = y;
        this.sendToServer({
            func: "changeData",
            args: {position:{x, y}}
        })
        this.connectOutCalls();
        return true;
    }
    
    call(id, type, options = {}) { // make a 
        debug("Calling ", id, "type", type )
        // handle browser prefixes
        var inst = this;
        // Get access to microphone
        var mediaOptions;
        switch (type) {
            case "screen":
                mediaOptions = {
                    video: {
                        mediaSource: "screen"
                    },
                    audio: false
                };
                break;
            case "voice":
                mediaOptions = {
                    video: false,
                    audio: true
                }
                break;
            case "video":
                mediaOptions = {
                    video: true,
                    audio: false
                }
                break;
            default:
                throw Error("Unknown Call Type:", type);
        }

        navigator.mediaDevices.getUserMedia(mediaOptions)
            .then(function (stream) {
                options.metadata = {
                    type
                };
                var call = inst.peer.call(id, stream, options);

                inst.calls.out[call.peer] ||= {};
                inst.calls.out[call.peer][type] = call;

            })
            .catch(function (err) {
                console.log("error: " + err);
            })
    }
    answerCall(call) {
        var type = call.metadata.type;
        this.disconnectCall("in", call.peer, type);
        this.calls.in[call.peer] ||= {};
        this.calls.in[call.peer][type] = call;
        call.answer();
        call.on('stream', function (stream) {
            console.log(stream);
            handleStream(stream);
        })
    }
    
    distance(peer1, peer2) {
        var inst = this;

        var x1 = inst.data[peer1].position.x, y1 = inst.data[peer1].position.y,
            x2 = inst.data[peer2].position.x, y2 = inst.data[peer2].position.y;

        return Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2));
    }
    disconnectOutCalls(){
        for(var peer in this.calls["out"]){
            this.calls["out"][peer]["voice"]?.close();
        }
    }
    disconnectCall(inout, peer, type) {
        this.calls[inout][peer] ||= {};
        this.calls[inout][peer][type]?.close();
    }
    sendToServer(message) {
        this.serverConnection.send(message);
    }
    changePeerData(peer, upd){
        this.data[peer] ||= {};
        for(var key in upd){
            this.data[peer][key] = upd[key];
            if(key == "position" && peer != this.peer.id){
                if(this.distance(peer, this.peer.id) < 4) {
                    this.call(peer, "voice");
                }
            }
        }
        
    }
    handleServerData(conn, message) {
        var inst = this;
        var functions = {
            changePeerData(conn, args) {
                this.changePeerData(args.peer, args.data);
            }
        };
        console.log("Server("+conn.peer+") says", message.func, message.args);
        functions[message.func].call(this, conn, message.args);
    }
}