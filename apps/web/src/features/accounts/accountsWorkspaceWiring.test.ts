import { describe, expect, it } from 'vitest';
import routesSource from '@/router/MainRoutes.tsx?raw';
import layoutSource from '@/components/layout/MainLayout.tsx?raw';

describe('accounts workspace wiring', () => {
  it('uses Accounts as the single credential and quota sidebar entry', () => {
    expect(layoutSource).toContain("path: '/accounts'");
    expect(layoutSource).toContain("label: t('nav.accounts'");
    expect(layoutSource).not.toContain("path: '/auth-files',\n        label: t('nav.auth_files')");
    expect(layoutSource).not.toContain("path: '/quota',\n        label: t('nav.quota_management')");
  });

  it('redirects legacy credential, quota and OAuth editor routes into Accounts', () => {
    expect(routesSource).toContain("path: '/auth-files', element: <LegacyAccountsRedirect />");
    expect(routesSource).toContain('<LegacyAccountsRedirect view="quota" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="oauth" editor="excluded" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="oauth" editor="alias" />');
    expect(routesSource).toContain("{ path: '/oauth', element: <OAuthPage /> }");
  });
});
