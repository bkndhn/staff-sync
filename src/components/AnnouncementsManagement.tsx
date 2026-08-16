import React, { useState, useEffect } from 'react';
import { Megaphone, Plus, Edit2, Trash2, X, Check, AlertCircle } from 'lucide-react';
import { announcementService, Announcement } from '../services/announcementService';

export const AnnouncementsManagement: React.FC<{ currentUserRole?: string }> = ({ currentUserRole }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await announcementService.getAnnouncements();
      setAnnouncements(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setTitle('');
    setContent('');
    setPriority('normal');
    setShowModal(true);
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingItem(announcement);
    setTitle(announcement.title);
    setContent(announcement.content);
    setPriority(announcement.priority);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;
    try {
      await announcementService.deleteAnnouncement(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      setSuccess('Announcement deleted successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to delete announcement');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    try {
      if (editingItem) {
        const updated = await announcementService.updateAnnouncement(editingItem.id, {
          title: title.trim(),
          content: content.trim(),
          priority,
        });
        if (updated) {
          setAnnouncements(prev => prev.map(a => a.id === updated.id ? updated : a));
          setSuccess('Announcement updated successfully');
        }
      } else {
        const created = await announcementService.createAnnouncement({
          title: title.trim(),
          content: content.trim(),
          priority,
        });
        if (created) {
          setAnnouncements([created, ...announcements]);
          setSuccess('Announcement created successfully');
        }
      }
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save announcement');
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'low': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Megaphone size={24} className="text-indigo-400" />
            Company Announcements
          </h2>
          <p className="text-white/60 text-sm mt-1">Broadcast important updates to all staff members.</p>
        </div>
        <button onClick={handleAdd} className="btn-premium flex items-center gap-2 px-4 py-2">
          <Plus size={18} />
          New Announcement
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <Check size={20} />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess('')}><X size={18} /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertCircle size={20} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={18} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : announcements.length === 0 ? (
        <div className="glass-card-static p-8 text-center text-white/50">
          No announcements found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {announcements.map(announcement => (
            <div key={announcement.id} className="glass-card-static p-5 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">{announcement.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${getPriorityColor(announcement.priority)} capitalize`}>
                    {announcement.priority} Priority
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(announcement)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(announcement.id)} className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-white/70 whitespace-pre-wrap text-sm">{announcement.content}</p>
              <div className="mt-4 text-xs text-white/40">
                Posted on {new Date(announcement.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">
              {editingItem ? 'Edit Announcement' : 'New Announcement'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="input-premium"
                  placeholder="e.g., Office Closed for Holiday"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Message Content</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="input-premium h-32 resize-none"
                  placeholder="Enter the full announcement details here..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as 'low' | 'normal' | 'high')}
                  className="input-premium"
                >
                  <option value="low">Low (FYI only)</option>
                  <option value="normal">Normal (Standard Update)</option>
                  <option value="high">High (Urgent / Important)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 btn-secondary py-2.5">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary py-2.5">
                  {editingItem ? 'Update' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
