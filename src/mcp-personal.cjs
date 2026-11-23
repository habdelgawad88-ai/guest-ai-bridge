#!/usr/bin/env node
'use strict';
// Minimal three-tool profile: less Claude Code context overhead; discovery remains available via CLI.
process.env.GUEST_BRIDGE_PERSONAL='1';
require('./mcp.cjs');
