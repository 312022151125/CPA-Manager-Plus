/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AuthSessionMode,
  AuthState,
  LoginCredentials,
  LoginResult,
  RestoreSessionResult,
  ConnectionStatus,
} from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { usageServiceApi } from '@/services/api/usageService';
import { useConfigStore } from './useConfigStore';
import { useModelsStore } from './useModelsStore';
import { useQuotaStore } from './useQuotaStore';
import { useUsageServiceStore } from './useUsageServiceStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { sha256Hex } from '@/utils/apiKeyHash';
import { getObfuscationVersion } from '@/utils/encryption';

interface AuthStoreState extends AuthState {
  sessionMode: AuthSessionMode | '';
  sessionPanelBase: string;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: (options?: RestoreSessionOptions) => Promise<RestoreSessionResult>;
  updateServerVersion: (
    version: string | null,
    buildDate?: string | null,
    commit?: string | null
  ) => void;
  updateServerPluginSupport: (supportsPlugin: boolean) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

interface RestoreSessionOptions {
  expectedMode?: AuthSessionMode;
  expectedPanelBase?: string;
}

let restoreSessionPromise: Promise<RestoreSessionResult> | null = null;

const LEGACY_AUTH_KEYS = ['apiBase', 'apiUrl', 'managementKey'] as const;

/**
 * 认证持久化写门控：当存在未经验证的 v1 混淆数据时，延迟/阻止写入 localStorage，
 * 防止因 User-Agent 变动导致错误解密出的 credential 被提前覆写固化为 v2。
 */
let deferAuthPersistence = false;

function isV1StoredValue(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    return getObfuscationVersion(raw || '') === 'v1';
  } catch {
    return false;
  }
}

function hasPendingV1AuthStorage(): boolean {
  if (isV1StoredValue(STORAGE_KEY_AUTH)) {
    return true;
  }
  return LEGACY_AUTH_KEYS.some((key) => isV1StoredValue(key));
}

function clearLegacyAuthKeys(): void {
  LEGACY_AUTH_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage access errors
    }
  });
}

