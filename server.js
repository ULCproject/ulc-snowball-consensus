/*
launch with node server <port>

*/

const express = require('express')
const _ = require('lodash')
const morgan = require('morgan')
const app = express()
const promisify = require('es6-promisify')
const request = promisify(require('request'))
const stringify = require('json-stable-stringify')
const net = require('net')
const config = require('./config')
const log = require('./log')
const X_WAIT = 3000
const NUM_NODES_TO_QUERY = 3 // referred to as 'k' in whitepaper

let timeout = 800 // request timeout
let myHost
let myNode
let seedNode
let nodes
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

let resolveLaunching
let isLaunching = new Promise((resolve) => {
  resolveLaunching = resolve
})

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

function getNodeFromString (str) {
  let colonIndex = str.indexOf(':')
  let ip = str.slice(0, colonIndex)
  let port = Number(str.slice(colonIndex + 1))
  return {
    ip: ip,
    port: port
  }
}

function isNodeValid (node) {
  try {
    if (_.isString(node)) {
      node = getNodeFromString(node)
    }
    if (!net.isIP(node.ip)) throw new Error('node.ip is not valid: ' + stringify(node))
    if (!Number.isInteger(node.port)) throw new Error('node.port is not an integer: ' + stringify(node))
    node.port = parseInt(node.port)
    return node
  } catch (e) {
    log.error(e.stack)
  }
}

function addNodeToList (node) {
  node = isNodeValid(node)
  if (!node) return
  if (nodeAlreadyAdded(node)) return
  log.debug(`adding to node list: ${stringify(node)}`)
  nodes.push(node)
  nodes = _.sortBy(nodes, 'port');
  log.debug(`nodes: ${stringify(nodes)}`)
  return true
}

function nodeAlreadyAdded (node) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].ip === node.ip && nodes[i].port === node.port) return true
  }
}

function getNodeHost (node) {
  node = isNodeValid(node)
  if (!node) return
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
    if (!responseNodes) return
    for (let i = 0; i < responseNodes.length; i++) {
      let node = responseNodes[i]
      if (isNodeMe(node)) continue
      if (addNodeToList(node)) {
        try {
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

async function getRandomNodes (num) {
  try {
    num = num || NUM_NODES_TO_QUERY
    if (nodes.length < num) {
      log.error('not enough nodes to query, nodes.length: ' + nodes.length + ', num to query: ' + num)
      return
    }
    let randomNodes = []
    while (randomNodes.length < num) {
      let rand = Math.floor(Math.random() * (num))
      if (randomNodes.indexOf(rand) === -1) randomNodes.push(rand)
    }
    return randomNodes
  } catch (err) {
    console.error(err.message)
  }
}

async function init () {
  app.listen(myPort, () => {
    log.info('listening on port ' + myPort)
  })
  myHost = myIp + ':' + myPort
  myNode = {ip: myIp, port: myPort}
  seedNode = config.seedNode
  nodes = []
  if (!isNodeValid(myNode)) process.exit()
  addNodeToList(myNode)
  if (!isNodeMe(seedNode)) await checkNodeList(seedNode)
  resolveLaunching()
  log.debug('initialized')
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
