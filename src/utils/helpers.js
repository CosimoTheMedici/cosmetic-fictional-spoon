// ============================================================
// HELPERS - Utility functions used across controllers
// ============================================================

/**
 * Generate a unique sale reference number
 * Format: SALE-YYYYMMDD-XXXX (e.g., SALE-20240101-0042)
 * Uses DB to ensure uniqueness via auto-increment logic
 */
async function generateReference(conn) {
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, ''); // 20240101

  // Count today's sales to generate sequential number
  const [rows] = await conn.query(`
    SELECT COUNT(*) AS count FROM sales
    WHERE DATE(sold_at) = CURDATE()
  `);

  const seq = String(rows[0].count + 1).padStart(4, '0');
  return `SALE-${datePart}-${seq}`;
}

/**
 * Format currency in Kenyan Shillings
 * @param {number} amount
 * @returns {string} e.g. "KES 1,250.00"
 */
function formatKES(amount) {
  return `KES ${parseFloat(amount || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Get start and end date for a given period
 * @param {'today'|'week'|'month'|'quarter'|'year'} period
 */
function getPeriodDates(period) {
  const now = new Date();
  let start, end;

  switch (period) {
    case 'today':
      start = end = now.toISOString().split('T')[0];
      break;
    case 'week':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      start = weekStart.toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
      break;
    case 'quarter':
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
      break;
    default:
      start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      end = now.toISOString().split('T')[0];
  }

  return { start, end };
}

module.exports = { generateReference, formatKES, getPeriodDates };
