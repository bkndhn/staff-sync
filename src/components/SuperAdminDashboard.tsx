import React, { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/supabase';
import { Building, LogOut, Plus, User, Sliders, X, Play, Pause, Trash2 } from 'lucide-react';
import { customAlert, customConfirm } from './CustomDialog';

interface Tenant {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  created_at: string;
  staff_limit?: number;
}

export function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');

  const [adminActionType, setAdminActionType] = useState<'create' | 'update_password'>('create');

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [newLimit, setNewLimit] = useState<number | ''>('');
  const [savingLimit, setSavingLimit] = useState(false);
  
  const loadTenants = async () => {
    try {
      setIsLoading(true);
      const sessionData = localStorage.getItem('staffManagementLogin');
      if (!sessionData) return;
      const { sessionToken } = JSON.parse(sessionData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({
          table: 'tenants',
          op: 'select',
          order: { col: 'created_at', ascending: false }
        })
      });

      if (!response.ok) {
        let errMessage = 'Failed to load tenants';
        try {
          const errData = await response.json();
          errMessage = errData.error || errMessage;
        } catch(e) {}
        throw new Error(errMessage);
      }
      const { data } = await response.json();
      setTenants(data || []);
    } catch (error: any) {
      console.error('Error loading tenants:', error);
      customAlert(`Failed to load clients: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleCreateOrUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdmin.email || !newAdmin.password) return;
    
    setSavingAdmin(true);
    try {
      const sessionData = localStorage.getItem('staffManagementLogin');
      if (!sessionData) return;
      const { sessionToken } = JSON.parse(sessionData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({
          op: adminActionType === 'create' ? 'create_admin' : 'update_admin_password',
          values: {
            tenant_id: selectedTenant?.id,
            email: newAdmin.email,
            full_name: newAdmin.name,
            password: newAdmin.password
          }
        })
      });

      if (!response.ok) {
        let errMessage = 'Failed to process request';
        try {
          const errData = await response.json();
          errMessage = errData.error || errMessage;
        } catch(e) {}
        throw new Error(errMessage);
      }

      customAlert(adminActionType === 'create' ? 'Admin user created successfully' : 'Password updated successfully');
      setShowAdminModal(false);
      setNewAdmin({ email: '', name: '', password: '' });
    } catch (error: any) {
      console.error('Error with admin action:', error);
      customAlert(error.message);
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleUpdateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    
    setSavingLimit(true);
    try {
      const sessionData = localStorage.getItem('staffManagementLogin');
      if (!sessionData) return;
      const { sessionToken } = JSON.parse(sessionData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({
          table: 'tenants',
          op: 'update',
          values: { staff_limit: newLimit === '' ? null : newLimit },
          filters: [{ column: 'id', operator: 'eq', value: selectedTenant.id }]
        })
      });

      if (!response.ok) throw new Error('Failed to update limit');

      customAlert('Staff limit updated successfully');
      setShowLimitModal(false);
      loadTenants();
    } catch (error) {
      console.error('Error updating limit:', error);
      customAlert('Failed to update staff limit. Have you run the SQL migration?');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;

    try {
      const sessionData = localStorage.getItem('staffManagementLogin');
      if (!sessionData) return;
      const { sessionToken } = JSON.parse(sessionData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({
          table: 'tenants',
          op: 'insert',
          values: {
            name: newTenantName.trim(),
            status: 'ACTIVE'
          }
        })
      });

      if (!response.ok) throw new Error('Failed to add tenant');
      
      const { data: newTenantArray } = await response.json();
      const newTenant = newTenantArray?.[0];

      if (newTenant && adminEmail && adminPassword) {
        const adminResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': sessionToken
          },
          body: JSON.stringify({
            table: 'app_users',
            op: 'create_admin',
            values: {
              tenant_id: newTenant.id,
              email: adminEmail,
              password: adminPassword,
              full_name: adminName || 'Admin'
            }
          })
        });
        
        if (!adminResponse.ok) {
          const errorData = await adminResponse.json();
          customAlert(`Client added, but failed to create admin: ${errorData.error || 'Unknown error'}`);
        } else {
          customAlert('Client and Admin account created successfully!');
        }
      } else {
        customAlert('Client added successfully without admin.');
      }
      
      setNewTenantName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminName('');
      setShowAddModal(false);
      loadTenants();
    } catch (error) {
      console.error('Error adding tenant:', error);
      customAlert('Failed to add client');
    }
  };

  const toggleTenantStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const msg = tenant.status === 'ACTIVE' 
      ? `Are you sure you want to PAUSE ${tenant.name}?`
      : `Are you sure you want to ACTIVATE ${tenant.name}?`;
      
    if (!await customConfirm(msg)) return;

    try {
      const sessionData = localStorage.getItem('staffManagementLogin');
      if (!sessionData) return;
      const { sessionToken } = JSON.parse(sessionData);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken
        },
        body: JSON.stringify({
          table: 'tenants',
          op: 'update',
          values: { status: newStatus },
          filters: [{ col: 'id', op: 'eq', val: tenant.id }]
        })
      });

      if (!response.ok) throw new Error('Failed to update tenant');
      loadTenants();
    } catch (error: any) {
      console.error('Error updating tenant:', error);
      customAlert('Failed to update client status');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-purple-900 text-white p-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Building size={24} />
          <h1 className="text-xl font-bold" style={{ color: 'white' }}>Super Admin Dashboard</h1>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 bg-purple-800 hover:bg-purple-700 rounded-lg transition-colors"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Clients (Tenants)</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>Add Client</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-600 text-sm uppercase tracking-wider">
                    <th className="p-4 font-semibold">Client Name</th>
                    <th className="p-4 font-semibold text-center">Staff Limit</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Created Date</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tenants.map(tenant => (
                    <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{tenant.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">{tenant.id}</div>
                      </td>
                      <td className="p-4 text-center text-sm font-medium">
                        {tenant.staff_limit || (tenant.staff_limit === 0 ? 0 : 'N/A')}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          tenant.status === 'ACTIVE' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {new Date(tenant.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setAdminActionType('create');
                              setShowAdminModal(true);
                            }}
                            className="p-2 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
                            title="Manage Admin Account"
                          >
                            <User size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setNewLimit(tenant.staff_limit ?? '');
                              setShowLimitModal(true);
                            }}
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Set Staff Limit"
                          >
                            <Sliders size={18} />
                          </button>
                          <button
                            onClick={() => toggleTenantStatus(tenant)}
                            className={`p-2 rounded-lg transition-colors ${
                              tenant.status === 'ACTIVE'
                                ? 'text-yellow-600 hover:bg-yellow-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={tenant.status === 'ACTIVE' ? 'Pause Client' : 'Activate Client'}
                          >
                            {tenant.status === 'ACTIVE' ? <Pause size={18} /> : <Play size={18} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Client</h3>
              <form onSubmit={handleAddTenant}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                  <input type="text" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500" required />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                  <input type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500" required />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                  <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500" required />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                  <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500" minLength={6} required />
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">Add Client</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Manage Admin Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Manage Admin</h3>
              <button 
                onClick={() => setShowAdminModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-6 bg-purple-50 p-3 rounded-lg border border-purple-100">
              <span className="text-sm text-purple-800 font-medium">Client: </span>
              <span className="text-sm font-bold text-purple-900">{selectedTenant?.name}</span>
            </div>

            <div className="flex gap-2 mb-6">
              <button 
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${adminActionType === 'create' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                onClick={() => setAdminActionType('create')}
              >
                Create Admin
              </button>
              <button 
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${adminActionType === 'update_password' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                onClick={() => setAdminActionType('update_password')}
              >
                Change Password
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdateAdmin} className="space-y-4">
              {adminActionType === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Admin Name"
                    value={newAdmin.name}
                    onChange={(e) => setNewAdmin({...newAdmin, name: e.target.value})}
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {adminActionType === 'create' ? 'Email Address' : 'Admin Email Address'}
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="admin@client.com"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({...newAdmin, email: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Minimum 6 characters"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({...newAdmin, password: e.target.value})}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAdmin}
                  className="flex-1 px-4 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {savingAdmin ? 'Saving...' : (adminActionType === 'create' ? 'Create Admin' : 'Update Password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Set Staff Limit</h3>
              <button 
                onClick={() => setShowLimitModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleUpdateLimit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Staff Members</label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="e.g. 50"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value ? parseInt(e.target.value) : '')}
                />
                <p className="text-xs text-gray-500 mt-2">Leave blank to remove limit (requires DB support).</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLimitModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLimit}
                  className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {savingLimit ? 'Saving...' : 'Save Limit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
