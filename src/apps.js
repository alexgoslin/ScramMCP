// Finding, quitting and starting another desktop app (the Claude or ChatGPT desktop app), so it
// loads new settings. Used by "Connect the Claude desktop app" and "Connect the ChatGPT desktop app".
//
// An app is described as:
//   { winExe: "claude.exe",        its program's name on Windows
//     winPath: /\\WindowsApps\\…/,  optional: also list processes whose program path matches this
//     winIs: /\\WindowsApps\\…/,    where the app is installed: a process counts as the app only if
//                                  its program is there, or it's a helper process of the app (an
//                                  Electron --type= / --user-data-dir= process), never "unknown"
//     winSkip: /…/,                optional: never these programs (e.g. Claude Code, also claude.exe)
//     winStartName: "Claude",      its name in the Start menu (Windows)
//     winFallback: "AnthropicClaude\\claude.exe",  optional: its program, under %LOCALAPPDATA%
//     macName: "Claude" }          its name on a Mac (process and app)
//
// On Windows nothing is ever closed by name: only processes positively identified as the app,
// so another program with the same name (Claude Code is also claude.exe) is never touched.

import { execFile } from "node:child_process";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function run(command, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "") }));
  });
}

// PowerShell, given as -EncodedCommand so nothing in the script needs quoting for the command line.
export function powershell(script, options) {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], options);
}

export async function waitUntil(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(500);
  }
  return check();
}

const psString = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Lists an app's processes with their program and command line, as JSON. (Checked on Windows by the tests.)
export function windowsProcessesScript(app) {
  const pick = app.winPath
    ? `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ${psString(app.winExe)} -or ($_.ExecutablePath -and $_.ExecutablePath -match ${psString(app.winPath.source)}) }`
    : `Get-CimInstance Win32_Process -Filter ${psString(`Name='${app.winExe}'`)}`;
  return (
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n" +
    `$p = @(${pick} | Select-Object ProcessId, ExecutablePath, CommandLine)\n` +
    "ConvertTo-Json -InputObject $p -Compress -Depth 2\n"
  );
}

// Is this process the app? Its program must be where the app is installed, or (for an unusual
// install place) it must be one of the app's Electron processes. A process whose program can't
// be seen (e.g. one running as administrator) never counts.
export function isAppProcess(app, p) {
  if (!p.path || (app.winSkip && app.winSkip.test(p.path))) return false;
  return app.winIs.test(p.path) || /\s--(user-data-dir|type)=/.test(p.commandLine);
}

// An app's processes on Windows ({ pid, path, commandLine }), or null if they couldn't be listed.
export async function windowsProcesses(app) {
  const { ok, out } = await powershell(windowsProcessesScript(app), { timeout: 30000 });
  if (!ok) return null;
  try {
    const list = JSON.parse(out.trim() || "[]");
    return (Array.isArray(list) ? list : [list])
      .map((p) => ({ pid: p.ProcessId, path: p.ExecutablePath || "", commandLine: p.CommandLine || "" }))
      .filter((p) => isAppProcess(app, p));
  } catch {
    return null;
  }
}

// PowerShell that starts an app the way the Start menu does (works for normal and Store/MSIX
// installs), else from its usual install folder. (Checked on Windows by the tests.)
export function windowsStartScript(app) {
  const fallback = app.winFallback
    ? `$exe = Join-Path $env:LOCALAPPDATA ${psString(app.winFallback)}; if (Test-Path $exe) { Start-Process $exe; exit 0 }; `
    : "";
  return (
    `$a = Get-StartApps | Where-Object { $_.Name -eq ${psString(app.winStartName)} } | Select-Object -First 1; ` +
    "if ($a) { Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\\' + $a.AppID); exit 0 }; " +
    `${fallback}exit 1`
  );
}

// Is the app in the Start menu? (Windows)
export async function inWindowsStartMenu(app) {
  const { ok, out } = await powershell(`if (Get-StartApps | Where-Object { $_.Name -eq ${psString(app.winStartName)} }) { 'yes' }`, { timeout: 30000 });
  return ok && out.includes("yes");
}

// true / false, or null on Windows if the processes couldn't be listed (so it isn't known).
export async function appRunning(app, platform = process.platform) {
  if (platform === "win32") {
    const processes = await windowsProcesses(app);
    return processes ? processes.length > 0 : null;
  }
  if (platform === "darwin") return (await run("pgrep", ["-x", app.macName])).ok;
  return false;
}

// Quits the app. True once it has really quit.
export async function quitApp(app, platform = process.platform) {
  if (platform === "darwin") {
    // A normal quit signal: no "control another app" permission needed (asking the app to quit
    // through AppleScript would need one, and can fail silently without it).
    await run("pkill", ["-TERM", "-x", app.macName]);
  } else if (platform === "win32") {
    // Closing these apps' windows often only hides them in the system tray, so they're ended:
    // only the processes known to be the app. If they can't be listed, nothing is closed (the
    // person is asked to restart the app instead).
    const processes = await windowsProcesses(app);
    if (processes === null) return false;
    if (processes.length) await run("taskkill", [...processes.flatMap((p) => ["/PID", String(p.pid)]), "/T", "/F"]);
  } else return false;
  return waitUntil(async () => (await appRunning(app, platform)) === false, 20000);
}

// Opens the app. True once it's running.
export async function startApp(app, platform = process.platform) {
  if (platform === "darwin") {
    if (!(await run("open", ["-a", app.macName])).ok) return false;
  } else if (platform === "win32") {
    if (!(await powershell(windowsStartScript(app), { timeout: 30000 })).ok) return false;
  } else return false;
  return waitUntil(async () => (await appRunning(app, platform)) === true, 30000);
}
