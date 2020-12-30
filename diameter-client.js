
module.exports = function(RED) {
  function DiameterClientNode(n) {
    RED.nodes.createNode(this, n)
    var node = this
    node.port = n.port
    node.host = n.host
    node.origin_host = n.origin_host
    node.origin_realm = n.origin_realm
    node.auth_application_id = n.auth_application_id
  }

  RED.nodes.registerType('diameter-client', DiameterClientNode)
}
