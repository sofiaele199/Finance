/* Debt payoff simulation.
 *
 * Monthly loop: interest accrues, minimums are paid, then any extra payment
 * is applied to a single target card chosen by the selected method.
 *   avalanche - highest APR first. Lowest total interest.
 *   snowball  - smallest balance first. Clears whole cards sooner.
 */

export function simulatePayoff(cards, extraPayment, method) {
  const debts = cards
    .filter(c => Number(c.balance) > 0.005)
    .map(c => ({
      balance: Number(c.balance) || 0,
      apr: Number(c.apr) || 0,
      minPayment: Number(c.minPayment) || 0
    }));

  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, feasible: true, empty: true };
  }

  const extra = Math.max(0, Number(extraPayment) || 0);
  let totalInterest = 0;
  let months = 0;
  const MAX = 720; // 60 years, treated as "never pays off"

  while (debts.some(c => c.balance > 0.01) && months < MAX) {
    months++;
    let pool = extra;

    for (const c of debts) {
      if (c.balance <= 0) continue;
      const interest = c.balance * (c.apr / 100 / 12);
      c.balance += interest;
      totalInterest += interest;
    }

    for (const c of debts) {
      if (c.balance <= 0) continue;
      c.balance -= Math.min(c.minPayment, c.balance);
    }

    const order = method === 'snowball'
      ? [...debts].sort((a, b) => a.balance - b.balance)
      : [...debts].sort((a, b) => b.apr - a.apr);

    for (const c of order) {
      if (pool <= 0) break;
      if (c.balance <= 0) continue;
      const pay = Math.min(pool, c.balance);
      c.balance -= pay;
      pool -= pay;
    }
  }

  return { months, totalInterest, feasible: months < MAX, empty: false };
}

export function monthlyInterest(cards) {
  return cards.reduce((s, c) =>
    s + (Number(c.balance) > 0 ? Number(c.balance) * ((Number(c.apr) || 0) / 100 / 12) : 0), 0);
}

export const totalBalance = cards => cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);
export const totalLimit   = cards => cards.reduce((s, c) => s + (Number(c.limit) || 0), 0);
export const totalMin     = cards => cards.reduce((s, c) => s + (Number(c.minPayment) || 0), 0);

export function utilization(cards) {
  const lim = totalLimit(cards);
  return lim > 0 ? (totalBalance(cards) / lim) * 100 : 0;
}
