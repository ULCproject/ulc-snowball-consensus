/* global describe it after */
require('chai').should()
const expect = require('Chai').expect
const promisify = require('es6-promisify')
const request = promisify(require('request'))
const fs = require('fs')
var path = require('path')
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../server-config.json')))

const useForkNotSpawn = true
const binaryPath = null// Tests the binary instead, null to test the code

describe('Routes', async function () {
  this.timeout(0)
  let fork
  if (useForkNotSpawn) {
    fork = require('child_process').fork
  } else {
    fork = require('child_process').spawn
  }
  let host = config.ip + ':' + config.port
  let url = 'http://' + host

  describe('GET /nodes', function () {
    it(`should return a list of the nodes`, async function () {
      const server = await forkWait()
      let res = await getJson(url + '/nodes')
      server.kill()
      let result = res.body
      expect(result).to.have.property('nodes').that.is.an('array')
    })
  })
  describe('POST /join', function () {
    it(`should reject a node with an invalid ip`, async function () {
      const server = await forkWait()
      let fakeNode = {
        node: {
          id: 3456,
          ip: '200.300.200.100',
          port: 3456
        }
      }
      let res = await postJson(url + '/join', fakeNode)
      server.kill()
      let result = res.body
      expect(result.accepted).to.equal(false)
    })
    it(`should reject a node with the same ip:port`, async function () {
      const server = await forkWait()
      let fakeNode = {
        node: {
          id: config.port,
          ip: config.hostName,
          port: config.port
        }
      }
      let res = await postJson(url + '/join', fakeNode)
      server.kill()
      let result = res.body
      expect(result.accepted).to.equal(false)
    })
    it(`should accept a valid node`, async function () {
      const server = await forkWait()
      let validNode = createValidNode(Number(config.port + 10))
      let res = await postJson(url + '/join', validNode)
      let result = res.body
      expect(result.accepted).to.equal(true)
      res = await getJson(url + '/nodes')
      let nodes = res.body.nodes
      server.kill()
      expect(nodes).to.be.an('array')
      expect(nodes.find(node => node.id === validNode.id))
    })
  })

  after(function () {
    console.log() // need after function to pass standard js tests
  })

  function postJson (host, json) {
    return request({ method: 'POST', url: host, json: true, body: json })
  }

  function getJson (host) {
    return request({ method: 'GET', url: host, json: true })
  }

  function createValidNode (port) {
    let validNode = {
      node: {
        id: port,
        ip: '127.0.0.1',
        port: port
      }
    }
    return validNode
  }

  async function forkWait (port) {
    let args = []
    if (port) args.push(port)
    let server
    if (binaryPath) {
      return fork(binaryPath, args)
    }
    if (useForkNotSpawn) {
      server = fork('./server.js', args)
    } else {
      args.unshift('./server.js')
      server = fork('node', args)
      server.stdout.on('date', (data) => {
        console.log(data.toString())
      })
    }
    // await sleep(500) // time to sync up
    await serverIsListening() // uses adjusting time to sync up, in case other nodes are slower than ours
    return server
  }
  async function sleep (ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function serverIsListening () {
    for (let i = 0; i < 30; i++) {
      await sleep(100)
      try {
        await getJson(url + '/accounts')
        return true
      } catch (e) {
        // request failed, wait for server to be ready
      }
    }
  }
})
