import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { moonFetch } from '../utils/moonApi';

/** The roles the Super Admin can give an account. "manuscripts" opens the manuscripts catalogue (/manuscripts/). */
export type AccountRole = 'tester' | 'cataloger' | 'reviewer' | 'manuscripts';

export interface AuthUser {
  username: string;
  email: string;
  institution: string;
  role: 'admin' | AccountRole;
  status: 'pending' | 'approved' | 'rejected';
  registeredAt: string;
  approvedAt?: string;
  reviewedBy?: string;
  /** Only in the Super Admin's account list: when this user was last active, and whether that was in the last 2 minutes. */
  lastSeenAt?: string | null;
  online?: boolean;
}

export interface LoginResult {
  success: boolean;
  message?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'unknown';
}

export interface SignupData {
  username: string;
  email: string;
  institution: string;
  password: string;
  inviteCode?: string;
}

export interface SignupResult {
  success: boolean;
  message?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface AdminActionResult {
  success: boolean;
  message?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  /** May approve, return and comment on others' records: the Super Admin and reviewers. */
  canReview: boolean;
  /** May open the manuscripts catalogue: the Super Admin and accounts with the Manuscripts role. */
  canSeeManuscripts: boolean;
  username: string | null;
  user: AuthUser | null;
  accessToken: string | null;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  signup: (data: SignupData | string, legacyPassword?: string) => Promise<SignupResult>;
  logout: () => void;
  // Approval Management (Super Admin only; all data lives on the server)
  users: AuthUser[];
  usersLoading: boolean;
  usersError: string | null;
  getUsers: () => AuthUser[];
  refreshUsers: () => Promise<AuthUser[]>;
  unlockAdmin: (password: string) => Promise<AdminActionResult>;
  approveUser: (usernameOrEmail: string) => Promise<AdminActionResult>;
  rejectUser: (usernameOrEmail: string) => Promise<AdminActionResult>;
  deleteUser: (usernameOrEmail: string) => Promise<AdminActionResult>;
  setUserRole: (username: string, role: AccountRole) => Promise<AdminActionResult>;
  /** A server call as the Super Admin (signed in, or unlocked on the login screen); used for invite codes. */
  adminFetch: (path: string, body?: unknown) => Promise<{ ok: boolean; status: number; data: any }>;
  pendingCount: number;
}

const STORAGE_AUTH_KEY = 'moon_auth';
// Legacy per-browser account list (stored plaintext passwords). No longer used.
const LEGACY_USERS_KEY = 'moon_registered_users';
const SUPER_ADMIN_USERNAME = 'isaac';
const PENDING_POLL_MS = 30_000;

const NETWORK_ERROR =
  'Could not reach the Moon server. Please check your connection and try again.';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface StoredSession {
  username: string;
  email: string;
  institution: string;
  role: AuthUser['role'];
  accessToken: string;
  sessionToken: string;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Sessions from before server-side auth have no sessionToken and can't be trusted.
    if (parsed?.username && typeof parsed.sessionToken === 'string') return parsed;
  } catch {}
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  // Admin token from the login-screen approval panel (isaac not signed into the app).
  const unlockedAdminToken = useRef<string | null>(null);

  const isSuperAdmin = user?.role === 'admin' && user.username.toLowerCase() === SUPER_ADMIN_USERNAME;

