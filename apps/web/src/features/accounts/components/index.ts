/**
 * 账号抽屉共享组件索引
 * 集中 re-export,避免在多个 Tab 间重复实现"健康度 / 配额窗口 / 时间"等横切关注点。
 */
export { AccountHealthBadge, severityFromQuotaStatus } from './AccountHealthBadge';
export type { AccountHealthSeverity } from './AccountHealthBadge';

export { RelativeTime } from './RelativeTime';
export type { RelativeTimeMode } from './RelativeTime';

export { QuotaWindowCard } from './QuotaWindowCard';

export { AccountQuotaMatrix } from './AccountQuotaMatrix';

export { CopyableText } from './CopyableText';
