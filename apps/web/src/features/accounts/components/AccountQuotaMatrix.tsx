import {
  formatPercent,
  type AntigravityQuotaMatrix,
} from '@/features/accounts/model/accountsPagePresentation';
import styles from '../AccountsPage.module.scss';

interface AccountQuotaMatrixProps {
  accountKey: string;
  matrix: AntigravityQuotaMatrix;
}

const getRemainingPercentBarClass = (remainingPercent: number | null) => {
  if (remainingPercent === null) return styles.quotaBarNeutral;
  if (remainingPercent <= 0) return styles.quotaBarBad;
  if (remainingPercent < 20) return styles.quotaBarWarn;
  return styles.quotaBarGood;
};

export function AccountQuotaMatrix({ accountKey, matrix }: AccountQuotaMatrixProps) {
  return (
    <div className={styles.quotaMatrix} data-account-quota-matrix={accountKey}>
      {matrix.rows.map((matrixRow) => (
        <div
          key={matrixRow.key}
          className={styles.quotaMatrixRow}
          data-account-quota-matrix-row={matrixRow.key}
        >
          <span className={styles.quotaMatrixWindowLabel}>{matrixRow.label}</span>
          <div className={styles.quotaMatrixCells}>
            {matrixRow.cells.map((cell) => {
              const windowRemaining = cell.window.remainingPercent;
              const windowWidth = Math.max(0, Math.min(100, windowRemaining ?? 0));
              return (
                <div
                  key={cell.window.key}
                  className={styles.quotaMatrixCell}
                  data-account-quota-matrix-cell={`${matrixRow.key}:${cell.groupLabel}`}
                  title={`${cell.groupLabel} ${cell.window.label}: ${formatPercent(
                    windowRemaining
                  )}`}
                >
                  <span className={styles.quotaMatrixGroupLabel} title={cell.groupLabel}>
                    {cell.displayLabel}
                  </span>
                  <div
                    className={`${styles.quotaTrack} ${styles.quotaMatrixTrack}`}
                    aria-hidden="true"
                  >
                    <span
                      className={`${styles.quotaBar} ${getRemainingPercentBarClass(
                        windowRemaining
                      )}`}
                      style={{ width: `${windowWidth}%` }}
                    />
                  </div>
                  <strong className={styles.quotaMatrixPercent}>
                    {windowRemaining !== null ? formatPercent(windowRemaining) : '-'}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
