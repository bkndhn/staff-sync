import React, { useState, useEffect } from 'react';
import { Cpu, Wifi, WifiOff, Copy, Check, Terminal, ShieldCheck, RefreshCw, AlertTriangle, Key, Download, Activity, Layers, Server } from 'lucide-react';
import { dataApi } from '../lib/dataApi';
import { staffService, Staff } from '../services/staffService';
import { customAlert } from './CustomDialog';

interface DeviceStatus {
  id: string;
  device_id: string;
  device_name: string;
  location: string;
  last_seen_at: string;
  status: 'online' | 'offline' | 'warning';
  ip_address?: string;
  total_punches_today?: number;
}

export const BiometricIntegrationHub: React.FC = () => {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'devices' | 'webhook' | 'mapping' | 'desktopAgent'>('devices');

  const pushEndpointUrl = "https://nsmppwnpdxomjmgrtqka.supabase.co/functions/v1/device-push";
  const pushToken = "essl_cloud_secure_push_token_2026"; // Standard configured push token

  const loadData = async () => {
    setLoading(true);
    try {
      const [devRes, staffData] = await Promise.all([
        dataApi.from("device_status").select("*"),
        staffService.getAll()
      ]);
      if (devRes.data) {
        setDevices(devRes.data as DeviceStatus[]);
      }
      setStaffList(staffData);
    } catch (e) {
      console.error("Error loading biometric hub data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const generatePowerShellAgent = () => {
    return `# Staff-Sync Local eSSL eTimeTrackLite Desktop Sync Agent
# Runs silently on Store Admin PC to auto-push local eSSL punches to Staff-Sync Cloud every 60s.

$WebhookUrl = "${pushEndpointUrl}"
$PushToken  = "${pushToken}"

# Path to local eSSL Access DB or SQL Server Connection
$MdbPath = "C:\\Program Files (x86)\\eTimeTrackLite\\eTimeTrackLite.mdb"

Write-Host "Starting Staff-Sync eSSL Biometric Bridge..." -ForegroundColor Green

while ($true) {
    try {
        if (Test-Path $MdbPath) {
            # Query recent punches from local DB
            $connStr = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$MdbPath"
            $conn = New-Object System.Data.OleDb.OleDbConnection($connStr)
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = "SELECT TOP 50 UserId, LogDate FROM AttendanceLogs WHERE LogDate >= DATEADD('m', -10, NOW()) ORDER BY LogDate DESC"
            $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
            $dt = New-Object System.Data.DataTable
            $adapter.Fill($dt) | Out-Null
            $conn.Close()

            $punches = @()
            foreach ($row in $dt.Rows) {
                $punches += @{
                    device_id = [string]$row["UserId"]
                    timestamp = ([datetime]$row["LogDate"]).ToString("o")
                    kind      = "unknown"
                }
            }

            if ($punches.Count -gt 0) {
                $payload = @{ punches = $punches } | ConvertTo-Json -Depth 3
                $headers = @{ "Authorization" = "Bearer $PushToken"; "Content-Type" = "application/json" }
                Invoke-RestMethod -Uri $WebhookUrl -Method Post -Headers $headers -Body $payload
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Pushed $($punches.Count) punches to Cloud." -ForegroundColor Cyan
            }
        }
    } catch {
        Write-Host "Sync Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Seconds 60
}`;
  };

  const unmappedStaff = staffList.filter(s => !s.deviceId || s.deviceId.trim() === '');
  const mappedStaff = staffList.filter(s => s.deviceId && s.deviceId.trim() !== '');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-xl border border-purple-500/30">
              <Cpu className="text-purple-300 h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold">Biometric & eSSL Integration Hub</h2>
              <p className="text-sm text-purple-200">
                Enterprise Cloud-Push & Pull Biometric Device Synchronization Engine
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh Status
            </button>
          </div>
        </div>

        {/* Quick Nav Tabs */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-white/10">
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'devices' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white/5 text-purple-200 hover:bg-white/10'
            }`}
          >
            <Activity size={16} /> Live Hardware Devices ({devices.length})
          </button>
          <button
            onClick={() => setActiveTab('webhook')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'webhook' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white/5 text-purple-200 hover:bg-white/10'
            }`}
          >
            <Server size={16} /> Cloud Webhook API
          </button>
          <button
            onClick={() => setActiveTab('mapping')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'mapping' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white/5 text-purple-200 hover:bg-white/10'
            }`}
          >
            <Layers size={16} /> Enroll Number Mapping ({mappedStaff.length}/{staffList.length})
          </button>
          <button
            onClick={() => setActiveTab('desktopAgent')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'desktopAgent' ? 'bg-purple-500 text-white shadow-lg' : 'bg-white/5 text-purple-200 hover:bg-white/10'
            }`}
          >
            <Terminal size={16} /> On-Premise eSSL Windows Agent
          </button>
        </div>
      </div>

      {/* Tab 1: Live Hardware Devices */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Cpu className="text-purple-600" size={20} /> Registered Biometric Terminals
            </h3>
            <span className="text-xs text-gray-500">Auto-refreshed via Heartbeat API</span>
          </div>

          {devices.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center space-y-3">
              <AlertTriangle className="mx-auto text-amber-500" size={40} />
              <h4 className="font-bold text-gray-800">No Biometric Hardware Connected Yet</h4>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Configure your eSSL / ZKTeco device with the Webhook URL in the <strong>Cloud Webhook API</strong> tab or run the <strong>On-Premise Windows Agent</strong> script to stream real-time punches.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map(dev => {
                const isOnline = new Date().getTime() - new Date(dev.last_seen_at).getTime() < 15 * 60 * 1000;
                return (
                  <div key={dev.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-xl ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{dev.device_name}</h4>
                          <span className="text-xs text-gray-500 font-mono">ID: {dev.device_id}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600 border-t border-gray-100 pt-3">
                      <div className="flex justify-between">
                        <span>Location:</span>
                        <span className="font-semibold text-gray-900">{dev.location}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Heartbeat:</span>
                        <span className="font-semibold text-gray-900">{new Date(dev.last_seen_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Punches Processed Today:</span>
                        <span className="font-bold text-purple-600">{dev.total_punches_today || 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Cloud Webhook API */}
      {activeTab === 'webhook' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Server className="text-purple-600" size={20} /> Direct eSSL / Webhook Push Configuration
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Configure your cloud-enabled eSSL / ZK / Suprema terminal or HTTP Webhook software with these parameters:
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Push Endpoint URL (POST)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={pushEndpointUrl}
                  className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-800"
                />
                <button
                  onClick={() => handleCopy(pushEndpointUrl, 'url')}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-all"
                >
                  {copiedKey === 'url' ? <Check size={16} /> : <Copy size={16} />}
                  {copiedKey === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Authorization Token (`x-device-token` or `Bearer`)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={pushToken}
                  className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-800"
                />
                <button
                  onClick={() => handleCopy(pushToken, 'token')}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-all"
                >
                  {copiedKey === 'token' ? <Check size={16} /> : <Copy size={16} />}
                  {copiedKey === 'token' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Payload Format Example */}
            <div className="bg-slate-900 rounded-xl p-4 text-slate-200 text-xs font-mono space-y-2">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5"><Terminal size={14} /> Expected JSON Payload Format</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">HTTP 200 OK</span>
              </div>
              <pre className="overflow-x-auto text-emerald-400">
{`{
  "device_id": "101",                      // Employee Enroll Number
  "timestamp": "2026-08-05T09:30:00+05:30", // ISO Timestamp
  "kind": "in",                            // "in" | "out" | "break_in" | "break_out"
  "device_name": "eSSL-MainGate",
  "location": "Big Shop"
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Enroll Number Mapping */}
      {activeTab === 'mapping' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Layers className="text-purple-600" size={20} /> Biometric Enroll Number Mapping
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Each employee must have a matching <strong>Biometric Enroll Number (Device ID)</strong> to attribute hardware punches.
              </p>
            </div>
          </div>

          {unmappedStaff.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800 text-sm">
              <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
              <div>
                <strong>{unmappedStaff.length} staff member(s)</strong> do not have a Biometric Enroll Number set. Update their profiles in Staff Management to enable automatic punch matching.
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                <tr>
                  <th className="p-3">Staff Name</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Floor</th>
                  <th className="p-3">Biometric Enroll ID</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staffList.map(s => {
                  const hasDevice = s.deviceId && s.deviceId.trim() !== '';
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-900">{s.name}</td>
                      <td className="p-3 text-gray-600">{s.location}</td>
                      <td className="p-3 text-gray-600">{s.floor || '-'}</td>
                      <td className="p-3 font-mono">
                        {hasDevice ? (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-800 font-bold rounded-lg text-xs">
                            {s.deviceId}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not set</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {hasDevice ? (
                          <span className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1">
                            <ShieldCheck size={14} /> Mapped
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-amber-600">Unmapped</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: On-Premise Desktop Agent */}
      {activeTab === 'desktopAgent' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Terminal className="text-purple-600" size={20} /> Local eSSL Windows Desktop Sync Agent
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              For store locations running local <strong>eSSL eTimeTrackLite Desktop Software</strong> on a local Windows PC:
            </p>
          </div>

          <div className="bg-slate-900 text-slate-200 p-4 rounded-xl space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
              <span className="flex items-center gap-2"><Terminal size={14} /> `StaffSync-eSSL-Agent.ps1` (PowerShell Script)</span>
              <button
                onClick={() => handleCopy(generatePowerShellAgent(), 'ps1')}
                className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold transition-all"
              >
                {copiedKey === 'ps1' ? <Check size={12} /> : <Copy size={12} />}
                {copiedKey === 'ps1' ? 'Copied' : 'Copy Script'}
              </button>
            </div>
            <pre className="overflow-x-auto text-cyan-300 max-h-80">
              {generatePowerShellAgent()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
