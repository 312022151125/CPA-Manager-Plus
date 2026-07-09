/**
 * QuotaWindowCard
 * 统一的"配额窗口卡片" — 在抽屉额度 Tab、概览 Tab、列表条目里复用同一个组件。
 *
 * 替代原本在 AccountsPage.tsx 中三处重复的"窗口 + 进度 + 用量"渲染块。
 */
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { AccountDetailQuotaWindow } from '@/features/accounts/model/accountDetailViewModel';
import { RelativeTime } from './RelativeTime';
import styles from './QuotaWindowCard.module.scss';

interface QuotaWindowCardProps {
  window: AccountDetailQuotaWindow;
  /** 渲染风格:抽屉用 drawer(更紧凑),列表用 compact(单行) */
  variant?: 'drawer' | 'compact';
  locale?: string;
}

const formatPercent = (value: number | null | undefined, digits = 0): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
};

const formatCompactNumber = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
  return `${(value / 1_000_000_000).toFixed(1)}B`;
};

const formatMoney = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `$${value.toFixed(2)}`;
};

const getBarTone = (remaining: number | null | undefined): string => {
  if (typeof remaining !== 'number') return styles.barUnknown ?? '';
  if (remaining <= 0) return styles.barCritical ?? '';
  if (remaining < 20) return styles.barWarning ?? '';
  if (remaining < 50) return styles.barCooldown ?? '';
  return styles.barOk ?? '';
};

export const QuotaWindowCard = ({
  window: q,
  variant = 'drawer',
  locale,
}: QuotaWindowCardProps): JSX.Element => {
  const { t, i18n } = useTranslation();
  const width = Math.max(0, Math.min(100, q.remainingPercent ?? 0));
  const usage = q.usage;
  const resetTimestamp =
    typeof q.resetAtMs === 'number' && Number.isFinite(q.resetAtMs) ? q.resetAtMs : null;
  const compactTitle = [q.groupLabel, q.label, q.amountLabel, q.description]
    .filter(Boolean)
    .join(' · ');

  if (variant === 'compact') {
    return (
      <div className={styles.compactCard} title={compactTitle || q.label}>
        <span className={styles.compactLabel}>{q.label}</span>
        <div className={styles.compactBar} aria-hidden="true">
          <span
            className={`${styles.compactBarFill} ${getBarTone(q.remainingPercent)}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className={styles.compactValue}>{formatPercent(q.remainingPercent)}</span>
        <span className={styles.compactReset}>
          {q.amountLabel ??
            (resetTimestamp !== null ? (
              <RelativeTime
                timestamp={resetTimestamp}
                mode="relative"
                locale={locale ?? i18n.language}
              />
            ) : (
              ''
            ))}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLabel}>
          {q.groupLabel ? <span className={styles.groupLabel}>{q.groupLabel}</span> : null}
          <strong title={q.label}>{q.label}</strong>
          {q.description ? (
            <span className={styles.description} title={q.description}>
              {q.description}
            </span>
          ) : null}
          {resetTimestamp !== null ? (
            <RelativeTime
              timestamp={resetTimestamp}
              mode="absolute"
              locale={locale ?? i18n.language}
            />
          ) : (
            <span>{q.resetLabel || '-'}</span>
          )}
        </div>
        <b className={styles.headerValue}>{formatPercent(q.remainingPercent)}</b>
      </div>
      <div className={styles.bar}>
        <progress
          className={`${styles.barProgress} ${getBarTone(q.remainingPercent)}`}
          max={100}
          value={width}
          aria-label={t('accounts.detail_quota_remaining_aria', {
            defaultValue: '剩余额度',
            value: width,
          })}
        />
        <span
          className={`${styles.barFill} ${getBarTone(q.remainingPercent)}`}
          style={{ width: `${width}%` }}
          aria-hidden="true"
        />
      </div>
      <div className={styles.meta}>
        {q.amountLabel ? <span className={styles.amountLabel}>{q.amountLabel}</span> : null}
        <span>
          {t('accounts.detail_used')}: {formatPercent(q.usedPercent)}
        </span>
        {usage?.matched ? (
          <>
            <span>
              {t('accounts.detail_window_requests')}: {formatCompactNumber(usage.totalRequests)}
            </span>
            <span>
              {t('accounts.detail_window_tokens')}: {formatCompactNumber(usage.totalTokens)}
            </span>
            <span>
              {t('accounts.detail_window_cost')}: {formatMoney(usage.totalCost)}
            </span>
          </>
        ) : (
          <span className={styles.metaEmpty}>
            {t('accounts.detail_window_stats_empty', {
              defaultValue: '窗口统计暂未采集',
            })}
          </span>
        )}
      </div>
    </div>
  );
};
