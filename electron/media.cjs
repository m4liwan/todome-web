'use strict';
/**
 * Media keys for the system player on Windows, without native modules:
 * one long-lived, hidden PowerShell process talks to the Windows media
 * session (GlobalSystemMediaTransportControls: Spotify, browsers, Groove …)
 * and falls back to the media keys. Line-based JSON, whitelisted commands.
 *
 * Calm on locked-down PCs (1.11):
 *  - no `-ExecutionPolicy Bypass`: the bridge runs as a command
 *    (`-Command`), which execution policies do not govern, from the fixed
 *    System32 path (no PATH lookup);
 *  - the script first reports whether it may run at all (Constrained
 *    Language Mode, AppLocker/WDAC, missing WinRT) in a handshake;
 *  - if PowerShell is missing, blocked, killed by a virus scanner or never
 *    answers, the bridge marks itself unavailable, the app hides the media
 *    control, and ToDoMe does not try again for 7 days or until the next
 *    app version. No error dialogs, no retry loops that keep alerting a scanner.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const COMMANDS = new Set(['info', 'toggle', 'next', 'prev']);
const HANDSHAKE_MS = 12_000;
const REPLY_MS = 6_000;
const RETRY_AFTER_MS = 7 * 24 * 60 * 60_000;
const BLOCK_FILE = 'media-bridge-state.json';

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Reply($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress)) }
# Locked-down PCs (AppLocker / WDAC) run PowerShell in Constrained Language Mode:
# no Add-Type, no WinRT. Say so once and leave quietly.
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { Reply @{ id = 0; ready = $false; reason = 'language-mode' }; exit 3 }
$keys = $false
try {
  Add-Type -Namespace ToDoMe -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);'
  $keys = $true
} catch { $keys = $false }
function Press([byte]$vk) { if ($keys) { [ToDoMe.Keys]::keybd_event($vk, 0, 0, [UIntPtr]::Zero); [ToDoMe.Keys]::keybd_event($vk, 0, 2, [UIntPtr]::Zero) } }
$manager = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
  function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(3000); if ($task.IsCompleted) { return $task.Result }; return $null }
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $manager = Await ($mgrType::RequestAsync()) $mgrType
} catch { $manager = $null }
if (-not $manager -and -not $keys) { Reply @{ id = 0; ready = $false; reason = 'no-api' }; exit 4 }
Reply @{ id = 0; ready = $true; session = [bool]$manager; keys = $keys }
function Session { if ($manager) { try { return $manager.GetCurrentSession() } catch { return $null } }; return $null }
function Info {
  $s = Session
  if (-not $s) { return @{ ok = $true; active = $false; session = [bool]$manager } }
  $p = $null
  try { $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType } catch { }
  $status = ''
  try { $status = $s.GetPlaybackInfo().PlaybackStatus.ToString() } catch { }
  return @{ ok = $true; active = $true; session = $true; title = [string]$p.Title; artist = [string]$p.Artist; app = [string]$s.SourceAppUserModelId; playing = ($status -eq 'Playing') }
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $id = 0
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $s = Session
    switch ($req.cmd) {
      'toggle' { if ($s) { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) } else { Press 0xB3 }; Start-Sleep -Milliseconds 180 }
      'next' { if ($s) { $null = Await ($s.TrySkipNextAsync()) ([bool]) } else { Press 0xB0 }; Start-Sleep -Milliseconds 350 }
      'prev' { if ($s) { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) } else { Press 0xB1 }; Start-Sleep -Milliseconds 350 }
    }
    $res = Info
    $res.id = $id
    Reply $res
  } catch {
    Reply @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
}
`;

/** PowerShell from System32, never from PATH. */
function defaultExe() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** `-Command` runs the script text; execution policies only govern script files. */
function defaultArgs(file) {
  const quoted = file.replace(/'/g, "''");
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `& ([ScriptBlock]::Create([IO.File]::ReadAllText('${quoted}')))`];
}

/**
 * @param {string} userDataDir
 * @param {{ version?: string, platform?: string, exe?: string, args?: (file: string) => string[], now?: () => number, log?: (msg: string) => void, handshakeMs?: number }} [opts]
 */
