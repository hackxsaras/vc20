class VCServer extends VCPeer {
    constructor(...args) {
        super(...args);
        this.initServer();
    }
    initServer() {
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
                conn.on('data', inst.handlePeerData.bind(inst, conn));
                inst.sendPeersDataToPeer(conn.peer);
                inst.updatePeers({
                    func: "changePeerData",
                    args: {
                        peer: conn.peer,
                        data: conn.metadata
                    }
                });
            });
        })
    }
    sendToPeer(peer, message) {
        console.log(message);
        this.connection[peer].send(message);
    }
    sendPeersDataToPeer(peer) {
        for(var other in this.data){
            this.sendToPeer(peer, {
                func: "changePeerData",
                args: {
                    peer: other,
                    data: this.data[other]
                }
            });
        }
    }
    updatePeers(message, ...except) {
        var inst = this;
        for (var key in inst.data) {
            if (except.indexOf(key) === -1)
                inst.sendToPeer(key, message);
        }
    }
    getCallablePeers(peer) {
        var inst = this;
        var peers = [];
        for (var key in inst.data) {
            if (key != peer) {
                if (distance(peer, key) < 4) {
                    peers.push(key);
                }
            }
        }
        return peers;
    }
    handlePeerData(conn, message) {
        var inst = this;
        var functions = {
            changeData(conn, data) {
                this.changePeerData(conn.peer, data);
                this.updatePeers({
                    func: "changePeerData",
                    args: {
                        peer: conn.peer,
                        data
                    }
                });
            },
            log(conn, args) {
                console.log(...args);
            }
        }
        console.log("Peer(" + conn.peer + ") says", message.func, message.args);
        functions[message.func].call(this, conn, message.args);
    }
}
var id = new URL(location.href).searchParams.get('id');
var peer = new VCServer(id || "server");