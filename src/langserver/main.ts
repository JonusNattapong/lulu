#!/usr/bin/env bun
import { LuluLSP } from './LuluLSP.js'

// Run Lulu LSP server
// --tcp       : TCP mode on port 18790
// --tcp=port  : TCP mode on specific port
// --auto      : Auto-detect (TCP if available, else stdio)
// --offline   : Force offline mode (no Gateway dependency)
// default     : stdio mode

const args = process.argv.slice(2)

const offlineMode = args.includes('--offline')
const tcpMode = args.includes('--tcp') || args.includes('--tcp-only')
const autoMode = args.includes('--auto')
const portArg = args.find((a) => a.startsWith('--port='))
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 18790

const lsp = new LuluLSP({ offline: offlineMode })

if (tcpMode) {
  lsp.startTCP(port)
} else if (autoMode) {
  lsp.startAuto()
} else {
  lsp.startStdio()
}