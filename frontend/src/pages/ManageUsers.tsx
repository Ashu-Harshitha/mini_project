import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  KeyRound, 
  Trash2, 
  ShieldAlert, 
  X, 
  Check, 
  AlertTriangle,
  UserPlus
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminUser, type CreateAgronomistPayload } from '@/api/adminApi';
import { useAppStore } from '@/store/useAppStore';

export const ManageUsers: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentAdmin } = useAppStore();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add Agronomist Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Reset Password Modal State
  const [resetTargetUser, setResetTargetUser] = useState<AdminUser | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete User Confirm State
  const [deleteTargetUser, setDeleteTargetUser] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers(roleFilter === 'all' ? undefined : roleFilter);
      setUsers(data);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreateAgronomist = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!newFullName || !newUsername || !newPassword) {
      setAddError('Full name, username, and password are required.');
      return;
    }
    if (newPassword.length < 6) {
      setAddError('Password must be at least 6 characters.');
      return;
    }

    setAddLoading(true);
    try {
      const payload: CreateAgronomistPayload = {
        full_name: newFullName,
        username: newUsername.trim().toLowerCase(),
        password: newPassword,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
      };
      const created = await adminApi.createAgronomist(payload);
      showToast('success', `Agronomist "${created.full_name}" created successfully!`);
      setIsAddModalOpen(false);
      setNewFullName('');
      setNewUsername('');
      setNewPassword('');
      setNewEmail('');
      setNewPhone('');
      fetchUsers();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to create agronomist');
    } finally {
      setAddLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setResetError(null);

    if (newResetPassword.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }

    setResetLoading(true);
    try {
      await adminApi.resetPassword(resetTargetUser.id, newResetPassword);
      showToast('success', `Password for "${resetTargetUser.username}" reset successfully!`);
      setResetTargetUser(null);
      setNewResetPassword('');
    } catch (err: any) {
      setResetError(err?.message || 'Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setDeleteLoading(true);
    try {
      await adminApi.deleteUser(deleteTargetUser.id);
      showToast('success', `User "${deleteTargetUser.username}" deactivated.`);
      setDeleteTargetUser(null);
      fetchUsers();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete user');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = (u.full_name || '').toLowerCase().includes(q);
    const usernameMatch = u.username.toLowerCase().includes(q);
    const emailMatch = (u.email || '').toLowerCase().includes(q);
    return nameMatch || usernameMatch || emailMatch;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'agronomist':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold">
          {toast.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          )}
          <span className={toast.type === 'success' ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}>
            {toast.message}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-300" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('admin.manageUsers', 'Manage Users')}
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Administer system user profiles, role assignments, and authentication credentials.
          </p>
        </div>

        <button
          type="button"
          id="btn-add-agronomist"
          onClick={() => {
            setAddError(null);
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs text-white bg-emerald-800 hover:bg-emerald-900 shadow-sm transition"
        >
          <UserPlus className="w-4 h-4 text-emerald-300" />
          <span>{t('admin.addAgronomist', 'Add Agronomist')}</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, username, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Roles' },
            { id: 'farmer', label: 'Farmers' },
            { id: 'agronomist', label: 'Agronomists' },
            { id: 'admin', label: 'Admins' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                roleFilter === tab.id
                  ? 'bg-emerald-800 text-white shadow-sm font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-750'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">User</th>
                <th className="px-4 py-3.5">Username</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Language</th>
                <th className="px-4 py-3.5">Created</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading user accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isAdminRow = u.role === 'admin';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {u.full_name || u.username}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {u.email || u.phone || 'No contact details'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {u.username}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getRoleBadge(u.role)}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 uppercase font-medium text-[11px]">
                        {u.language || 'en'}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-400 whitespace-nowrap">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Reset password"
                            onClick={() => {
                              setResetError(null);
                              setNewResetPassword('');
                              setResetTargetUser(u);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          </button>

                          {!isAdminRow && (
                            <button
                              type="button"
                              title="Deactivate user"
                              onClick={() => setDeleteTargetUser(u)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD AGRONOMIST */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('admin.addAgronomist', 'Add Agronomist')}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Create a new expert specialist account with review queue access.
                </p>
              </div>
            </div>

            {addError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {addError}
              </div>
            )}

            <form onSubmit={handleCreateAgronomist} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="agronomist-fullname">
                  Full Name *
                </label>
                <input
                  id="agronomist-fullname"
                  type="text"
                  required
                  placeholder="e.g. Dr. Sarah Chen"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="agronomist-username">
                  Username *
                </label>
                <input
                  id="agronomist-username"
                  type="text"
                  required
                  placeholder="3-20 characters: letters, digits, _, ."
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="agronomist-password">
                  Initial Password *
                </label>
                <input
                  id="agronomist-password"
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="agronomist-email">
                    Contact Email (optional)
                  </label>
                  <input
                    id="agronomist-email"
                    type="email"
                    placeholder="schen@extension.edu"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="agronomist-phone">
                    Phone (optional)
                  </label>
                  <input
                    id="agronomist-phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 rounded-xl font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 py-2 rounded-xl font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 transition"
                >
                  {addLoading ? 'Creating...' : 'Create Agronomist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RESET PASSWORD */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setResetTargetUser(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Reset Password
                </h3>
                <p className="text-[11px] text-slate-400">
                  User: <strong className="text-slate-700 dark:text-slate-300">{resetTargetUser.username}</strong>
                </p>
              </div>
            </div>

            {resetError && (
              <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1" htmlFor="admin-new-password">
                  New Password
                </label>
                <input
                  id="admin-new-password"
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="flex-1 py-2 rounded-xl font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 py-2 rounded-xl font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 transition"
                >
                  {resetLoading ? 'Resetting...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRM DIALOG */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>

            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Deactivate User "{deleteTargetUser.username}"?
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              This will remove the user from Firebase and soft-delete their database profile. Existing cases and agronomic reviews created by this user will remain intact.
            </p>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDeleteTargetUser(null)}
                className="flex-1 py-2 rounded-xl font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="flex-1 py-2 rounded-xl font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 transition text-xs"
              >
                {deleteLoading ? 'Deactivating...' : 'Confirm Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
