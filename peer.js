function debug(...args){
    console.log(...args);
}
class VCPeer {
    constructor(id, data = {position:{x:0, y:0}}, options = {}) {
        this.peer = new Peer(id, options);
        this.init();
        data.radius ||= 4;
        this.data = {
            [id]:data
        };
    }
    init() {
        var inst = this;
        this.audio = {};
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
        this.data[this.peer.id].position = {x, y};
        this.sendToServer({
            func: "changeData",
            args: {position:{x, y}}
        })
        this.connectOutCalls();
        return true;
    }
    callUnderRadius(peer, type){
        this.calls.out[peer] ||= [];
        if(peer == this.peer.id) return false;
        let r = this.data[this.peer.id].radius; // radius
        let d = this.distance(peer, this.peer.id); // distance
        let v = 1 - 0.25 * d; // cannot here after 4 meters // maximum limit
        
        if(v > 0 && r >= d) {
            console.log(peer, type, v);
            if(!this.calls.out[peer][type]){
                this.call(peer, "voice", {
                    metadata:{
                        volume:v
                    }
                });
            } else {
                this.audio[peer].volume = v;
            }
        } else {
            this.disconnectCall("out", peer, "voice");
        }
    }
    connectOutCalls(){
        for(var peer in this.data){
            this.callUnderRadius(peer, "voice");
        }
    }
    call(id, type, options = {}) { // make a 
        if(peer == this.peer.id) return false;
        this.disconnectCall("out", peer, type);
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
                options.metadata.type = type;
                var call = inst.peer.call(id, stream, options);

                inst.calls.out[call.peer] ||= {};
                inst.calls.out[call.peer][type] = call;
                
                call.on('close', function () {
                    inst.calls.out[call.peer][type] = null;
                });
            })
            .catch(function (err) {
                console.log("error: " + err);
            })
    }
    answerCall(call) {
        var inst = this;
        var type = call.metadata.type;
        this.disconnectCall("in", call.peer, type);
        this.calls.in[call.peer] ||= {};
        this.calls.in[call.peer][type] = call;
        call.answer();
        call.on('stream', function (stream) {
            console.log(stream);
            inst.audio[call.peer] = document.createElement("audio");
            document.body.appendChild(inst.audio[call.peer]);
            inst.audio[call.peer].srcObject = stream;
            inst.audio[call.peer].volume = call.metadata.volume;
            inst.audio[call.peer].play();
            console.log(inst.audio);
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
            this.disconnectCall("out", peer, "voice");
        }
    }
    disconnectCall(inout, peer, type) {
        this.calls[inout][peer] ||= {};
        this.calls[inout][peer][type]?.close();
        if(inout == "in" && this.audio[peer]){
            this.audio[peer].parentNode.removeChild(this.audio[peer]);
        }
        
    }
    sendToServer(message) {
        this.serverConnection.send(message);
    }
    changePeerData(peer, upd){
        this.data[peer] ||= {};
        for(var key in upd){
            this.data[peer][key] = upd[key];
            if(key == "position" && peer != this.peer.id){
                // console.log(this.data[peer].position, "callUnderRadius");
                this.callUnderRadius(peer, "voice");
            }
        }
        updateStats();
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
function updateStats(){
    document.getElementById("stats").innerHTML = JSON.stringify(peer.data, "   ");
}