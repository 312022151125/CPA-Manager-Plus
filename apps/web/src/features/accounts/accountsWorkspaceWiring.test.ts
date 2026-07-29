import { describe, expect, it } from 'vitest';
import routesSource from '@/router/MainRoutes.tsx?raw';
import layoutSource from '@/components/layout/MainLayout.tsx?raw';
import accountsPageSource from '@/features/accounts/AccountsPage.tsx?raw';
import localStatusPanelSource from '@/features/monitoring/components/CodexInspectionStatusPanel.tsx?raw';
import serverInspectionPageSource from '@/features/monitoring/ServerCodexInspectionPage.tsx?raw';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

const legacyPagesRoot = ['@', 'pages'].join('/');

describe('accounts workspace wiring', () => {
  it('uses Accounts as the single credential-management sidebar entry', () => {
    expect(layoutSource).toContain("path: '/accounts'");
    expect(layoutSource).toContain("label: t('nav.accounts'");
    expect(layoutSource).not.toContain("path: '/auth-files',\n        label: t('nav.auth_files')");
    expect(layoutSource).not.toContain("path: '/quota',\n        label: t('nav.quota_management')");
    expect(layoutSource).not.toContain("path: '/codex-inspection'");
    expect(layoutSource).not.toContain("label: t('nav.codex_inspection')");
  });

  it('redirects legacy credential, quota, inspection and OAuth editor routes into Accounts', () => {
    expect(routesSource).toContain("path: '/auth-files', element: <LegacyAccountsRedirect />");
    expect(routesSource).toContain('<LegacyAccountsRedirect view="accounts" />');
    expect(routesSource).not.toContain('<LegacyAccountsRedirect view="quota" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="oauth" editor="excluded" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="oauth" editor="alias" />');
    expect(routesSource).toContain("{ path: '/oauth', element: <OAuthPage /> }");
    expect(routesSource).toContain('<LegacyAccountsRedirect view="health" healthMode="local" />');
    expect(routesSource).toContain('<LegacyAccountsRedirect view="health" healthMode="server" />');
    expect(routesSource).not.toContain(`${legacyPagesRoot}/CodexInspectionPage`);
    expect(routesSource).not.toContain(`${legacyPagesRoot}/ServerCodexInspectionPage`);
  });

  it('embeds credential health as an Accounts tab and isolates mode controls from actions', () => {
    expect(accountsPageSource).toContain(
      "import { CredentialHealthInspectionWorkspace } from '@/features/monitoring/components/CredentialHealthInspectionWorkspace';"
    );
    expect(accountsPageSource).toContain("id: 'health'");
    expect(accountsPageSource).toContain('<CredentialHealthInspectionWorkspace');
    expect(accountsPageSource).not.toContain("id: 'inspection'");
    expect(localStatusPanelSource).toContain(
      '<div className={styles.statusModeRow}>{modeControl}</div>'
    );
    expect(serverInspectionPageSource).toContain(
      '<div className={styles.statusModeRow}>{modeControl}</div>'
    );
    expect(localStatusPanelSource).not.toContain(
      '<div className={styles.statusActions}>\n            {modeControl}'
    );
    expect(serverInspectionPageSource).not.toContain(
      '<div className={styles.statusActions}>\n            {modeControl}'
    );
  });

  it('separates credential list filters from the workspace navigation', () => {
    expect(accountsPageSource).toContain(
      '<section className={styles.controlsFilterPanel}>{renderToolbar()}</section>'
    );
    expect(accountsPageSource).not.toContain('controlsFilterSection');
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
    expect(locale.accounts.tab_health).toBeTypeOf('string');
    expect(locale.accounts.metric_attention).toBeTypeOf('string');
    expect(locale.accounts.metric_quota_risk).toBeTypeOf('string');
    expect(locale.accounts.metric_unconfirmed).toBeTypeOf('string');
    expect(locale.accounts).not.toHaveProperty('tab_inspection');
    expect(locale.accounts).not.toHaveProperty('tab_quota');
    expect(locale.accounts).not.toHaveProperty('tab_value');
    expect(locale.accounts).not.toHaveProperty('metric_low');
    expect(locale.accounts).not.toHaveProperty('metric_value');
    expect(locale.accounts).not.toHaveProperty('legacy_quota_entry');
    expect(locale.nav).not.toHaveProperty('codex_inspection');
    expect(locale.nav).not.toHaveProperty('codex_inspection_short');
    expect(locale.nav).not.toHaveProperty('server_codex_inspection');
  });

  it.each([
    [en, 'Health Inspection'],
    [ru, 'Проверка состояния'],
    [zhCN, '健康巡检'],
    [zhTW, '健康巡檢'],
  ])('localizes the health inspection tab', (locale, expectedLabel) => {
    expect(locale.accounts.tab_health).toBe(expectedLabel);
  });

  it.each([
    [
      en,
      [
        'Credential / Account',
        'Availability',
        'Recent Requests',
        'Historical Usage',
        'Quota Details',
        'Actions',
      ],
    ],
    [
      ru,
      [
        'Учётные данные / аккаунт',
        'Доступность',
        'Последние запросы',
        'История использования',
        'Сведения о квоте',
        'Действия',
      ],
    ],
    [zhCN, ['凭证/账号', '可用状态', '最近请求', '历史用量', '额度信息', '操作']],
    [zhTW, ['憑證/帳號', '可用狀態', '最近請求', '歷史用量', '額度資訊', '操作']],
  ])('localizes the six credential list headers', (locale, expectedHeaders) => {
    expect([
      locale.accounts.list_header_credential,
      locale.accounts.list_header_availability,
      locale.accounts.list_header_recent_requests,
      locale.accounts.list_header_historical_usage,
      locale.accounts.list_header_quota,
      locale.accounts.list_header_actions,
    ]).toEqual(expectedHeaders);
  });
});
