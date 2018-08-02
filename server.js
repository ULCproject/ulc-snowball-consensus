const express = require('express')
const _ = require('lodash')
const morgan = require('morgan')
const app = express()
const promisify = require('es6-promisify')
const request = promisify(require('request'))
const stringify = require('json-stable-stringify')
const net = require('net')
const fs = require('fs')
const path = require('path')
const log = require('./log')
let config
if (process.pkg) {
  config = JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), './server-config.json'), { encoding: 'utf8' }))
} else {
  config = JSON.parse(fs.readFileSync(path.resolve(__dirname, './server-config.json'), { encoding: 'utf8' }))
}
let timeout = 800 // request timeout
let myHost
let myNodeId
let myNode
let seedNode
let nodes
let resolveLaunching
let isLaunching = new Promise((resolve) => {
  resolveLaunching = resolve
})

const X_WAIT = 3000

let myIp
let myPort

myIp = config.ip
myPort = config.port
if (process.env.PORT) {
  myPort = process.env.PORT
  if (process.env.IP) myIp = process.env.IP
}
myPort = parseInt(myPort)
if (process.argv[3]) {
  myIp = process.argv[3]
  myPort = parseInt(process.argv[2])
} else if (process.argv[2]) {
  myPort = parseInt(process.argv[2])
}

log.debug(`myIp: ${myIp}, myPort: ${myPort}`)

// pass in <node> object or host string
function isNodeMe (node) {
  let nodeHost
  if (_.isString(node)) {
    nodeHost = node
  } else {
    nodeHost = getNodeHost(node)
  }
  if (nodeHost === myHost) return true
  if (nodeHost === 'localhost:' + myPort) return true
  if (nodeHost === '0.0.0.0:' + myPort) return true
  if (nodeHost === '127.0.0.1:' + myPort) return true
  return false
}

function isNodeValid (node) {
  try {
    if (_.isString(node)) {
      let colonIndex = node.indexOf(':')
      let ip = node.slice(0, colonIndex)
      let port = Number(node.slice(colonIndex + 1))
      node = {
        id: port,
        ip: ip,
        port: port
      }
    }
    if (!net.isIP(node.ip)) throw new Error('node.ip is not valid: ' + stringify(node))
    if (!Number.isInteger(node.port)) throw new Error('node.port is not an integer: ' + stringify(node))
    node.port = parseInt(node.port)
    return true
  } catch (e) {
    log.error(e.stack)
  }
}

/*
<node>
Type: <object>
Description: An object representing a node’s <nodeId>, <hostname>, and port number.
Ex. { “id”: “<nodeId>”,  “ip”: “<hostname>”, “port”: <integer> }
[{ <node> }, { <node> }, ...]
*/
function addNodeToList (node) {
  if (!isNodeValid(node)) return
  if (nodeAlreadyAdded(node)) return
  log.debug('adding to node list: ' + stringify(node))
  nodes.push(node)
  return true
}

function nodeAlreadyAdded (node) {
  if (nodes.some((currNode) => {
    return (currNode.id === node.id) ||
           (currNode.ip === node.ip && currNode.port === node.port)
  })) return true
}

function getNodeHost (node) {
  if (_.isString(node)) return node
  if (!isNodeValid(node)) return node
  return node.ip + ':' + node.port
}

// queries /nodes route of other node
async function checkNodeList (node) {
  try {
    log.debug('sending nodes request to ' + JSON.stringify(node))
    // The node sends a /join request to the seed node.
    joinNode(node)
    // The node waits X seconds (we’ll use 3 seconds for now) before querying for the nodes list, as to give the other nodes a chance to join the network as well.
    await sleep(X_WAIT)
    // The node queries for a list of known nodes on the /nodes route and adds them to its node list.
    let nodelistResponse = await request({timeout: timeout, url: 'http://' + getNodeHost(node) + '/nodes'})
    let responseNodes = JSON.parse(nodelistResponse.body).nodes
    if (!responseNodes) {
      resolveLaunching()
      return
    }
    for (let i = 0; i < responseNodes.length; i++) {
      let node = responseNodes[i]
      if (isNodeMe(node)) continue
      if (addNodeToList(node)) {
        try {
          log.debug('here')
          joinNode(node) // try to join each node we add to our nodes list
        } catch (e) {
          log.error('join node error: ' + e.message)
        }
      }
    }
  } catch (e) {
    if (!e.message.includes('ECONNREFUSED')) {
      log.error(e.stack)
    } else {
      log.error('check node list error: ' + e.message)
    }
  }
}

async function init () {
  app.listen(myPort, () => {
    log.info('listening on port ' + myPort)
  })
  myHost = myIp + ':' + myPort
  myNodeId = myPort // keep it simple
  myNode = {id: myNodeId, ip: myIp, port: myPort}
  seedNode = config.seedNode
  nodes = []
  if (!isNodeValid(myNode)) {
    process.exit()
  }
  addNodeToList(myNode)
  if (!isNodeMe(seedNode)) {
    log.debug('Seed node is not me: ' + seedNode)
    await checkNodeList(seedNode)
  }
  resolveLaunching()
}

init()

app.use(async (req, res, next) => {
  await isLaunching
  next()
})

if (config.logRequests) {
  app.use(morgan('dev'))
}
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

/*
GET /nodes
Description: Returns a list of nodes that the node knows about. The list includes the node itself.
Returns:
{ “nodes”: [{ <node> }, { <node> }, ...] }
*/
app.get('/nodes', (req, res) => {
  res.send({nodes: nodes})
})

app.post('/join', (req, res) => {
  try {
    let payLoad = req.body
    let node = payLoad.node
    if (addNodeToList(node)) {
      joinNode(node)
      res.json({accepted: true})
    } else {
      res.json({accepted: false})
    }
  } catch (e) {
    log.error(e.stack)
    res.json({accepted: false})
  }
})

async function joinNode (node) {
  try {
    if (!_.isString(node) && !isNodeValid(node)) throw new Error('node: ' + stringify(node) + ' is invalid')
    if (nodeAlreadyAdded(node)) return
    addNodeToList(node)
    let payLoad = {
      node: {
        id: myNodeId,
        ip: myIp,
        port: myPort
      }
    }
    await request({method: 'POST', url: 'http://' + getNodeHost(node) + '/join', json: payLoad})
    return true
  } catch (e) {
    if (!e.message.includes('ECONNREFUSED')) {
      log.error(e.stack)
    } else {
      log.error('join node error: ' + e.message)
    }
  }
}

async function sleep (ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

process.on('unhandledRejection', (err, promise) => {
  log.error('Unhandled Rejection at: Promise', promise, 'err:', err)
  log.info(err.stack)
})

process.on('uncaughtException', (err) => {
  log.error(`Caught unhandled error: ${err.stack}`)
})
