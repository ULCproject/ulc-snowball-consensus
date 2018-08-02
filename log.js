const moment = require('moment')
const stackTrace = require('stack-trace')
const winston = require('winston')
const fs = require('fs')
const path = require('path')
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'server-config.json')))

let infoLogger
let logLevel = config.logLevel || 'info' // levels are 'debug', 'info'

let myIp
let myPort

// Upon launching, node checks to see if there is an HOSTNAME and PORT environment variable.
// copied from server.js for testing sets of servers with different ports
// should be refactored to be in one spot eventually, or removed after no longer needed
if (!process.env.HOSTNAME || !process.env.PORT) {
  myIp = config.ip
  myPort = config.port
} else {
  myIp = process.env.HOSTNAME
  myPort = process.env.PORT
}
myPort = parseInt(myPort)
if (process.argv[3]) {
  myIp = process.argv[3]
  myPort = parseInt(process.argv[2])
} else if (process.argv[2]) {
  myPort = parseInt(process.argv[2])
}

let myHost = myIp + ':' + myPort

const timeFormatFn = function () {
  if (config.logTime) return '[' + moment().toISOString() + ']'
}

let transports = []
transports.push(new winston.transports.Console({
  colorize: true,
  timestamp: timeFormatFn,
  level: logLevel
}))

var errorLogger = new winston.Logger({
  exitOnError: false,
  transports: transports
})

module.exports.createInfoLogger = function () {
  infoLogger = new winston.Logger({
    exitOnError: false,
    transports: transports
  })
}

module.exports.info = function (msg) {
  var out = buildOutput(msg)
  infoLogger.info(out)
}

module.exports.error = function (msg) {
  var out = buildOutput(msg)
  errorLogger.error(out)
}

module.exports.debug = function (msg) {
  var out = buildOutput(msg)
  infoLogger.debug(out)
}

// var onceMsgs = {}
// module.exports.once = function (msg) {
//   if (onceMsgs[msg]) return
//   onceMsgs[msg] = true
//   var out = buildOutput(msg)
//   infoLogger.debug(out)
// }

function buildOutput (msg) {
  var trace = stackTrace.get()
  var caller = trace[2]
  var file, line
  if (caller) {
    var path = caller.getFileName()
    var pieces = path.split('/')
    file = pieces[pieces.length - 1]
    line = caller.getLineNumber()
  }
  var out = ''
  if (file && line) {
    out += '[' + file + ':' + line + '] '
  }
  out += myHost + ' '
  out += msg
  return out
}

exports.createInfoLogger()
