/* eslint-disable */
// Loader for the napi-rs native addon.
// The binary is named gis-napi.<platform>-<arch>[.abi].node when built with --platform.

const { join } = require('path')

const platformBinaries = {
  'darwin-arm64': 'gis-napi.darwin-arm64.node',
  'darwin-x64':   'gis-napi.darwin-x64.node',
  'win32-x64':    'gis-napi.win32-x64-msvc.node',
  'linux-x64':    'gis-napi.linux-x64-gnu.node',
}

const key = `${process.platform}-${process.arch}`
const binaryName = platformBinaries[key]

if (!binaryName) {
  throw new Error(`@rw/gis-napi: unsupported platform "${key}"`)
}

module.exports = require(join(__dirname, binaryName))
