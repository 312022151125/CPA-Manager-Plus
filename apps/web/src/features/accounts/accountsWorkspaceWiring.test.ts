import { describe, expect, it } from 'vitest';
import routesSource from '@/router/MainRoutes.tsx?raw';
import layoutSource from '@/components/layout/MainLayout.tsx?raw';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

describe('accounts workspace wiring', () => {
  it('uses Accounts as the single credential-management sidebar entry', () => {
    expect(layoutSource).toContain("path: '/accounts'");
    expect(layoutSource).toContain("label: t('nav.accounts'");
    expect(layoutSource).not.toContain("path: '/auth-files',\n        label: t('nav.auth_files')");
    expect(layoutSource).not.toContain("path: '/quota',\n        label: t('nav.quota_management')");
  });

  it('redirects legacy credential, quota and OAuth editor routes into Accounts', () => {
    expect(routesSource).toContain("path: '/auth-files', element: <LegacyAccountsRedirect />");
    expect(routesSource).toContain('<LegacyAccountsRedirect view="accounts" />');
    expect(routesSource).not.toContain('<LegacyAccountsRedirect view="quota" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="oauth" editor="excluded" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="oauth" editor="alias" />');
    expect(routesSource).toContain("{ path: '/oauth', element: <OAuthPage /> }");
  });

  it.each([
    [en, 'Credential Management', 'Credential List'],
    [ru, 'Управление учётными данными', 'Список учётных данных'],
    [zhCN, '凭证管理', '凭证列表'],
    [zhTW, '憑證管理', '憑證清單'],
  ])('uses credential terminology and omits removed workspace copy', (locale, title, list) => {
    expect(locale.nav.accounts).toBe(title);
    expect(locale.accounts.title).toBe(title);
    expect(locale.accounts.tab_accounts).toBe(list);
    expect(locale.accounts).not.toHaveProperty('tab_quota');
    expect(locale.accounts).not.toHaveProperty('tab_value');
    expect(locale.accounts).not.toHaveProperty('legacy_quota_entry');
  });
});