const sessionMatchesExpectedRuntime = ({
  expectedMode,
  expectedPanelBase,
  resolvedBase,
  sessionMode,
}: {
  expectedMode?: AuthSessionMode;
  expectedPanelBase?: string;
  resolvedBase: string;
  sessionMode: AuthSessionMode | '';
}) => {
  const normalizedExpectedPanelBase = normalizeApiBase(expectedPanelBase || '');
  if (!expectedMode) return true;
  if (sessionMode && sessionMode !== expectedMode) return false;
  if (expectedMode === 'manager_embedded' && normalizedExpectedPanelBase) {
    return resolvedBase === normalizedExpectedPanelBase;
  }
  if (expectedMode === 'external_panel' && normalizedExpectedPanelBase) {
    return resolvedBase === normalizedExpectedPanelBase;
  }
  return true;
};

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      rememberPassword: false,
      serverVersion: null,
      serverCommit: null,
      serverBuildDate: null,
      supportsPlugin: false,
      sessionMode: '',
      sessionPanelBase: '',
      connectionStatus: 'disconnected',
      connectionError: null,

      // 恢复会话并自动登录
      restoreSession: (options) => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          if (hasPendingV1AuthStorage()) {
            deferAuthPersistence = true;
          }

          obfuscatedStorage.migratePlaintextKeys(['apiBase', 'apiUrl', 'managementKey']);

          const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
          const legacyBase =
            obfuscatedStorage.getItem<string>('apiBase') ||
            obfuscatedStorage.getItem<string>('apiUrl', { encrypt: true });
          const legacyKey = obfuscatedStorage.getItem<string>('managementKey');

          const { apiBase, managementKey, rememberPassword, sessionMode } = get();
          const resolvedBase = normalizeApiBase(
            apiBase || legacyBase || detectApiBaseFromLocation()
          );
          const resolvedKey = managementKey || legacyKey || '';
          const resolvedRememberPassword =
            rememberPassword || Boolean(managementKey) || Boolean(legacyKey);

          if (
            !sessionMatchesExpectedRuntime({
              expectedMode: options?.expectedMode,
              expectedPanelBase: options?.expectedPanelBase,
              resolvedBase,
              sessionMode,
            })
          ) {
            const fallbackBase = normalizeApiBase(
              options?.expectedPanelBase || detectApiBaseFromLocation()
            );
            set({
              apiBase: fallbackBase,
              managementKey: '',
              rememberPassword: false,
              sessionMode: options?.expectedMode ?? '',
              sessionPanelBase: normalizeApiBase(options?.expectedPanelBase || ''),
            });
            apiClient.setConfig({ apiBase: fallbackBase, managementKey: '' });
            localStorage.removeItem('isLoggedIn');
            return false;
          }

          set({
            apiBase: resolvedBase,
            managementKey: resolvedKey,
            rememberPassword: resolvedRememberPassword,
            sessionMode: options?.expectedMode ?? sessionMode,
            sessionPanelBase: normalizeApiBase(
              options?.expectedPanelBase || get().sessionPanelBase
            ),
          });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: resolvedKey });

          if (wasLoggedIn && resolvedBase && resolvedKey) {
            try {
              const restoredSessionMode = options?.expectedMode ?? (sessionMode || undefined);
              const result = await get().login({
                apiBase: resolvedBase,
                managementKey: resolvedKey,
                rememberPassword: resolvedRememberPassword,
                sessionMode: restoredSessionMode,
                sessionPanelBase: options?.expectedPanelBase || get().sessionPanelBase,
              });
              return result.recoveryMode ? result : {};
            } catch (error) {
              console.warn('Auto login failed:', error);

              const status =
                error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number'
                  ? (error as { status: number }).status
                  : error && typeof error === 'object' && 'statusCode' in error && typeof (error as { statusCode: unknown }).statusCode === 'number'
                    ? (error as { statusCode: number }).statusCode
                    : undefined;

              if (status === 401) {
                deferAuthPersistence = false;
                clearLegacyAuthKeys();
                try {
                  localStorage.removeItem('isLoggedIn');
                } catch {
                  // ignore
                }
                set({
                  isAuthenticated: false,
                  managementKey: '',
                  rememberPassword: false,
                  connectionStatus: 'disconnected',
                });
              }

              return false;
            }
          }

          return false;
        })();

        return restoreSessionPromise;
      },

      // 登录
      login: async (credentials) => {
        const apiBase = normalizeApiBase(credentials.apiBase);
        const managementKey = credentials.managementKey.trim();
        const rememberPassword = credentials.rememberPassword ?? get().rememberPassword ?? false;
        const sessionMode = credentials.sessionMode ?? get().sessionMode;
        const sessionPanelBase = normalizeApiBase(
          credentials.sessionPanelBase || get().sessionPanelBase
        );
        const quotaCacheScope = sha256Hex(`${apiBase}\u0000${managementKey}`);

        const markAuthenticated = (result: LoginResult = {}) => {
          deferAuthPersistence = false;
          clearLegacyAuthKeys();

          useQuotaStore.getState().activateQuotaCacheScope(quotaCacheScope);
          apiClient.setConfig({ apiBase, managementKey });
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            rememberPassword,
            sessionMode,
            sessionPanelBase,
            connectionStatus: 'connected',
            connectionError: null,
          });
          if (rememberPassword) {
            localStorage.setItem('isLoggedIn', 'true');
          } else {
            localStorage.removeItem('isLoggedIn');
          }
          return result;
        };

        try {
          set({
            connectionStatus: 'connecting',
            supportsPlugin: false,
            serverVersion: null,
            serverCommit: null,
            serverBuildDate: null,
          });
          useModelsStore.getState().clearCache();

          // 配置 API 客户端
          apiClient.setConfig({
            apiBase,
            managementKey,
          });

          // 测试连接 - 获取配置
          try {
            await useConfigStore.getState().fetchConfig(undefined, true);
          } catch (error) {
            if (sessionMode !== 'manager_embedded') {
              throw error;
            }
            await usageServiceApi.getManagerConfig(apiBase, managementKey);
            useConfigStore.getState().clearCache();
            useUsageServiceStore.getState().setUsageServiceConfig(
              {
                enabled: true,
                serviceBase: apiBase,
              },
              {
                panelBase: sessionPanelBase || apiBase,
                panelHostMode: 'manager_embedded',
              }
            );
            return markAuthenticated({ recoveryMode: 'manager_config' });
          }

          // 登录成功
          return markAuthenticated();
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Connection failed';
          set({
            connectionStatus: 'error',
            connectionError: message || 'Connection failed',
            supportsPlugin: false,
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        deferAuthPersistence = false;
        clearLegacyAuthKeys();
        restoreSessionPromise = null;
        useConfigStore.getState().clearCache();
        useModelsStore.getState().clearCache();
        useQuotaStore.getState().clearQuotaCache();
        useUsageServiceStore.getState().clearUsageServiceConfig();
        apiClient.setConfig({ apiBase: '', managementKey: '' });
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          serverVersion: null,
          serverCommit: null,
          serverBuildDate: null,
          supportsPlugin: false,
          sessionMode: '',
          sessionPanelBase: '',
          connectionStatus: 'disconnected',
          connectionError: null,
        });
        localStorage.removeItem('isLoggedIn');
      },

      // 检查认证状态
      checkAuth: async () => {
        const { managementKey, apiBase } = get();

        if (!managementKey || !apiBase) {
          return false;
        }

        try {
          // 重新配置客户端
          apiClient.setConfig({ apiBase, managementKey });
          set({
            supportsPlugin: false,
            serverVersion: null,
            serverCommit: null,
            serverBuildDate: null,
          });

          // 验证连接
          await useConfigStore.getState().fetchConfig();

          set({
            isAuthenticated: true,
            connectionStatus: 'connected',
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error',
            supportsPlugin: false,
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate, commit) => {
        set({
          serverVersion: version || null,
          serverCommit: commit || null,
          serverBuildDate: buildDate || null,
        });
      },

      updateServerPluginSupport: (supportsPlugin) => {
        set({ supportsPlugin });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error,
        });
      },
    }),
    {
      name: STORAGE_KEY_AUTH,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          if (isV1StoredValue(name)) {
            deferAuthPersistence = true;
          }
          const data = obfuscatedStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          if (deferAuthPersistence) {
            return;
          }
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          obfuscatedStorage.removeItem(name);
        },
      })),
      partialize: (state) => ({
        apiBase: state.apiBase,
        ...(state.rememberPassword ? { managementKey: state.managementKey } : {}),
        rememberPassword: state.rememberPassword,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate,
        sessionMode: state.sessionMode,
        sessionPanelBase: state.sessionPanelBase,
      }),
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('unauthorized', () => {
    // pending v1 credential verification 期间，
    // 中间请求的 401 不一定代表当前 remembered credential 无效，
    // 尤其 manager_embedded 场景可能是保存的 CPA Management Key 失效；
    // 此时由 restoreSession / login 错误捕获流程最终裁决认证结果，避免提前 logout 导致写门控过早解除。
    if (deferAuthPersistence) {
      return;
    }

    useAuthStore.getState().logout();
  });

  window.addEventListener('server-version-update', ((e: CustomEvent) => {
    const detail = e.detail || {};
    useAuthStore
      .getState()
      .updateServerVersion(detail.version || null, detail.buildDate || null, detail.commit || null);
  }) as EventListener);

  window.addEventListener('server-plugin-support-update', ((e: CustomEvent) => {
    useAuthStore.getState().updateServerPluginSupport(e.detail?.supportsPlugin === true);
  }) as EventListener);
}
