import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { auditLogService } from '../services/auditLogService';
import { Search, ShieldAlert, Clock, RefreshCw, Trash2, Filter, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { customConfirm } from './CustomDialog';

const formatValue = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

const humanizeField = (key: string): string =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());

// ── Dark colour tokens (always dark, immune to light-theme overrides) ──────────
const C = {
  bg:         '#0f172a',
  bgCard:     '#1e293b',
  bgCardHov:  '#263347',
  bgHdr:      '#162032',
  border:     '#334155',
  borderSoft: '#1e3a5f',
  text:       '#f1f5f9',
  textSub:    '#cbd5e1',
  textMuted:  '#64748b',
  textFaint:  '#475569',
  purple:     '#c084fc',
  purpleBg:   'rgba(168,85,247,0.12)',
  purpleBdr:  'rgba(168,85,247,0.25)',
  blue:       '#60a5fa',
  amber:      '#fbbf24',
  rose:       '#f87171',
  teal:       '#2dd4bf',
  emerald:    '#34d399',
};

export const AuditLogViewer: React.FC<{ currentUserEmail: string }> = ({ currentUserEmail }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await auditLogService.getLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleClear = async () => {
    if (await customConfirm('Clear local audit trail history? Remote logs are unaffected.')) {
      await auditLogService.clearLogs();
      setLogs([]);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.staffName && log.staffName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesAction = selectedAction === 'all' || log.action === selectedAction;
    return matchesSearch && matchesAction;
  });

  const getActionBadge = (action: AuditLog['action']) => {
    const map: Record<string, { bg: string; border: string; color: string; label: string }> = {
      attendance_override: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: C.amber,   label: 'Attendance Override' },
      salary_edit:         { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)', color: C.blue,    label: 'Payroll Edit' },
      staff_update:        { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', color: C.emerald, label: 'Staff Update' },
      staff_create:        { bg: 'rgba(45,212,191,0.12)', border: 'rgba(45,212,191,0.3)', color: C.teal,    label: 'Staff Created' },
      staff_delete:        { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', color: C.rose,  label: 'Staff Removed' },
      bulk_update:         { bg: C.purpleBg, border: C.purpleBdr, color: C.purple, label: 'Bulk Action' },
      settings_update:     { bg: 'rgba(129,140,248,0.12)', border: 'rgba(129,140,248,0.3)', color: '#818cf8', label: 'Settings Update' },
    };
    const cfg = map[action] || { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', color: C.textMuted, label: action };
    return (
      <span style={{
        background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
        padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
        letterSpacing: '0.02em', display: 'inline-block',
      }}>
        {cfg.label}
      </span>
    );
  };

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      });
    } catch { return isoStr; }
  };

  // All rendered inside a single dark wrapper — immune to body.light-theme overrides
  return (
    <div data-audit-dark="true" style={{
      background: C.bg, borderRadius: 16, padding: '16px',
      minHeight: '60vh', color: C.text,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: '100%' }}>

        {/* Header */}
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: '16px 20px', display: 'flex', flexWrap: 'wrap',
          justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: C.purpleBg, border: `1px solid ${C.purpleBdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ShieldAlert style={{ color: C.purple }} size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>System Audit Trail</span>
                <span style={{
                  fontSize: 11, padding: '1px 8px', borderRadius: 999,
                  background: C.purpleBg, color: C.purple, border: `1px solid ${C.purpleBdr}`,
                  fontFamily: 'monospace', fontWeight: 600,
                }}>
                  {filteredLogs.length} Records
                </span>
              </div>
              <p style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                Before/after diffs for staff, attendance, salary, and settings changes.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchLogs} disabled={loading} style={{
              background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: 999, padding: '8px 16px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
            <button onClick={handleClear} style={{
              background: '#ef4444', color: '#fff', border: 'none',
              borderRadius: 999, padding: '8px 16px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Trash2 size={14} />
              Clear
            </button>
          </div>
        </div>

        {/* Search + Filter */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: C.textMuted, pointerEvents: 'none',
            }} />
            <input
              type="text"
              placeholder="Search by staff name, details, or user…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
                background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <Filter size={15} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: C.textMuted, pointerEvents: 'none',
            }} />
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              style={{
                paddingLeft: 32, paddingRight: 24, paddingTop: 10, paddingBottom: 10,
                background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.text, fontSize: 13, outline: 'none', cursor: 'pointer',
                appearance: 'none', WebkitAppearance: 'none',
              }}
            >
              <option value="all" style={{ background: C.bgCard, color: C.text }}>All Event Types</option>
              <option value="attendance_override" style={{ background: C.bgCard, color: C.text }}>Attendance Override</option>
              <option value="salary_edit" style={{ background: C.bgCard, color: C.text }}>Payroll Edit</option>
              <option value="staff_update" style={{ background: C.bgCard, color: C.text }}>Staff Update</option>
              <option value="staff_create" style={{ background: C.bgCard, color: C.text }}>Staff Created</option>
              <option value="staff_delete" style={{ background: C.bgCard, color: C.text }}>Staff Removed</option>
              <option value="bulk_update" style={{ background: C.bgCard, color: C.text }}>Bulk Action</option>
              <option value="settings_update" style={{ background: C.bgCard, color: C.text }}>Settings Update</option>
            </select>
          </div>
        </div>

        {/* Log list */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <RefreshCw style={{ margin: '0 auto 12px', color: C.purple, animation: 'spin 1s linear infinite' }} size={28} />
              <p style={{ color: C.textMuted, fontSize: 13 }}>Loading audit trail…</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <ShieldAlert style={{ margin: '0 auto 12px', color: C.textFaint }} size={40} />
              <p style={{ color: C.textSub, fontSize: 13, fontWeight: 600 }}>No audit logs found</p>
              <p style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
                Changes to staff, attendance, salary, and settings will appear here with before/after values.
              </p>
            </div>
          ) : (
            <div>
              {filteredLogs.map((log, idx) => {
                const hasDiff = (log.changes && log.changes.length > 0);
                const isOpen = !!expanded[log.id];
                return (
                  <div key={log.id} style={{
                    padding: '14px 18px',
                    borderBottom: idx < filteredLogs.length - 1 ? `1px solid ${C.border}` : 'none',
                    background: 'transparent',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.bgCardHov)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          {getActionBadge(log.action)}
                          {log.staffName && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>
                              Target: <span style={{ color: C.blue }}>{log.staffName}</span>
                            </span>
                          )}
                          {hasDiff && (
                            <span style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 4,
                              background: C.purpleBg, color: C.purple, border: `1px solid ${C.purpleBdr}`,
                              fontFamily: 'monospace',
                            }}>
                              {log.changes!.length} field{log.changes!.length > 1 ? 's' : ''} changed
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: C.textSub, lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
                          {log.details}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, fontSize: 11, fontFamily: 'monospace', color: C.textMuted }}>
                          <span>By: <span style={{ color: '#94a3b8', fontWeight: 600 }}>{log.performedBy}</span></span>
                          {log.performedBy === currentUserEmail && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 4,
                              background: '#1e293b', color: '#64748b', border: `1px solid ${C.border}`,
                            }}>You</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, alignSelf: 'flex-end' }}>
                        {hasDiff && (
                          <button
                            onClick={() => setExpanded(e => ({ ...e, [log.id]: !e[log.id] }))}
                            style={{
                              fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                              padding: '4px 8px', borderRadius: 6, color: C.purple,
                              background: 'transparent', border: `1px solid transparent`, cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.purpleBg; e.currentTarget.style.borderColor = C.purpleBdr; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {isOpen ? 'Hide diff' : 'View diff'}
                          </button>
                        )}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                          color: C.textMuted, fontFamily: 'monospace',
                          background: '#0f172a', padding: '6px 10px', borderRadius: 8,
                          border: `1px solid ${C.border}`,
                        }}>
                          <Clock size={12} style={{ color: C.purple, opacity: 0.7, flexShrink: 0 }} />
                          <span style={{ color: C.textMuted }}>{formatDate(log.timestamp)}</span>
                        </div>
                      </div>
                    </div>

                    {isOpen && hasDiff && (
                      <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(15,23,42,0.7)' }}>
                              <th style={{ textAlign: 'left', padding: '6px 10px', color: C.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Field</th>
                              <th style={{ textAlign: 'left', padding: '6px 10px', color: '#f87171', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Before</th>
                              <th style={{ width: 28, padding: '6px 4px' }}></th>
                              <th style={{ textAlign: 'left', padding: '6px 10px', color: C.emerald, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {log.changes!.map((c, i) => (
                              <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: '6px 10px', fontWeight: 600, color: C.textSub }}>{c.label ? humanizeField(c.label) : humanizeField(c.field)}</td>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#f87171', textDecoration: 'line-through', opacity: 0.75 }}>{formatValue(c.oldValue)}</td>
                                <td style={{ padding: '6px 4px', color: C.textFaint }}><ArrowRight size={12} /></td>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: C.emerald }}>{formatValue(c.newValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
