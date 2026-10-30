import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

// Secrets travel over stdin, never command arguments. DPAPI binds ciphertext to this Windows user.
export function protect(value, decrypt = false) {
  const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=${decrypt ? '[Convert]::FromBase64String($v)' : '[Text.Encoding]::UTF8.GetBytes($v)'}; $r=[Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${decrypt ? '[Text.Encoding]::UTF8.GetString($r)' : '[Convert]::ToBase64String($r)'})`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', c => output += c);
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows anahtar kasasına erişilemedi.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error('Windows anahtar kasasına erişilemedi.')); });
    child.stdin.on('error', () => {});
    child.stdin.end(value);
  });
}

export class CredentialStore {
  constructor(path) { this.path = path; }
  async load() {
    try { return JSON.parse(await protect(await readFile(this.path, 'utf8'), true)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async save(credentials) {
    const encrypted = await protect(JSON.stringify(credentials));
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path + '.tmp', encrypted, { mode: 0o600 });
    await rename(this.path + '.tmp', this.path);
  }
  async remove() { await rm(this.path, { force: true }); }
}