function createMediaBridge(userDataDir, opts = {}) {
  const platform = opts.platform || process.platform;
  const version = opts.version || '';
  const now = opts.now || Date.now;
  const log = opts.log || ((m) => console.warn('[todome:media]', m));
  const exe = opts.exe || defaultExe();
  const argsFor = opts.args || defaultArgs;
  const stateFile = path.join(userDataDir, BLOCK_FILE);
  const handshakeMs = opts.handshakeMs || HANDSHAKE_MS;

  let child = null;
  let ready = false;
  let seq = 0;
  let failures = 0;
  let earlyExits = 0;
  let pausedUntil = 0;
  let handshake = null;
  /** Unavailable on this PC (blocked, missing, constrained). */
  let blocked = readBlocked();
  const pending = new Map();

  function readBlocked() {
    try {
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return Boolean(saved && saved.version === version && now() - Number(saved.blockedAt) < RETRY_AFTER_MS);
    } catch {
      return false;
    }
  }

  const unsupported = () => ({ ok: false, supported: false });
  const quiet = () => ({ ok: false, supported: true, active: false });

  function settleAll(result) {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.resolve(result);
    }
    pending.clear();
  }

  function block(reason) {
    if (blocked) return;
    blocked = true;
    log(`Mediensteuerung aus: ${reason}`);
    try {
      fs.writeFileSync(stateFile, JSON.stringify({ blockedAt: now(), reason, version }));
    } catch {
      /* stays off for this run anyway */
    }
    stop();
    settleAll(unsupported());
  }

  function stop() {
    if (handshake) clearTimeout(handshake);
    handshake = null;
    const c = child;
    child = null;
    ready = false;
    if (!c) return;
    try {
      c.stdin.end();
      c.kill();
    } catch {
      /* already gone */
    }
  }

  function start() {
    if (child || blocked || now() < pausedUntil) return child;
    if (!opts.exe && !fs.existsSync(exe)) {
      block('powershell-missing');
      return null;
    }
    const file = path.join(userDataDir, 'media-bridge.ps1');
    try {
      fs.writeFileSync(file, SCRIPT, 'utf8');
    } catch {
      return null;
    }
    let proc;
    try {
      proc = spawn(exe, argsFor(file), { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (err) {
      block(`spawn-${(err && err.code) || 'failed'}`);
      return null;
    }
    child = proc;
    ready = false;
    // A scanner or policy that silently stalls PowerShell never answers.
    handshake = setTimeout(() => block('no-handshake'), handshakeMs);
    proc.stdin.on('error', () => undefined);

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line.replace(/^\uFEFF/, ''));
      } catch {
        return;
      }
      if (Number(msg.id) === 0) {
        if (handshake) clearTimeout(handshake);
        handshake = null;
        if (msg.ready === true) {
          ready = true;
          earlyExits = 0;
        } else block(String(msg.reason || 'not-ready'));
        return;
      }
      const p = pending.get(Number(msg.id));
      if (!p) return;
      pending.delete(Number(msg.id));
      clearTimeout(p.timer);
      failures = 0;
      p.resolve(sanitize(msg));
    });

    // Blocked by AppLocker / policy (EACCES, EPERM, UNKNOWN) or missing.
    proc.on('error', (err) => {
      if (child !== proc) return;
      block(`spawn-${(err && err.code) || 'error'}`);
    });
    proc.on('exit', (code) => {
      if (child !== proc) return;
      const wasReady = ready;
      child = null;
      ready = false;
      if (handshake) clearTimeout(handshake);
      handshake = null;
      if (blocked) return settleAll(unsupported());
      if (!wasReady) {
        // Killed before it could start (virus scanner, policy): one more try, then off.
        earlyExits += 1;
        if (earlyExits >= 2) return block(`exit-before-ready-${code}`);
        return settleAll(quiet());
      }
      settleAll(quiet());
      // Crashed later: back off, so nothing loops.
      failures += 1;
      if (failures >= 3) pausedUntil = now() + 5 * 60_000;
    });
    return proc;
  }

  const send = (cmd) =>
    new Promise((resolve) => {
      if (platform !== 'win32' || blocked) return resolve(unsupported());
      if (!COMMANDS.has(cmd)) return resolve(quiet());
      const proc = start();
      if (blocked) return resolve(unsupported());
      if (!proc || !proc.stdin.writable) return resolve(quiet());
      const id = ++seq;
      // The first answer may wait for PowerShell to start.
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(blocked ? unsupported() : quiet());
      }, ready ? REPLY_MS : handshakeMs + 500);
      pending.set(id, { resolve, timer });
      try {
        proc.stdin.write(`${JSON.stringify({ id, cmd })}\n`);
      } catch {
        /* exit handler settles it */
      }
    });

  const dispose = () => {
    stop();
    settleAll(quiet());
  };

  return {
    send,
    dispose,
    get available() {
      return platform === 'win32' && !blocked;
    },
  };
}

function sanitize(msg) {
  const text = (v) => (typeof v === 'string' ? v.slice(0, 160) : '');
  return {
    ok: msg.ok === true,
    supported: true,
    active: msg.active === true,
    playing: msg.playing === true,
    title: text(msg.title),
    artist: text(msg.artist),
    app: text(msg.app),
  };
}

module.exports = { createMediaBridge };
