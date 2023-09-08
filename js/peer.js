
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
        this.callStamp = {};

        this.listeners = {};

        this.peers = { [id]: { position: { x: 3, y: 3 } } };

        this.peer.on("open", (id) => {
            deb.g("Connected with Peer id: " + id);
            inst.connectToLeader();
        });
        this.peer.on("disconnected", (id) => {
            console.log("You are disconnected.");
            inst.peer.reconnect();
        })
        this.peer.on("call", this.answerCall.bind(this));


    }
    distance(peer1, peer2) {
        var inst = this;

        var x1 = inst.peers[peer1].position.x, y1 = inst.peers[peer1].position.y,
            x2 = inst.peers[peer2].position.x, y2 = inst.peers[peer2].position.y;

        return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
    }
    changePosition(x, y) {
        var change = { position: { x, y } };
        this.updatePeer(this.peer.id, change);
        this.sendToServer({
            func: "changeData",
            args: change
        })
        for (var key in this.peers) {
            this.updatePeer(key, {});
        }
    }
    updatePeer(id, data) {
        if (!this.peers[id])
            this.peers[id] = data;
        for (var key in data) {
            this.peers[id][key] = data[key];
        }

        this.peers[id].distance = this.distance(this.peer.id, id);

        if (this.peers[id].distance > 4) {
            this.disconnectCall("out", id); // disconnect this call
        }
        else if (!this.outCalls[id]) {
            this.call(id);
        }

        this.dispatch("peerUpdated", id, this.peers[id]);
    }
    setList(list) { // just reset all the calls
        for (var id in list) {
            this.updatePeer(id, list[id]);
        }
        this.dispatch("listUpdated", this.peers);
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
    callUtil(peer) {
        this.outCalls[peer] = this.peer.call(peer, this.outStream);
    }
    call(peer) {
        var inst = this;
        if (peer == this.peer.id) {
            return;
        }
        deb.g("Calling", peer);
        if (!this.outStream) {
            this.dispatch("requestStream").then(function (stream) {
                inst.outStream = stream;
                inst.callUtil(peer);
            });
        } else {
            inst.callUtil(peer);
        }
    }
    updateInStream(peer, stream) {
        this.inStreams[peer] = stream;
        this.dispatch("streamUpdated", peer, stream);
    }
    answerCall(call) {
        var inst = this;
        this.disconnectCall("in", call.peer);
        deb.g("Answering call from", call.peer);
        call.answer();
        call.on('stream', function (stream) {
            inst.updateInStream(call.peer, stream);
        })
    }
    disconnectCall(type, peer) {
        if (type == "in") {
            if (this.inCalls[peer]) {
                deb.r("Disconnecting Call", type, "from", peer);
                this.inCalls[peer]?.close();
                delete this.inCalls[peer];
                this.updateInStream(peer, null);
            }
        } else {
            if (this.outCalls[peer]) {
                deb.r("Disconnecting Call", type, "from", peer);
                this.outCalls[peer]?.close();
                delete this.outCalls[peer];
            }
        }
    }
    sendToServer(message) {
        this.serverConnection.send(message);
    }
    handleServerData(conn, message) {
        var inst = this;
        var functions = {
            setList(conn, args) {
                inst.setList(args.list);
            },
            updatePeer(conn, args) {
                inst.updatePeer(args.peer, args.data);
            },
            reconnectPeer(conn, args) {
                inst.disconnectCall("out", args.peer);
                inst.updatePeer(args.peer, args.data);
            }
        };
        deb.b("Server(" + conn.peer + ") says", message.func, message.args);
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

        this.listeners = {};

        this._initLocalListeners();
    }
    _initLocalListeners() {
        var inst = this;
        this.playground.addEventListener("dblclick", function (event) {
            if (event.target.id == "playground") {
                var x = event.pageX, y = event.pageY;
                x = parseInt(x / 50);
                y = parseInt(y / 50);
                inst.dispatch("changePosition", x, y);
            }
        })
    }
    playAudio(peer, stream) {
        if (!this.audios[peer]) {
            this.audios[peer] = document.createElement("audio");
            document.body.appendChild(this.audios[peer]);
        }
        if (stream == null) {
            // delete this audio
            this.audios[peer].parentNode.removeChild(this.audios[peer]);
            delete this.audios[peer];
            return;
        }
        this.audios[peer].srcObject = stream;
        this.updateVolume(peer);
        this.audios[peer].play();
    }
    updateVolume(peer) {
        if (this.audios[peer]) {
            let d = this.distances[peer];
            let v = 1 - 0.25 * d; // cannot here after 4 meters // maximum limit
            v = Math.max(v, 0);
            deb.g("Altering volume for peer:" + peer + ": " + v);
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

            var r = Math.random() * 255;
            var g = Math.random() * 255;
            var b = Math.random() * 255;
            console.log(r, g, b);
            var tc = (r + g + b >= 382.5) ? "#000" : "#fff";
            this.peers[peer].style.background = `rgb(${r}, ${g}, ${b})`;
            this.peers[peer].style.color = tc;
        }
        this.peers[peer].style.top = (data.position.y * 50) + "px";
        this.peers[peer].style.left = (data.position.x * 50) + "px";
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

    // Providing events
    on(fn, callback) {
        this.listeners[fn] = callback;
    }
    dispatch(fn, ...args) {
        if (this.listeners[fn]) {
            return this.listeners[fn](...args);
        }
    }
}
class Controller {
    constructor(id) {
        this.id = id;
        this.model = new Model(id);
        this.view = new View(id);

        this.model.on("listUpdated", this.onListUpdated.bind(this));
        this.model.on("peerUpdated", this.onPeerUpdated.bind(this));
        this.model.on("streamUpdated", this.onStreamUpdated.bind(this));
        this.model.on("requestStream", this.onRequestStream.bind(this));

        this.view.on("changePosition", this.handleChangePosition.bind(this));
    }
    onListUpdated(list) {
        this.view.displayList(list);
    }
    onPeerUpdated(peer, data) {
        this.view.displayPeer(peer, data);
    }
    onUpdatePeer(data) {
        this.model.updatePeer(this.id, data);
    }
    onRequestStream() {
        return this.view.requestStream();
    }
    onStreamUpdated(peer, stream) {
        this.view.playAudio(peer, stream);
    }
    handleChangePosition(x, y) {
        this.model.changePosition(x, y);
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
