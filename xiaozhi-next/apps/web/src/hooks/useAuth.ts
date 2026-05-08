'use client';

import { create } from 'zustand';
import { ofetch } from 'ofetch';

// ───── 用户类型 ─────
export interface User {
  id: string;
  username: string;
  realName?: string;
  email?: string;
  mobile?: string;
  superAdmin: number;
  headUrl?: string;
}

// ───── Zustand Store ─────
interface AuthState {
  /** JWT Token */
  token: string | null;
  /** 当前用户 */
  user: User | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 设置 token */
  setToken: (token: string | null) => void;
  /** 设置用户 */
  setUser: (user: User | null) => void;
  /** 登出 */
  logout: () => void;
  /** 检查认证状态 */
  checkAuth: () => Promise<void>;
}

const getToken = () => {
  if (typeof window !== 'undefined') return localStorage.getItem('token');
  return null;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  user: null,
  loading: true,

  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
    set({ token });
  },

  setUser: (user) => set({ user }),

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const token = getToken();
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const res = await ofetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.code === 0) {
        set({ user: res.data, loading: false });
      } else {
        localStorage.removeItem('token');
        set({ token: null, loading: false });
      }
    } catch {
      set({ user: null, loading: false });
    }
  },
}));

/** 便捷 Hook */
export function useAuth() {
  return useAuthStore();
}