  const applySession = useCallback((sessionUser: AuthUser, token: string) => {
    setIsAuthenticated(true);
    setUsername(sessionUser.username);
    setUser(sessionUser);
    setAccessToken(token);
    try {
      const stored: StoredSession = {
        username: sessionUser.username,
        email: sessionUser.email,
        institution: sessionUser.institution,
        role: sessionUser.role,
        accessToken: token,
        sessionToken: token,
      };
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(stored));
    } catch (e) {
      console.error('Session persist error:', e);
    }
  }, []);

  const clearSession = useCallback(() => {
    setIsAuthenticated(false);
    setUsername(null);
    setUser(null);
    setAccessToken(null);
    setUsers([]);
    try {
      localStorage.removeItem(STORAGE_AUTH_KEY);
    } catch {}
  }, []);

  // Restore session and verify it with the server (catches rejected/deleted accounts).
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_USERS_KEY);
    } catch {}

    const stored = readStoredSession();
    if (!stored) {
      try {
        localStorage.removeItem(STORAGE_AUTH_KEY);
      } catch {}
      return;
    }

    applySession(
      {
        username: stored.username,
        email: stored.email,
        institution: stored.institution,
        role: stored.role,
        status: 'approved',
        registeredAt: '',
      },
      stored.sessionToken
    );

    moonFetch('/api/accounts/me', { sessionToken: stored.sessionToken })
      .then(({ ok, status, data }) => {
        if (ok && data?.success && data.user) {
          applySession(data.user, stored.sessionToken);
        } else if (status === 401) {
          // Session expired, or the account was rejected/deleted by the admin.
          clearSession();
        }
      })
      .catch(() => {
        // Offline: keep the cached session; server calls will re-check later.
      });
  }, [applySession, clearSession]);

  const adminToken = useCallback(
    () => (isSuperAdmin ? accessToken : null) || unlockedAdminToken.current,
    [isSuperAdmin, accessToken]
  );

  const refreshUsers = useCallback(async (): Promise<AuthUser[]> => {
    const token = adminToken();
    if (!token) return [];
    setUsersLoading(true);
    try {
      const { ok, data } = await moonFetch('/api/accounts', { sessionToken: token });
      if (ok && data?.success && Array.isArray(data.accounts)) {
        setUsers(data.accounts);
        setUsersError(null);
        return data.accounts;
      }
      setUsersError(data?.message || 'Could not load accounts from the server.');
    } catch {
      setUsersError(NETWORK_ERROR);
    } finally {
      setUsersLoading(false);
    }
    return [];
  }, [adminToken]);

  const getUsers = useCallback((): AuthUser[] => {
    refreshUsers();
    return users;
  }, [refreshUsers, users]);

  // Keep the Super Admin's pending-approval badge live.
  useEffect(() => {
    if (!isSuperAdmin) return;
    refreshUsers();
    const timer = window.setInterval(refreshUsers, PENDING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isSuperAdmin, refreshUsers]);

  const unlockAdmin = useCallback(
    async (password: string): Promise<AdminActionResult> => {
      try {
        const { data } = await moonFetch('/api/accounts/login', {
          body: { identifier: SUPER_ADMIN_USERNAME, password },
        });
        if (data?.success && data.token) {
          unlockedAdminToken.current = data.token;
          await refreshUsers();
          return { success: true };
        }
        return { success: false, message: data?.message || 'Invalid Super Admin password.' };
      } catch {
        return { success: false, message: NETWORK_ERROR };
      }
    },
    [refreshUsers]
  );

  const adminAction = useCallback(
    async (action: 'approve' | 'reject' | 'delete', target: string): Promise<AdminActionResult> => {
      const token = adminToken();
      if (!token) return { success: false, message: 'Only the Super Admin can do this.' };
      try {
        const { ok, data } = await moonFetch(`/api/accounts/${action}`, {
          body: { username: target.trim() },
          sessionToken: token,
        });
        if (ok && data?.success) {
          await refreshUsers();
          return { success: true };
        }
        return { success: false, message: data?.message || `Failed to ${action} account.` };
      } catch {
        return { success: false, message: NETWORK_ERROR };
      }
    },
    [adminToken, refreshUsers]
  );

  const setUserRole = useCallback(
    async (target: string, role: AccountRole): Promise<AdminActionResult> => {
      const token = adminToken();
      if (!token) return { success: false, message: 'Only the Super Admin can do this.' };
      try {
        const { ok, data } = await moonFetch('/api/accounts/role', { body: { username: target.trim(), role }, sessionToken: token });
        if (ok && data?.success) {
          await refreshUsers();
          return { success: true };
        }
        return { success: false, message: data?.message || 'Failed to change the role.' };
      } catch {
        return { success: false, message: NETWORK_ERROR };
      }
    },
    [adminToken, refreshUsers]
  );

  const adminFetch = useCallback(
    async (path: string, body?: unknown) => {
      const token = adminToken();
      if (!token) return { ok: false, status: 403, data: { success: false, message: 'Only the Super Admin can do this.' } };
      try {
        return await moonFetch(path, { ...(body !== undefined ? { body } : {}), sessionToken: token });
      } catch {
        return { ok: false, status: 0, data: { success: false, message: NETWORK_ERROR } };
      }
    },
    [adminToken]
  );

  const approveUser = useCallback((u: string) => adminAction('approve', u), [adminAction]);
  const rejectUser = useCallback((u: string) => adminAction('reject', u), [adminAction]);
  const deleteUser = useCallback(
    (u: string) =>
      u.trim().toLowerCase() === SUPER_ADMIN_USERNAME
        ? Promise.resolve({ success: false, message: 'The Super Admin account cannot be deleted.' })
        : adminAction('delete', u),
    [adminAction]
  );

  const pendingCount = users.filter((u) => u.status === 'pending').length;

  const login = async (identifier: string, inputPassword: string): Promise<LoginResult> => {
    try {
      const { data } = await moonFetch('/api/accounts/login', {
        body: { identifier: identifier.trim(), password: inputPassword },
      });
      if (data?.success && data.token && data.user) {
        applySession(data.user, data.token);
        const isAdmin = data.user.role === 'admin';
        return {
          success: true,
          status: 'approved',
          message: isAdmin
            ? 'Welcome Isaac Faleh (Super Administrator)!'
            : `Welcome ${data.user.username} from ${data.user.institution || 'Tester Group'}!`,
        };
      }
      return {
        success: false,
        status: data?.status || 'unknown',
        message:
          data?.message ||
          'Account not found or password incorrect. New testers can register under the "Request Access" tab.',
      };
    } catch {
      return { success: false, status: 'unknown', message: NETWORK_ERROR };
    }
  };

  const signup = async (
    dataOrUsername: SignupData | string,
    legacyPassword?: string
  ): Promise<SignupResult> => {
    const data: SignupData =
      typeof dataOrUsername === 'string'
        ? {
            username: dataOrUsername.trim(),
            email: `${dataOrUsername.trim()}@moon.local`,
            institution: 'Tester Institution',
            password: legacyPassword || '',
          }
        : dataOrUsername;

    const usernameVal = data.username.trim();
    const emailVal = data.email.trim();
    const institutionVal = data.institution.trim();

    if (!usernameVal) return { success: false, message: 'Username is required.' };
    if (!emailVal || !emailVal.includes('@')) return { success: false, message: 'A valid email address is required.' };
    if (!institutionVal) return { success: false, message: 'Institution or Organization is required.' };
    if (data.password.length < 8) return { success: false, message: 'Password must be at least 8 characters.' };

    try {
      const { data: res } = await moonFetch('/api/accounts/register', {
        body: {
          username: usernameVal,
          email: emailVal,
          institution: institutionVal,
          password: data.password,
          inviteCode: (data.inviteCode || '').trim(),
        },
      });
      if (!res?.success) {
        return { success: false, message: res?.message || 'Registration failed. Please try again.' };
      }
      if (res.status === 'approved' && res.token && res.user) {
        // New accounts are approved at once: sign straight in and open the dashboard.
        applySession(res.user, res.token);
        return {
          success: true,
          status: 'approved',
          message: `Welcome ${res.user.username} from ${res.user.institution || 'Tester Group'}!`,
        };
      }
      if (res.status === 'approved') {
        return {
          success: true,
          status: 'approved',
          message: 'Account approved with your invite code. You can sign in now.',
        };
      }
      return {
        success: true,
        status: 'pending',
        message: `Request received for ${usernameVal} (${institutionVal}). Your account is pending administrator approval (Isaac Faleh). Try signing in again once it has been approved.`,
      };
    } catch {
      return { success: false, message: NETWORK_ERROR };
    }
  };

  const logout = () => {
    const token = accessToken;
    if (token) {
      moonFetch('/api/accounts/logout', { body: {}, sessionToken: token }).catch(() => {});
    }
    unlockedAdminToken.current = null;
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isSuperAdmin,
        canReview: isSuperAdmin || user?.role === 'reviewer',
        canSeeManuscripts: isSuperAdmin || user?.role === 'manuscripts',
        username,
        user,
        accessToken,
        login,
        signup,
        logout,
        users,
        usersLoading,
        usersError,
        getUsers,
        refreshUsers,
        unlockAdmin,
        approveUser,
        rejectUser,
        deleteUser,
        setUserRole,
        adminFetch,
        pendingCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
