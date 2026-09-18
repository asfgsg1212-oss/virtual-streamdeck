import { execFile } from 'child_process'
import { promisify } from 'util'
import type { MediaKey } from '../shared/types'

const run = promisify(execFile)

async function runPS(script: string): Promise<string> {
  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { maxBuffer: 10 * 1024 * 1024 }
  )
  return stdout
}

// Core Audio (per-app volume/mute) via raw COM interop — there is no higher-level API for this.
const AUDIO_INTEROP_CS = `
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), ClassInterface(ClassInterfaceType.None), ComImport]
public class MMDeviceEnumeratorComObject { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator { int NotImpl1(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice { int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface); }

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum); }

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionEnumerator { int GetCount(out int SessionCount); int GetSession(int SessionCount, out IAudioSessionControl2 Session); }

[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl2
{
    int NotImpl1();
    int GetDisplayName(out IntPtr pRetVal);
    int SetDisplayName(string Value, ref Guid EventContext);
    int GetIconPath(out IntPtr pRetVal);
    int SetIconPath(string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int NotImpl2();
    int NotImpl3();
    int GetSessionIdentifier(out IntPtr pRetVal);
    int GetSessionInstanceIdentifier(out IntPtr pRetVal);
    int GetProcessId(out int pRetVal);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
}

[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISimpleAudioVolume
{
    int SetMasterVolume(float fLevel, ref Guid EventContext);
    int GetMasterVolume(out float pfLevel);
    int SetMute(bool bMute, ref Guid EventContext);
    int GetMute(out bool pbMute);
}

public class AudioInterop
{
    static IAudioSessionEnumerator GetEnumerator()
    {
        object enumObj = new MMDeviceEnumeratorComObject();
        IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)enumObj;
        IMMDevice device;
        enumerator.GetDefaultAudioEndpoint(0, 1, out device);
        Guid iid = typeof(IAudioSessionManager2).GUID;
        object mgrObj;
        device.Activate(ref iid, 23, IntPtr.Zero, out mgrObj);
        IAudioSessionManager2 mgr = (IAudioSessionManager2)mgrObj;
        IAudioSessionEnumerator sessionEnum;
        mgr.GetSessionEnumerator(out sessionEnum);
        return sessionEnum;
    }

    public static List<string> ListAppNames()
    {
        // IAudioSessionControl2.IsSystemSoundsSession's HRESULT->bool mapping isn't reliable
        // through this interop (it reads true for every session in practice), so system sounds
        // are excluded by name instead; everything else with a real PID is a real app.
        var names = new List<string>();
        var sessionEnum = GetEnumerator();
        int count;
        sessionEnum.GetCount(out count);
        for (int i = 0; i < count; i++)
        {
            IAudioSessionControl2 session;
            sessionEnum.GetSession(i, out session);
            if (session == null) continue;
            int pid;
            session.GetProcessId(out pid);
            if (pid <= 0) continue;
            string name;
            try { name = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { continue; }
            if (name.Equals("audiodg", StringComparison.OrdinalIgnoreCase)) continue;
            if (!names.Contains(name)) names.Add(name);
        }
        return names;
    }

    public static bool ToggleMuteForProcess(string processNameSubstring)
    {
        var sessionEnum = GetEnumerator();
        int count;
        sessionEnum.GetCount(out count);
        bool any = false;
        for (int i = 0; i < count; i++)
        {
            IAudioSessionControl2 session;
            sessionEnum.GetSession(i, out session);
            if (session == null) continue;
            int pid;
            session.GetProcessId(out pid);
            string name = "";
            try { name = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { continue; }
            if (name.IndexOf(processNameSubstring, StringComparison.OrdinalIgnoreCase) < 0) continue;
            ISimpleAudioVolume vol = (ISimpleAudioVolume)session;
            bool current;
            vol.GetMute(out current);
            Guid ctx = Guid.Empty;
            vol.SetMute(!current, ref ctx);
            any = true;
        }
        return any;
    }

    public static bool AdjustVolumeForProcess(string processNameSubstring, float delta)
    {
        var sessionEnum = GetEnumerator();
        int count;
        sessionEnum.GetCount(out count);
        bool any = false;
        for (int i = 0; i < count; i++)
        {
            IAudioSessionControl2 session;
            sessionEnum.GetSession(i, out session);
            if (session == null) continue;
            int pid;
            session.GetProcessId(out pid);
            string name = "";
            try { name = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { continue; }
            if (name.IndexOf(processNameSubstring, StringComparison.OrdinalIgnoreCase) < 0) continue;
            ISimpleAudioVolume vol = (ISimpleAudioVolume)session;
            float current;
            vol.GetMasterVolume(out current);
            float next = Math.Max(0f, Math.Min(1f, current + delta));
            Guid ctx = Guid.Empty;
            vol.SetMasterVolume(next, ref ctx);
            any = true;
        }
        return any;
    }
}
`

// System Media Transport Controls (per-app play/pause/next/prev) via WinRT.
const SMTC_HELPERS_PS = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $AsTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
function Get-SmtcSessions {
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $mgr.GetSessions()
}
`

const TARGET_APP_LIMIT = 60
function assertSafeTarget(target: string): void {
  if (!target || target.length > TARGET_APP_LIMIT || /['"$\`]/.test(target)) {
    throw new Error('invalid target app name')
  }
}

export async function listAudioApps(): Promise<string[]> {
  try {
    const stdout = await runPS(`Add-Type -TypeDefinition @'${AUDIO_INTEROP_CS}'@ -Language CSharp\n[AudioInterop]::ListAppNames() | ConvertTo-Json`)
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

/** Routes a media key to a specific app instead of the system-wide default, using whichever
 *  mechanism actually applies: Core Audio for volume/mute, SMTC for transport controls. */
export async function sendTargetedMediaCommand(command: MediaKey, targetApp: string): Promise<void> {
  assertSafeTarget(targetApp)
  if (command === 'mute' || command === 'volumeUp' || command === 'volumeDown') {
    const call =
      command === 'mute'
        ? `[AudioInterop]::ToggleMuteForProcess('${targetApp}')`
        : `[AudioInterop]::AdjustVolumeForProcess('${targetApp}', ${command === 'volumeUp' ? '0.1' : '-0.1'})`
    await runPS(`Add-Type -TypeDefinition @'${AUDIO_INTEROP_CS}'@ -Language CSharp\n${call} | Out-Null`)
    return
  }

  const commandCall =
    command === 'playPause'
      ? 'Await ($target.TryTogglePlayPauseAsync()) ([bool])'
      : command === 'nextTrack'
        ? 'Await ($target.TrySkipNextAsync()) ([bool])'
        : 'Await ($target.TrySkipPreviousAsync()) ([bool])'
  await runPS(`${SMTC_HELPERS_PS}
$sessions = Get-SmtcSessions
$target = $sessions | Where-Object { $_.SourceAppUserModelId -like "*${targetApp}*" } | Select-Object -First 1
if ($target) { ${commandCall} | Out-Null }
`)
}
