class VCServer {
    constructor(id, options = {}) {
        this.peer = new Peer(id
            , {
            host: "vc-server.adaptable.app",
            port: 443,
            path: "/"
        });
        this.init();
    }
    init() {
        var inst = this;
        inst.data = {};
        inst.connection = {};
        console.log("setting listener");
        inst.peer.on("connection", function (conn) {
            inst.data[conn.peer] = {
                ...conn.metadata
            };
            inst.connection[conn.peer] = conn;
            conn.on('open', function () {
                console.log("Connection established to " + conn.peer + " with data ", conn.metadata);

                if (inst.data[conn.peer]) {
                    inst.updatePeers({
                        func: "reconnectPeer",
                        args: {
                            peer: conn.peer,
                            data: conn.metadata
                        }
                    })
                } else {
                    inst.updatePeers({
                        func: "changePeerData",
                        args: {
                            peer: conn.peer,
                            data: conn.metadata
                        }
                    });
                }
                inst.data[conn.peer] = {
                    ...conn.metadata
                };
                conn.on('data', inst.handlePeerData.bind(inst, conn));
                inst.sendPeersDataToPeer(conn.peer);
            });
        })
        inst.peer.on("disconnected", (id) => {
            console.log("You are disconnected.");
            inst.peer.reconnect();
        })
    }
    sendToPeer(peer, message) {
        this.connection[peer].send(message);
    }
    sendPeersDataToPeer(peer) {
        this.sendToPeer(peer, {
            func: "setList",
            args: {
                list: this.data
            }
        });
    }
    updatePeers(message, ...except) {
        var inst = this;
        for (var key in inst.data) {
            if (except.indexOf(key) === -1)
                inst.sendToPeer(key, message);
        }
    }
    changePeerData(peer, upd) {
        this.data[peer] ||= {};
        for (var key in upd) {
            this.data[peer][key] = upd[key];
        }

    }
    handlePeerData(conn, message) {
        var inst = this;
        var functions = {
            changeData(conn, data) {
                this.changePeerData(conn.peer, data);
                this.updatePeers({
                    func: "updatePeer",
                    args: {
                        peer: conn.peer,
                        data
                    }
                });
            },
            log(conn, args) {
                console.log(...args, "::peer(" + conn.peer + ")");
            }
        }
        // deb.b("Peer(" + conn.peer + ") says", message.func, message.args);
        functions[message.func].call(this, conn, message.args);
    }
}
var id = new URL(location.href).searchParams.get('id');
var peer = new VCServer(id || "server");