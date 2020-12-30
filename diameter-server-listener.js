'use strict';
var diameter = require('./lib/diameter');
const moment = require('moment');
const TIME_FORMAT = 'MMMM Do YYYY, HH:mm:ss:SSS';

module.exports = function(RED) {
    function DiameterServerListener(config) {
        RED.nodes.createNode(this, config)
        var node = this
        node.status({fill:"red",shape:"ring",text:"disconnected"});
        node.name = config.name;
        node.connections = [];
        node.events = [];

        var max32 = Math.pow(2, 32) - 1;
        node.originStateId = Math.floor(Math.random() * max32);
        node.server = RED.nodes.getNode(config.server);

        if(node.server) {
            var options = {
                beforeAnyMessage: function(message) {
                    //node.send([null,{ payload:message }]);
                },

                afterAnyMessage: function(message) {
                    //node.send([null,{ payload:message }]);
                }
            }
        };


        const ERROR_TYPES = {
            NOT_LISTENING: 'NOT_LISTENING',
            CONNECTION_FAILURE: 'CONNECTION_FAILURE',
            DISCONNECTED: 'DISCONNECTED',
            SEND_DWR: 'SEND_DWR',
            SEND_REQUEST: 'SEND_REQUEST',
            SEND_RESPONSE: 'SEND_RESPONSE'
        }

        function generateNodeErrorMessage(node, type, elem) {
            const connection = elem ? elem : '';

            switch (type) {
                case ERROR_TYPES.NOT_LISTENING: {
                    node.send([null, {
                        error: 'DRA: Diameter server not listening ...((',
                        connection,
                    }]);
                    console.log(`${moment().format(TIME_FORMAT)} Diameter server not listening`);
                    break;
                }
                case ERROR_TYPES.CONNECTION_FAILURE: {
                    node.send([null, {
                        error: `DRA: Some kind undetected error on ${connection} connection (`,
                        connection,
                    }]);
                    console.log(`${moment().format(TIME_FORMAT)} Connection to Diameter server failure`);
                    break;
                }
                case ERROR_TYPES.DISCONNECTED: {
                    node.send([null, {
                        error: `DRA: Diameter server was disconnected ${connection} (`,
                        connection,
                    }]);
                    console.log(`${moment().format(TIME_FORMAT)} ${node.name}: Client disconnected`);
                    break;
                }
                case ERROR_TYPES.SEND_DWR: {
                    node.send([null, {
                        error: `DRA: Error at sending DWR to ${connection} ((`,
                        connection,
                    }]);
                    break;
                }
                case ERROR_TYPES.SEND_REQUEST: {
                    node.send([null, {
                        error: `DRA: Error at sending request ${connection} (`,
                        connection,
                    }]);
                    break;
                }
                case ERROR_TYPES.SEND_RESPONSE: {
                    node.send([null, {
                        error: `DRA: Error at sending response ${connection} (`,
                        connection,
                    }]);
                    break;
                }
                default: {
                    node.send([null, { error: `DRA: Errorororororoor` }]);;
                }
            }
        }

        const {
                bind_ip: bindIp,
                port,
                host,
                origin_host: originHost,
                origin_realm: originRealm,
            } = node.server;

            const authApplicationId = + node.server.auth_application_id;

        node.diameterserver = diameter.createServer(options, function(socket) {
            node.connection = socket.diameterConnection;
            node.connections.push(socket.diameterConnection);
            console.log('Server was created');

            node.status({fill:"green",shape:"dot",text:"listening "+node.server.bind_ip+":"+node.server.port});

            function sendDwr() {
                if (node.islisteting) {
                    node.connections.forEach( (connection, index) => {
                        const request = connection.createRequest('Diameter Common Messages', 'Device-Watchdog');
                        request.body = request.body
                            .filter( avp => avp[0] !== 'Session-Id')
                            .concat([
                                [ 'Origin-Host', originHost ],
                                [ 'Origin-Realm', originRealm ],
                                [ 'Origin-State-Id', node.originStateId ]
                            ]);

                        connection.sendRequest(request)
                            .then(
                                (response) => {
                                    //console.log(`${node.name}: Got response for server initiated message from ${index} connection`);
                                },
                                (error) => {
                                    console.log(`${moment().format(TIME_FORMAT)} ${node.name}: Error sending request from ${index} connection: ${error}`);
                                    node.status({fill:"red",shape:"ring",text:'Error sending request: ' + error});
                                    generateNodeErrorMessage(node, ERROR_TYPES.SEND_DWR, socket.diameterConnection.originHost);
                            });
                    });
                }
            }

            // setInterval(() =>  { console.log('node.connections.lengthnode.connections.length', node.connections.length) }, 1000);

                // Send DWR every 10 sec
            if (!node.isActivatedDwr) {
               setInterval(() => {
                    sendDwr();
                    // console.log(node.connections);
               }, 10000);
               node.isActivatedDwr = true;
            }

            socket.on('diameterMessage', function(event) {
                // Capabilities Exchange Message
                if (event.message.command === 'Capabilities-Exchange') {
                    event.response.body = event.response.body.concat([
                        [ 'Result-Code', 'DIAMETER_SUCCESS'],
                        [ 'Origin-Host',  originHost],
                        [ 'Origin-Realm', originRealm],
                        [ 'Host-IP-Address', host],
                        [ 'Vendor-Id', 26878 ],
                        [ 'Supported-Vendor-Id', 10415 ],
                        [ 'Supported-Vendor-Id', 193 ],
                        [ 'Vendor-Specific-Application-Id', [[ 'Vendor-Id', 10415 ],[ 'Auth-Application-Id', authApplicationId ]] ],
                        [ 'Auth-Application-Id', authApplicationId ],
                        [ 'Origin-State-Id', node.originStateId ],
                        [ 'Product-Name', 'node-diameter'],
                        [ 'Firmware-Revision', '0001']
                    ]);
                    socket.diameterConnection.originHost = event.message.body.find(avp => avp[0] === 'Origin-Host')[1];
                    event.callback(event.response);
                }

                // CC[R-A] and RA[R-A] send to external output
                if (event.message.command === 'Credit-Control' || event.message.command === 'Re-Auth') {
                    var msg = {payload: event};
                    event.originHost = socket.diameterConnection.originHost;
                    node.events.push(event);
                    node.send([msg,null]);
                }
            });

            socket.on('end', function(event) {
                const { originHost } = socket.diameterConnection;
                console.log(socket.diameterConnection.originHost);

                const index = node.connections.findIndex(connection => connection.originHost === originHost);
                node.connections.splice(index, 1);

                node.events = node.events.filter(event => event.originHost !== originHost);

                generateNodeErrorMessage(node, ERROR_TYPES.DISCONNECTED, originHost);
                console.log(node.name + ': Client disconnected.');
            });

            socket.on('error', function(error) {
                // console.log('errorororororoor');
                // console.log(node.name+": "+err);
                node.status({fill:"red",shape:"ring",text:'Error: ' + error});
                generateNodeErrorMessage(node, ERROR_TYPES.CONNECTION_FAILURE, socket.diameterConnection.originHost);
            });

        });

        node.on('input', function(msg) {
            const { header: messageHeader, command: messageCommand } = msg.payload.message;
            const { request: isRequestHeaderFlag } = messageHeader.flags;

            let sessionId;

            const messageBody = msg.payload.message.body.filter(avp => {
                if (avp[0] === 'Session-Id')
                    sessionId = avp[1];
                return avp[0] !== 'Session-Id';
            });

            if ( !isRequestHeaderFlag ) {
                for ( let j = 0; j < node.events.length; j++ ) {
                    const event = node.events[j];
                    if ( event['sessionId'] === sessionId) {

                        const isOpenConnection = node.connections.some(connection => connection.originHost === event.originHost);

                        if (isOpenConnection) {
                            const response = { ... event.response };
                            if (messageHeader.endToEndId)
                                response.header.endToEndId = messageHeader.endToEndId;
                            response.header.flags.request = isRequestHeaderFlag;
                            response.header.flags.proxiable = true;
                            response.body = response.body.concat(messageBody);
                            try {
                                event.callback(response);
                            }
                            catch (error) {
                                generateNodeErrorMessage(node, ERROR_TYPES.SEND_RESPONSE, event.originHost);
                                console.log(`${moment().format(TIME_FORMAT)} Error sending response to ${event.originHost}`)
                            }
                            node.events.splice(j, 1);
                            break;
                        }

                        node.events.splice(j, 1);
                    }
                }
            } else {
                const destinationHost = messageBody.find(avp => avp[0] === 'Destination-Host')[1];
                const connection = node.connections.find(connection => connection.originHost === destinationHost);

                node.request = (sessionId) ?
                    connection.createRequest(authApplicationId, messageCommand, sessionId) :
                    connection.createRequest(authApplicationId, messageCommand);

                node.request.header.flags.request = isRequestHeaderFlag;
                node.request.header.flags.proxiable = true;
                node.request.header.endToEndId = messageHeader.endToEndId;
                node.request.body = node.request.body.concat(messageBody);

                connection.sendRequest(node.request)
                    .then(
                        (response) => {
                            const msg = (response.message) ?
                                { payload: response } :
                                { payload:
                                    { message: response }
                                };
                            node.send([msg,null]);
                        },
                        (error) => {
                            generateNodeErrorMessage(node, ERROR_TYPES.SEND_REQUEST, destinationHost);
                            console.log(`${moment().format(TIME_FORMAT)} Error sending request to ${destinationHost}`)
                        });
            }
        });

        if (!node.islisteting) {
            node.diameterserver.listen(node.server.port, node.server.bind_ip);
            node.islisteting = true;
            node.isActivatedDwr = false;

            generateNodeErrorMessage(node, ERROR_TYPES.NOT_LISTENING);
        }
    }

    RED.nodes.registerType('diameter-server-listener', DiameterServerListener);
}
