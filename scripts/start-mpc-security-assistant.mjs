#!/usr/bin/env node
// Local Codex MCP entry point. Stdout is reserved for the protocol unless --check.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveMcpStdio, protocolContract} from '../lib/local-mcp-stdio.mjs';

export function parseAssistantArguments(argv, cwd = process.cwd()) {
  const result = {workspaceRoot: resolve(cwd), check: false}, seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!['--workspace', '--check'].includes(option) || seen.has(option)) throw Error('USAGE: --workspace PATH --check (both optional)');
    seen.add(option);
    if (option === '--check') result.check = true;
    else {
      const value = argv[++index];
      if (typeof value !== 'string' || !value.trim() || value.startsWith('--') || value.includes('\0')) throw Error('WORKSPACE_PATH_REQUIRED');
      result.workspaceRoot = resolve(cwd, value);
    }
  }
  return result;
}

export async function startSecurityAssistant(argv = process.argv.slice(2)) {
  const options = parseAssistantArguments(argv);
  const {createSecurityAssistant} = await import('../lib/security-assistant.mjs');
  const engine = await createSecurityAssistant({workspaceRoot: options.workspaceRoot});
  if (options.check) {
    const runtime = await engine.callTool('runtime_status', {});
    const result = {status: 'MPC_LOCAL_STDIO_STARTUP_CHECK', transport: 'stdio',
      supported_protocol_versions: protocolContract.supported_protocol_versions,
      server_info: engine.serverInfo, tool_count: engine.toolList.length,
      workspace: options.workspaceRoot, runtime, connection_handshake_performed: false};
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }
  return serveMcpStdio({engine});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startSecurityAssistant(); }
  catch (error) {
    process.stderr.write(JSON.stringify({status: 'MPC_LOCAL_STDIO_ERROR', error: String(error.message ?? error).slice(0, 1000)}) + '\n');
    process.stdin.destroy(); process.exitCode = 1;
  }
}
