import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle, Ban, Briefcase, Calculator, Check, GraduationCap, KeyRound, Loader2, Plus, RefreshCw, Search, Shield, Trash2, UserCog, UserPlus, Users, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, type UserProfile, type UserRole } from '@/lib/auth';
import { PasswordField } from '@/components/PasswordField';
import { ResetPasswordModal, ResetUsernameModal } from '@/components/AdminPanel';
import {
  generatePassword,
  provisionPortalAccount,
  usernameFromMobile,
} from '@/lib/portalAccounts';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  parent: 'Parent',
  office_assistant: 'Office Assistant',
  accountant: 'Accountant',
  student: 'Student',
};

// Only roles that belong to the school's own workforce appear on this screen.
// Parents and students are managed through their own records.
const STAFF_ROLES: UserRole[] = ['teacher', 'office_assistant', 'accountant', 'admin'];

export function StaffManagement({ onToast }: { onToast: (message: string) => void }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [usernameTarget, setUsernameTarget] = useState<UserProfile | null>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, role, status, created_at')
      .in('role', STAFF_ROLES)
      .order('full_name');
    if (!error && data) setUsers(data as UserProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadStaff(); }, [loadStaff]);

  const filtered = users.filter((user) => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    return `${user.full_name} ${user.username} ${ROLE_LABELS[user.role]}`.toLowerCase().includes(search.toLowerCase());
  });

  const toggleSuspend = async (user: UserProfile) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    const { error } = await supabase.rpc('admin_set_account_status', { p_user_id: user.id, p_status: newStatus });
    if (error) {
      onToast(
        error.message === 'You cannot suspend your own account'
          ? 'You cannot suspend your own account.'
          : error.message === 'The last administrator account cannot be suspended'
            ? 'The last administrator account cannot be suspended.'
            : 'Could not update account status.',
      );
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u)));
    onToast(`${user.full_name} has been ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`);
  };

  const removeStaff = async (user: UserProfile) => {
    const { error } = await supabase.rpc('admin_remove_user', { p_user_id: user.id });
    if (error) { onToast(error.message || 'Could not remove this account.'); return; }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    onToast(`${user.full_name}'s account was removed.`);
  };

  const countOf = (role: UserRole) => users.filter((user) => user.role === role).length;

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div>
          <span className="eyebrow">Administration</span>
          <h2>Staff management</h2>
          <p>Create and manage the logins for your teachers, office assistants and accountants. Teachers sign in with their mobile number.</p>
        </div>
        <div className="admin-header-actions">
          <button className="primary-button" onClick={() => setShowCreate(true)}>
            <UserPlus size={17} /> Add staff member
          </button>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stat"><Briefcase size={20} /><strong>{users.length}</strong><span>Total staff</span></div>
        <div className="admin-stat admin-stat-teacher"><GraduationCap size={20} /><strong>{countOf('teacher')}</strong><span>Teachers</span></div>
        <div className="admin-stat admin-stat-assistant"><Users size={20} /><strong>{countOf('office_assistant')}</strong><span>Office Assistants</span></div>
        <div className="admin-stat admin-stat-accountant"><Calculator size={20} /><strong>{countOf('accountant')}</strong><span>Accountants</span></div>
        <div className="admin-stat admin-stat-admin"><Shield size={20} /><strong>{countOf('admin')}</strong><span>Administrators</span></div>
        <div className="admin-stat admin-stat-suspended"><Ban size={20} /><strong>{users.filter((u) => u.status === 'suspended').length}</strong><span>Suspended</span></div>
      </div>

      <div className="panel roster-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username or role" />
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
            >
              <option value="all">All roles</option>
              {STAFF_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
            <span className="result-count">{filtered.length} staff</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="table-student">
                      <div className="student-avatar">{user.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
                      <strong>{user.full_name}</strong>
                    </div>
                  </td>
                  <td className="muted-cell">{user.username}</td>
                  <td><span className={`role-badge role-${user.role}`}>{ROLE_LABELS[user.role]}</span></td>
                  <td>
                    <span className={`status-pill ${user.status === 'suspended' ? 'status-suspended' : ''}`}>
                      {user.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      {user.id !== profile?.id && (
                        <>
                          <button className="row-action-btn" onClick={() => setResetTarget(user)} title="Set a new password">
                            <KeyRound size={15} />
                          </button>
                          <button className="row-action-btn" onClick={() => setUsernameTarget(user)} title="Change the username">
                            <UserCog size={15} />
                          </button>
                          <button
                            className="row-action-btn"
                            onClick={() => void toggleSuspend(user)}
                            title={user.status === 'active' ? 'Suspend' : 'Reactivate'}
                          >
                            {user.status === 'active' ? <Ban size={15} /> : <Check size={15} />}
                          </button>
                          <button className="row-action-btn row-action-danger" onClick={() => void removeStaff(user)} title="Remove account">
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                      {user.id === profile?.id && (
                        <span className="muted-cell">Your account</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state large">
              {loading ? 'Loading staff…' : 'No staff members match your search.'}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <AddStaffModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void loadStaff(); }}
          onToast={onToast}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} onToast={onToast} />
      )}
      {usernameTarget && (
        <ResetUsernameModal
          user={usernameTarget}
          onClose={() => setUsernameTarget(null)}
          onSaved={() => { setUsernameTarget(null); void loadStaff(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

const STAFF_CREATE_ROLES: UserRole[] = ['teacher', 'office_assistant', 'accountant', 'admin'];

function AddStaffModal({ onClose, onCreated, onToast }: {
  onClose: () => void;
  onCreated: () => void;
  onToast: (message: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [mobile, setMobile] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Teachers are signed in by their mobile number, so the username is derived from it.
  const usesMobile = role === 'teacher';
  const effectiveUsername = usesMobile && mobile ? usernameFromMobile(mobile) : username;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (fullName.trim().length < 2) { setError('Please enter the full name.'); return; }
    if (effectiveUsername.trim().length < 3) {
      setError(usesMobile ? 'Enter a mobile number with at least 3 digits.' : 'Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true);

    const { error: createError } = await provisionPortalAccount({
      username: effectiveUsername.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      role,
      studentId: null,
      mobile: usesMobile ? mobile.trim() : null,
    });

    if (createError) { setError(createError); setBusy(false); return; }

    onToast(`${fullName.trim()} was added. Share the sign-in details with them.`);
    onCreated();
  };

  return (
    <div className="notice-overlay" onClick={onClose}>
      <section className="notice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notice-preview-top">
          <span className="eyebrow"><UserPlus size={14} /> New staff member</span>
          <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <h2 className="mt-3 text-lg font-bold text-slate-800">Add a staff member</h2>
        <p className="mt-1 text-sm text-slate-500">They sign in with the username and password below.</p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <label className="control-field">Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Enter full name" />
          </label>

          <label className="control-field">Role
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {STAFF_CREATE_ROLES.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
            </select>
          </label>

          {usesMobile ? (
            <label className="control-field">Mobile number (used as the username)
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. 03001234567" inputMode="tel" />
            </label>
          ) : null}

          <label className="control-field">
            {usesMobile ? 'Username (from mobile number)' : 'Username'}
            <input
              value={effectiveUsername}
              onChange={(e) => setUsername(e.target.value)}
              required
              readOnly={usesMobile && Boolean(mobile)}
              placeholder="e.g. office.assistant"
            />
          </label>

          <label className="control-field">Password
            <PasswordField value={password} onChange={setPassword} autoComplete="off" />
          </label>

          <button type="button" className="secondary-button self-start" onClick={() => setPassword(generatePassword())}>
            <RefreshCw size={15} /> Generate a password
          </button>

          {error && <div className="auth-error"><AlertCircle size={16} /><span>{error}</span></div>}

          <div className="notice-preview-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? <Loader2 size={16} className="auth-spinner" /> : <Plus size={16} />} Add staff member
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
