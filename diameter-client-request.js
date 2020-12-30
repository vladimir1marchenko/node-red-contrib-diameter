'use strict';
var diameter = require('./lib/diameter');
const moment = require('moment');
const TIME_FORMAT = 'MMMM Do YYYY, HH:mm:ss:SSS';

module.exports = function(RED) {
    function DiameterClientRequest(config) {
        RED.nodes.createNode(this, config)
        var node = this
        node.status({
            fill:"red",
            shape:"ring",
            text:"disconnected",
        });
        node.name = config.name
        node.error = () => {};
        node.events = [];

        const ERROR_TYPES = {
            CONNECTION_FAILURE: 'CONNECTION_FAILURE',
            DISCONNECTED: 'DISCONNECTED',
            SEND_DWR: 'SEND_DWR',
            SEND_REQUEST: 'SEND_REQUEST',
            SEND_RESPONSE: 'SEND_RESPONSE'
        }

        function generateNodeErrorMessage(node, type, elem) {
            const connection = elem ? elem : '';
        
            switch (type) {
                case ERROR_TYPES.CONNECTION_FAILURE: {
                    node.send([null, { 
                        error: `DRA: Connection to ${connection} failure ((`,
                        connection,
                    }]);
                    console.log(`${moment().format(TIME_FORMAT)} Connection failure ${node.client.host} host`);
                    break;
                }
                case ERROR_TYPES.DISCONNECTED: {
                    node.send([null, { 
                        error: `DRA: Diameter server was disconnected ${connection} (`,
                        connection,
                    }]);
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
        
        if (node.error || !node.client) {
            var max32 = Math.pow(2, 32) - 1;
            node.originStateId = Math.floor(Math.random() * max32);
            node.client = RED.nodes.getNode(config.client);
        
        //  node.status({fill:"green",shape:"dot",text:"connected"});
        if (node.client) {
            var options = {
                //  beforeAnyMessage: diameter.logMessage,
                //  afterAnyMessage: diameter.logMessage,
                // beforeAnyMessage: (message) => node.send([null,{ payload:message }]),
                // afterAnyMessage: (message) => node.send([null,{ payload:message }]),
                port: node.client.port,
                host: node.client.host,
                timeout: 10000,
            };

            const {
                    origin_host: originHost,
                    origin_realm: originRealm,
                    host,
                    port,
                } = node.client;
            const authApplicationId = + node.client.auth_application_id;

            function createDiameterConnection() {
                return diameter.createConnection(options, () => {
                // create diameter connection

                    node.isAvailableSocket = true;
                    node.status({
                        fill:"green",
                        shape:"dot",
                        text:"connected to "+options.host+":"+options.port,
                    });

                    node.connection = node.socket.diameterConnection;

                    // Create Capabilities-Exchange with new connection
                    node.request = node.connection.createRequest('Diameter Common Messages', 'Capabilities-Exchange');
                    node.request.body = node.request.body.concat([
                        [ 'Origin-Host', originHost ],
                        [ 'Origin-Realm', originRealm ],
                        [ 'Host-IP-Address', host],
                        [ 'Vendor-Id', 26878 ],
                        [ 'Supported-Vendor-Id', 10415 ],
                        [ 'Vendor-Specific-Application-Id', [[ 'Vendor-Id', 10415 ],[ 'Auth-Application-Id', authApplicationId ]] ],
                        [ 'Auth-Application-Id', authApplicationId ],
                        [ 'Origin-State-Id', node.originStateId ],
                        [ 'Product-Name', 'node-diameter'],
                        [ 'Firmware-Revision', '0001']
                    ]);
    
                    node.request.body = node.request.body.filter(avp => avp[0] !== 'Session-Id');

                    function sendCapabilitiesExchangeRequest(node, count = 0) {
                        let internalCount = count;
                        const { connection, request } = node;
                        connection.sendRequest(request)
                        .then(
                            (response) => {
                                console.log(`${moment().format(TIME_FORMAT)} Capabilities-Exchange success ${host}`);
                            },
                            (error) => {
                                console.log(`${moment().format(TIME_FORMAT)} Error Capabilities-Exchange request to ${host}`);
                                node.status({ fill:"red", shape:"ring", text:'Error sending request: ' + error });
                                if (!node.isUpdatedSocket) {
                                    if (internalCount < 2) {
                                        internalCount++;
                                        sendCapabilitiesExchangeRequest(node, internalCount);
                                    } else {
                                        node.socket.end();
                                    }
                                } else {
                                    node.isUpdatedSocket = false;
                                }
                        });
                    }

                    sendCapabilitiesExchangeRequest(node);

    
                    // handle incoming requests
    
                    node.socket.on('diameterMessage', function(event) {
                        try {
                            if (event.message.command === 'Capabilities-Exchange') {
                                event.response.body = event.response.body.concat([
                                    [ 'Result-Code', 'DIAMETER_SUCCESS'],
                                    [ 'Origin-Host', originHost],
                                    [ 'Origin-Realm', originRealm],
                                    [ 'Host-IP-Address', host],
                                    [ 'Vendor-Id', 26878 ],
                                    [ 'Supported-Vendor-Id', 10415 ],
                                    [ 'Vendor-Specific-Application-Id', [[ 'Vendor-Id', 10415 ],[ 'Auth-Application-Id', authApplicationId ]] ],
                                    [ 'Auth-Application-Id', authApplicationId ],
                                    [ 'Origin-State-Id', node.originStateId ],
                                    [ 'Product-Name', 'node-diameter'],
                                    [ 'Firmware-Revision', '0001']
                                ]);
                                socket.diameterConnection.originHost = event.message.body.find(avp => avp[0] === 'Origin-Host')[1];
                                event.callback(event.response);
                                node.socket.watchdogTimerTrigger = false;
                            }
    
    
                            if (event.message.command === 'Device-Watchdog') {
                                event.response.body = event.response.body.concat([
                                    [ 'Result-Code', 'DIAMETER_SUCCESS'],
                                    [ 'Origin-Host',  originHost],
                                    [ 'Origin-Realm', originRealm],
                                    [ 'Origin-State-Id', node.originStateId ]
                                ]);
                                node.status({fill:"green",shape:"dot",text: `connected to ${host}:${port}`});
                                event.callback(event.response);
                                node.socket.watchdogTimerTrigger = false;
                            }

    
                            if (event.message.command === 'Disconnect-Peer') {
                                event.response.body = event.response.body.concat([
                                    [ 'Result-Code', 'DIAMETER_SUCCESS'],
                                    [ 'Origin-Host',  originHost],
                                    [ 'Origin-Realm', originRealm],
                                    [ 'Origin-State-Id', node.originStateId ]
                                ]);
                                event.callback(event.response);
                                node.socket.end();
                            }
    
                            if (event.message.command === 'Credit-Control' || event.message.command === 'Re-Auth') {
                                var msg = { payload: event, params: {} };//,topic:'requestMessage'};
                                node.events.push(event);
                                node.send([msg,null]);
                            }
    
                        }
                        catch (error) {
                            node.isAvailableSocket = false;
                            node.socket.end();
                            generateNodeErrorMessage(node, ERROR_TYPES.SEND_REQUEST, node.client.host);
                            node.status({fill:"red",shape:"ring",text:'Error: ' + error});
                            node.error = () => console.log(2222242122);
                        }
                    });

                    console.log(`${moment().format(TIME_FORMAT)} Diameter was connected to ${host}`)

                });
            }

            node.socket = createDiameterConnection();

            node.socket.on('error', (error) => {
                    console.log(`${moment().format(TIME_FORMAT)} ${node.client.host} ${error}`);
                    node.isAvailableSocket = false;
                    generateNodeErrorMessage(node, ERROR_TYPES.CONNECTION_FAILURE, host);
                    node.status({
                        fill:"red",
                        shape:"ring",
                        text:'Error: ' + error,
                    });
                    node.error = () => console.log(host);
                    node.socket.end();
            });

            setInterval(() => {
                if (node.socket.watchdogTimerTrigger) {
                    node.socket.end();
                    node.isAvailableSocket = false;
                }

                node.socket.watchdogTimerTrigger = true;
            }, 30000);

            setInterval(() => {
                if (!node.isAvailableSocket) {
                    console.log(`${moment().format(TIME_FORMAT)} Try create Diameter connection to ${node.client.host}`);
                    node.socket = createDiameterConnection();
                    node.isUpdatedSocket = true;

                    node.socket.on('error', (error) => {
                        console.log(`${moment().format(TIME_FORMAT)} ${node.client.host} ${error}`);
                        node.isAvailableSocket = false;
                        generateNodeErrorMessage(node, ERROR_TYPES.CONNECTION_FAILURE, node.client.host);
                        node.status({
                            fill:"red",
                            shape:"ring",
                            text:'Error: ' + error,
                        });
                        node.error = () => console.log(host);
                        node.socket.end();
            });
                }
            }, 20000);

            // send request if input msg
            node.on('input', function(msg) {
                const { header: messageHeader, command: messageCommand } = msg.payload.message;
                const { request: isRequestHeaderFlag } = messageHeader.flags;
                const { isUnknownSession, params } = msg;
                let sessionId;
                const messageBody = msg.payload.message.body.filter(avp => {
                    if (avp[0] === 'Session-Id')
                        sessionId = avp[1];
                    return avp[0] !== 'Session-Id';
                });

                if (isUnknownSession) {
                    for ( let j = 0; j < node.events.length; j++ ) {
                        const event = node.events[j];
                        if ( event['sessionId'] === sessionId) {
                            const response = { ... event.response };
                            if (messageHeader.endToEndId)
                                response.header.endToEndId = messageHeader.endToEndId;
                            response.header.flags.request = false;
                            response.header.flags.proxiable = true;
                            response.body = [
                                ['Session-Id', sessionId],
                                ['Result-Code', 'DIAMETER_UNKNOWN_SESSION_ID'],
                                ['Origin-Host', originHost],
                                ['Origin-Realm', originRealm],
                                ['Origin-State-Id', node.originStateId]
                            ];
                            event.callback(response);
                            node.events.splice(j, 1);
                            node.socket.watchdogTimerTrigger = false;
                            break;
                        }
                    }
                } else {
                    if ( !isRequestHeaderFlag ) {
                        for ( let j = 0; j < node.events.length; j++ ) {
                            const event = node.events[j];
                            if ( event['sessionId'] === sessionId) {
                                const response = { ... event.response };
                                if (messageHeader.endToEndId)
                                    response.header.endToEndId = messageHeader.endToEndId;
                                response.header.flags.request = isRequestHeaderFlag;
                                response.header.flags.proxiable = true;
                                response.body = response.body.concat(messageBody);
                                event.callback(response);
                                node.events.splice(j, 1);
                                node.socket.watchdogTimerTrigger = false;
                                break;
                            }
                        }      
                    }
                    else {

                        node.request = (sessionId) ?
                            node.connection.createRequest(authApplicationId, messageCommand, sessionId) :
                            node.connection.createRequest(authApplicationId, messageCommand);

                        node.request.header.flags.request = isRequestHeaderFlag;
                        node.request.header.flags.proxiable = true;
                        node.request.header.endToEndId = messageHeader.endToEndId;
                        node.request.body = node.request.body.concat(messageBody);

                        function sendRequest(node, msg, params, count = 0) {
                            let internalCount = count;
                            const { connection, request } = node;
                            const { host, port } = node.client;
                            connection.sendRequest(request)
                                .then( response => {
                                    const msg = (response.message) ?
                                        { payload: response, params } :
                                        {
                                            payload: { message: response },
                                            params,
                                        };
                                    node.send([msg, null]);
                                    node.status({
                                        fill: "green",
                                        shape: "dot",
                                        text: `connected to ${host}:${port}`,
                                    });
                                    node.socket.watchdogTimerTrigger = false;
                                })
    
                                .catch( error => {
                                    // node.isAvailableSocket = false;
                                    generateNodeErrorMessage(node, ERROR_TYPES.SEND_REQUEST, host);
                                    //node.status({ fill:"red",shape:"ring",text:'Error sending request: ' + error });
                                    console.log(`${moment().format(TIME_FORMAT)} Resend request to ${host}`);
                                    if (node.isAvailableSocket) {
                                        if (internalCount < 2) {
                                            internalCount++;
                                            sendRequest(node, msg, params, internalCount);
                                        } else {
                                            node.socket.end();
                                        }
                                    }
                                })
                        }

                        sendRequest(node, msg, params);
            
                    }

                }

              //}
            });
        }

      }




  }
  RED.nodes.registerType('diameter-client-request', DiameterClientRequest)
}
