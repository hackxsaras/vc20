
var deb = {
    ls(...args) {
        console.log(...args);
        if (c.model.serverConnection)
            c.model.sendToServer({
                func: "log",
                args
            })
    },
    r(...args) {
        deb.ls("%c[-]", "color:#f05", ...args);
    },
    g(...args) {
        deb.ls("%c[+]", "color:#0f5", ...args);
    },
    b(...args) {
        deb.ls("%c[i]", "color:#05f", ...args);
    },
    w(...args) {
        deb.ls("%c[o]", "color:white", ...args);
    },
    e(...args) {
        console.error(...args);
    }
}

class Model {
    constructor(id) {
        var inst = this;
        this.peer = new Peer(id);
        //     , {
        //     host: "localhost",
        //     port: 9000,
        //     path: "/myapp"
        // });

        this.outStream = null;
        this.inStreams = {};
        this.inCalls = {};
        this.outCalls = {};
        this.initiatedCalls = {};

        this.listeners = {};

        this.peers = { [id]: { position: { x: 3, y: 3 } } };

        this.peer.on("open", (id) => {
            deb.g("Peer id: " + id);
            inst.connectToLeader();
        });
        this.peer.on("call", this.answerCall.bind(this));


    }
    distance(peer1, peer2) {
        var inst = this;

        var x1 = inst.peers[peer1].position.x, y1 = inst.peers[peer1].position.y,
            x2 = inst.peers[peer2].position.x, y2 = inst.peers[peer2].position.y;

        return Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2));
    }
    changePosition(x, y) {
        var change = {position:{x, y}};
        this.updatePeer(this.peer.id, change);
        this.sendToServer({
            func: "changeData",
            args: change
        })
        for(var key in this.peers) {
            this.updatePeer(key, {});
        }
    }
    updatePeer(id, data) {
        if(!this.peers[id])
            this.peers[id] = data;
        for(var key in data){
            this.peers[id][key] = data[key];
        }

        this.peers[id].distance = this.distance(this.peer.id, id);

        if(this.peers[id].distance > 4) {
            this.disconnectCall("out", id); // disconnect this call
        } 
        else if(this.initiatedCalls[id] && !this.outCalls[id]) {
            this.call(id); // reconnect again
        }
        
        this.dispatch("peer-update", id, this.peers[id]);
    }
    setList(list) { // just reset all the calls
        for (var id in list) {
            this.updatePeer(id, list[id]);
        }
        this.dispatch("list-update", this.peers);
        this.initiateCalls();
    }

    // Providing events
    on(fn, callback) {
        this.listeners[fn] = callback;
    }
    dispatch(fn, ...args) {
        if (this.listeners[fn]) {
            return this.listeners[fn](...args);
        }
    }

    // PeerJS
    connectToLeader() {
        var inst = this;

        var options = {
            metadata: this.peers[this.peer.id]
        }
        var conn = inst.serverConnection = inst.peer.connect("server", options);
        conn.on('open', function () {
            conn.on('data', inst.handleServerData.bind(inst, conn));
            deb.g("Connection Established To Server.");
        });
    }

    initiateCalls() {
        for (var peer in this.peers) {
            this.call(peer, { new: true });
        }
        this.initiatedCalls[peer] = true;
    }
    callUtil(peer, meta) {
        this.outCalls[peer] = this.peer.call(peer, this.outStream, {
            metadata: meta
        });
    }
    call(peer, meta) {
        var inst = this;
        if (peer == this.peer.id) {
            return;
        }
        deb.g("Calling", peer, "with", meta);
        if (!this.outStream) {
            this.dispatch("request-stream").then(function (stream) {
                inst.outStream = stream;
                inst.callUtil(peer, meta);
            });
        } else {
            inst.callUtil(peer, meta);
        }
    }
    updateInStream(peer, stream) {
        this.inStreams[peer] = stream;
        this.dispatch("stream-update", peer, stream);
    }
    answerCall(call) {
        var inst = this;
        this.disconnectCall("in", call.peer);
        deb.g("Answering call from", call.peer);
        call.answer();
        call.on('stream', function (stream) {
            inst.updateInStream(call.peer, stream);
        })
        if (call.metadata && call.metadata.new) {
            this.call(call.peer);
        }
    }
    disconnectCall(type, peer) {
        if (type == "in") {
            if(this.inCalls[peer]) {
                deb.r("Disconnecting Call", type, "from", peer);
                this.inCalls[peer]?.close();
                delete this.inCalls[peer];
                this.updateInStream(peer, null);
            }
        } else {
            if(this.outCalls[peer]) {
                deb.r("Disconnecting Call", type, "from", peer);
                this.outCalls[peer]?.close();
                delete this.outCalls[peer];
            }
        }
    }
    sendToServer(message) {
        this.serverConnection.send(message);
    }
    handleServerData(conn, message){
        var inst = this;
        var functions = {
            setList(conn, args) {
                inst.setList(args.list);
            },
            updatePeer(conn, args) {
                inst.updatePeer(args.peer, args.data);
            }
        };
        deb.b("Server("+conn.peer+") says", message.func, message.args);
        functions[message.func].call(this, conn, message.args);
    }
}
class View {
    constructor(id) {
        this.id = id;
        this.playground = document.getElementById("playground");
        this.peers = {};
        this.audios = {};
        this.distances = {};
    }
    playAudio(peer, stream) {
        if (!this.audios[peer]) {
            this.audios[peer] = document.createElement("audio");
            document.body.appendChild(this.audios[peer]);
        }
        if( stream == null) {
            // delete this audio
            this.audios[peer].parentNode.removeChild(this.audios[peer]);
            delete this.audios[peer];
            return;
        }
        this.audios[peer].srcObject = stream;
        this.updateVolume(peer);
        this.audios[peer].play();
    }
    updateVolume(peer){
        if(this.audios[peer]){
            let d = this.distances[peer];
            let v = 1 - 0.25 * d; // cannot here after 4 meters // maximum limit
            v = Math.max(v, 0);
            deb.g("Altering volume for peer"+peer+": "+v);
            this.audios[peer].volume = v;
        }
    }
    displayPeer(peer, data) {
        if (!this.peers[peer]) {
            var el = document.createElement("div");
            el.innerHTML = peer;
            el.classList.add("vc-peer");
            this.playground.appendChild(el);
            this.peers[peer] = el;
        }
        this.peers[peer].style.top = (data.position.y*50)+"px";
        this.peers[peer].style.left = (data.position.x*50)+"px";
        this.peers[peer].innerHTML = peer;
        
        this.distances[peer] = data.distance;

        this.updateVolume(peer);
    }
    displayList(list) {
        for (var peer in list) {
            this.displayPeer(peer, list[peer]);
        }
    }
    async requestStream() {
        var stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
        });
        return stream;
    }
}
class Controller {
    constructor(id) {

        this.model = new Model(id);
        this.view = new View(id);

        this.model.on("list-update", this.onListUpdated.bind(this));
        this.model.on("peer-update", this.onPeerUpdated.bind(this));
        this.model.on("request-stream", this.onRequestStream.bind(this));
        this.model.on("stream-update", this.onUpdateStream.bind(this));
    }
    onListUpdated(list) {
        this.view.displayList(list);
    }
    onPeerUpdated(peer, data) {
        this.view.displayPeer(peer, data);
    }
    onRequestStream() {
        return this.view.requestStream();
    }
    onUpdateStream(peer, stream) {
        this.view.playAudio(peer, stream);
    }
}

var id = new URL(location.href).searchParams.get('id');
var c = new Controller(id || "id1");
// setTimeout(function (){
//     switch(id) {
//         case "id2":
//             c.model.changePosition(1, 2);
//             break;
//         case "id3":
//             c.model.changePosition(5, 6);
//             break;
//         default:
//             ;
//     }
// }, 3000);
