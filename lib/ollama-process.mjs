import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

function problem(code, message, status) {
  return Object.assign(new Error(message), {code, status, httpStatus: status});
}

/** Shared installed-daemon start used by both existing local UIs. */
export async function startInstalledOllama(client) {
  try { return {...await client.status(), already_running: true}; } catch {}
  let executable = 'ollama';
  if (process.platform === 'win32') {
    const candidates = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'),
      process.env.ProgramFiles && join(process.env.ProgramFiles, 'Ollama', 'ollama.exe')].filter(Boolean);
    executable = candidates.find(existsSync) || 'ollama.exe';
  }
  const child = spawn(executable, ['serve'], {shell: false, detached: true, windowsHide: true, stdio: 'ignore',
    env: {...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1'}});
  let spawnFailure;
  child.once('error', error => {spawnFailure = error;}); child.unref();
  for (let i = 0; i < 12; i++) {
    await delay(250);
    if (spawnFailure) throw problem('OLLAMA_NOT_INSTALLED', 'Install Ollama from the official link, then press Start Ollama.', 503);
    try { return {...await client.status(), started_by_workspace: true, cloud_disabled_for_new_process: true}; } catch {}
  }
  throw problem('OLLAMA_START_PENDING', 'Ollama has not answered yet. Open Ollama from the Start menu, then press Refresh.', 503);
}
