import { Store } from './store.js';
import { simulatePayoff, monthlyInterest, totalBalance, totalLimit, totalMin, utilization } from './payoff.js';

const ui = {
  tab: 'overview',
  editingId: null,       // null | 'new' | card id
  confirmDelete: false,
  confirmReset: false,
  booting: true,
  needsLogin: false,
  loginSent: false,
  loginError: ''
};

const D = () => Store.data;

/* ---------- formatting ---------- */
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function monthLabel(monthsAhead) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function uid() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(16).slice(2);
}
const utilClass = p => p >= 75 ? 'danger' : p >= 40 ? 'warn' : '';

/* ---------- views ---------- */
function viewLogin() {
  return `
    <div class="gate">
      <h2>Sign in</h2>
      <p class="note">Your ledger syncs to your account, so it's the same on every device. Enter your email and we'll send a sign-in link. No password to remember.</p>
      <label class="first" for="email">Email</label>
      <input type="email" id="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
      ${ui.loginError ? `<p class="form-error" style="display:block">${esc(ui.loginError)}</p>` : ''}
      <div class="editor-actions">
        <button type="button" class="btn full" data-action="send-link">Email me a link</button>
      </div>
      ${ui.loginSent ? `<div class="banner" style="margin-top:18px">Link sent. Open it on this phone and you'll land back here signed in.</div>` : ''}
    </div>`;
}

function viewOverview() {
  const cards = D().cards;
  if (cards.length === 0) {
    return `<div class="empty-state">
      Nothing tracked yet. Add your cards and Ledger will show what you owe, how much of your credit you're using, and when you'll be clear.
      <div class="add-link"><button class="btn" data-action="add-card">Add your first card</button></div>
    </div>`;
  }

  const util = utilization(cards);
  const sim = simulatePayoff(cards, D().settings.extraPayment, D().settings.method);

  let banner;
  if (sim.empty) {
    banner = `<div class="banner">Every card is at zero. Nothing owed.</div>`;
  } else if (!sim.feasible) {
    const gap = monthlyInterest(cards) - totalMin(cards);
    banner = `<div class="banner warn"><strong>Your balance is growing.</strong> Interest is running ${whole(Math.max(0, gap))} a month ahead of your payments. Open Payoff to change the plan.</div>`;
  } else {
    banner = `<div class="banner">On your current plan, debt-free by <strong>${monthLabel(sim.months)}</strong>.</div>`;
  }

  const rows = cards.map(c => {
    const pct = c.limit > 0 ? Math.min(100, (c.balance / c.limit) * 100) : 0;
    return `<div class="row">
      <div class="row-top"><span class="row-name">${esc(c.name)}</span><span class="row-balance">${money(c.balance)}</span></div>
      <div class="row-meta">${c.limit > 0 ? pct.toFixed(0) + '% of ' + whole(c.limit) : 'No limit set'} · ${c.apr}% APR</div>
      <div class="bar-track"><div class="bar-fill ${utilClass(pct)}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  return `
    <div class="figure-row">
      <div class="figure"><div class="num danger">${whole(totalBalance(cards))}</div><div class="label">Total owed</div></div>
      <div class="figure"><div class="num">${util.toFixed(0)}%</div><div class="label">Utilization</div></div>
    </div>
    ${banner}
    <div class="block">
      <p class="block-title">Your cards</p>
      <div class="row-list">${rows}</div>
    </div>
    <div class="block">
      <p class="block-title">Going out each month</p>
      <div class="figure">
        <div class="num accent">${whole(totalMin(cards) + D().settings.extraPayment)}</div>
        <div class="label">${whole(totalMin(cards))} in minimums${D().settings.extraPayment > 0 ? ' plus ' + whole(D().settings.extraPayment) + ' extra' : ''}</div>
      </div>
    </div>`;
}

function viewCards() {
  const cards = D().cards;
  if (cards.length === 0) {
    return `<div class="empty-state">No cards yet.
      <div class="add-link"><button class="btn" data-action="add-card">Add a card</button></div></div>`;
  }
  const rows = cards.map(c => {
    const pct = c.limit > 0 ? Math.min(100, (c.balance / c.limit) * 100) : 0;
    return `<div class="row tappable" data-action="edit-card" data-id="${esc(c.id)}">
      <div class="row-top"><span class="row-name">${esc(c.name)}</span><span class="row-balance">${money(c.balance)}</span></div>
      <div class="row-meta">Limit ${whole(c.limit)} · ${c.apr}% APR · Min ${whole(c.minPayment)}${c.dueDay ? ' · Due the ' + c.dueDay : ''}</div>
      <div class="bar-track"><div class="bar-fill ${utilClass(pct)}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  return `<div class="row-list">${rows}</div>
    <p class="note" style="margin-top:12px">Tap a card to update its balance or remove it.</p>`;
}

function viewEditor() {
  const isNew = ui.editingId === 'new';
  const card = isNew
    ? { name: '', balance: '', limit: '', apr: '', minPayment: '', dueDay: '' }
    : D().cards.find(c => c.id === ui.editingId);
  if (!card) { ui.editingId = null; return viewCards(); }

  return `
    <div class="editor">
      <div class="editor-head">
        <h2>${isNew ? 'Add a card' : 'Edit card'}</h2>
        <button type="button" class="link-btn" data-action="close-editor">Cancel</button>
      </div>

      <label class="first" for="f-name">Card name</label>
      <input type="text" id="f-name" value="${esc(card.name)}" placeholder="Chase Freedom" autocomplete="off" autocapitalize="words">

      <div class="field-row">
        <div><label for="f-balance">Balance</label>
          <input type="number" id="f-balance" inputmode="decimal" min="0" step="0.01" value="${card.balance}" placeholder="0"></div>
        <div><label for="f-limit">Credit limit</label>
          <input type="number" id="f-limit" inputmode="decimal" min="0" step="0.01" value="${card.limit}" placeholder="0"></div>
      </div>

      <div class="field-row">
        <div><label for="f-apr">APR %</label>
          <input type="number" id="f-apr" inputmode="decimal" min="0" step="0.01" value="${card.apr}" placeholder="0"></div>
        <div><label for="f-min">Min payment</label>
          <input type="number" id="f-min" inputmode="decimal" min="0" step="0.01" value="${card.minPayment}" placeholder="0"></div>
      </div>

      <label for="f-due">Due day of the month, optional</label>
      <input type="number" id="f-due" inputmode="numeric" min="1" max="31" value="${card.dueDay || ''}" placeholder="15">

      <p class="form-error" id="formError">Give the card a name before saving.</p>

      <div class="editor-actions">
        <button type="button" class="btn full" data-action="save-card">${isNew ? 'Add card' : 'Save card'}</button>
      </div>
      ${!isNew ? `<div class="editor-actions">
        <button type="button" class="btn secondary full" data-action="${ui.confirmDelete ? 'delete-confirm' : 'delete-ask'}"
          ${ui.confirmDelete ? 'style="border-color:var(--danger);color:var(--danger)"' : ''}>
          ${ui.confirmDelete ? 'Tap again to delete' : 'Delete card'}</button>
      </div>` : ''}
    </div>`;
}

function payoffResult() {
  const { method, extraPayment } = D().settings;
  const cards = D().cards;
  const sim = simulatePayoff(cards, extraPayment, method);

  if (sim.empty) return `<div class="banner">Every card is at zero. Nothing to pay off.</div>`;

  if (!sim.feasible) {
    const gap = monthlyInterest(cards) - totalMin(cards);
    return `<div class="banner warn"><strong>This plan never clears the debt.</strong> ${
      gap > 0
        ? 'Interest is ' + whole(gap) + ' a month more than your minimums, so the balance climbs no matter how long you wait. You need at least that much extra just to hold it steady.'
        : 'Add an extra monthly payment to see a payoff date.'}</div>`;
  }

  const alt = simulatePayoff(cards, extraPayment, method === 'avalanche' ? 'snowball' : 'avalanche');
  let compare = '';
  if (alt.feasible && !alt.empty) {
    const name = method === 'avalanche' ? 'Snowball' : 'Avalanche';
    const dInt = alt.totalInterest - sim.totalInterest;
    const dMon = alt.months - sim.months;
    if (Math.abs(dInt) >= 1 || dMon !== 0) {
      compare = `<p class="note">${name} would ${dInt > 0 ? 'cost' : 'save'} about ${whole(Math.abs(dInt))} in interest${
        dMon !== 0 ? ' and ' + (dMon > 0 ? 'add ' : 'cut ') + Math.abs(dMon) + ' month' + (Math.abs(dMon) === 1 ? '' : 's') : ''}.</p>`;
    } else {
      compare = `<p class="note">Both methods land in the same place for these balances.</p>`;
    }
  }

  return `
    <div class="figure-row">
      <div class="figure"><div class="num">${sim.months}</div><div class="label">Months to debt-free</div></div>
      <div class="figure"><div class="num danger">${whole(sim.totalInterest)}</div><div class="label">Interest you'll pay</div></div>
    </div>
    <div class="banner">Paying ${whole(totalMin(cards) + extraPayment)} a month, you're clear by <strong>${monthLabel(sim.months)}</strong>.</div>
    ${compare}`;
}

function viewPayoff() {
  if (D().cards.length === 0) {
    return `<div class="empty-state">Add a card and your payoff plan will appear here.</div>`;
  }
  const { method, extraPayment } = D().settings;
  return `
    <div class="block">
      <p class="block-title">Payoff method</p>
      <div class="toggle-pair">
        <button type="button" class="toggle-opt ${method === 'avalanche' ? 'active' : ''}" data-action="method" data-method="avalanche">Avalanche</button>
        <button type="button" class="toggle-opt ${method === 'snowball' ? 'active' : ''}" data-action="method" data-method="snowball">Snowball</button>
      </div>
      <p class="note">${method === 'avalanche'
        ? 'Extra money goes to your highest-APR card first. Usually the cheapest way out.'
        : 'Extra money goes to your smallest balance first. Clears whole cards sooner, which keeps momentum up.'}</p>
    </div>
    <div class="block">
      <label class="first" for="extraPay">Extra payment each month, on top of minimums</label>
      <input type="number" id="extraPay" inputmode="decimal" min="0" step="10" value="${extraPayment || ''}" placeholder="0" data-live="extra">
    </div>
    <div class="block">
      <p class="block-title">Your plan</p>
      <div id="payoffResult">${payoffResult()}</div>
    </div>`;
}

function budgetResult() {
  const min = totalMin(D().cards);
  const left = D().budget.income - D().budget.expenses - min;
  return `
    <div class="figure">
      <div class="num ${left >= 0 ? 'accent' : 'danger'}">${whole(left)}</div>
      <div class="label">Left after ${whole(D().budget.expenses)} of expenses and ${whole(min)} of minimums</div>
    </div>
    ${left > 0 ? `<div style="margin-top:14px"><button class="btn full" data-action="apply-extra">Put ${whole(left)} toward debt</button></div>` : ''}
    ${left < 0 ? `<div class="banner warn" style="margin-top:14px">You're short ${whole(Math.abs(left))} a month before any extra debt payment.</div>` : ''}`;
}

function viewBudget() {
  const signedIn = Store.mode === 'synced' && Store.user;
  return `
    <div class="block">
      <label class="first" for="inc">Monthly income, after tax</label>
      <input type="number" id="inc" inputmode="decimal" min="0" step="50" value="${D().budget.income || ''}" placeholder="0" data-live="income">
    </div>
    <div class="block">
      <label class="first" for="exp">Fixed monthly expenses</label>
      <input type="number" id="exp" inputmode="decimal" min="0" step="50" value="${D().budget.expenses || ''}" placeholder="0" data-live="expenses">
      <p class="note">Rent, utilities, groceries, transport, subscriptions. Leave out card minimums, those are already counted.</p>
    </div>
    <div class="block">
      <p class="block-title">Free for debt</p>
      <div id="budgetResult">${budgetResult()}</div>
    </div>

    <div class="block">
      <p class="block-title">Your data</p>
      <div class="stack">
        <button type="button" class="btn secondary full" data-action="export">Download a backup</button>
        <button type="button" class="btn secondary full" data-action="import">Restore from a backup</button>
        ${signedIn ? `<button type="button" class="btn secondary full" data-action="signout">Sign out (${esc(Store.user.email || '')})</button>` : ''}
      </div>
      <p class="note">${signedIn
        ? 'Synced to your account. Changes appear on any device you sign in on.'
        : 'Saved in this browser only. Download a backup now and then so nothing is lost if you clear your history.'}</p>
    </div>

    <div class="footer-link">
      <button data-action="${ui.confirmReset ? 'reset-confirm' : 'reset-ask'}" ${ui.confirmReset ? 'style="color:var(--danger)"' : ''}>
        ${ui.confirmReset ? 'Tap again to erase everything' : 'Clear all data'}</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" style="display:none">`;
}

/* ---------- render ---------- */
function render() {
  document.getElementById('todaySub').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const content = document.getElementById('content');
  const tabbar = document.getElementById('tabbar');
  const fab = document.getElementById('fab');
  const editing = !!ui.editingId;
  const gated = ui.needsLogin;

  tabbar.style.display = (gated || ui.booting) ? 'none' : 'flex';
  fab.classList.toggle('show', !gated && !editing && !ui.booting && ui.tab === 'cards');

  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', !editing && b.dataset.tab === ui.tab));

  if (ui.booting)               content.innerHTML = '<div class="loading">Opening your ledger…</div>';
  else if (gated)               content.innerHTML = viewLogin();
  else if (editing)             content.innerHTML = viewEditor();
  else if (ui.tab === 'overview') content.innerHTML = viewOverview();
  else if (ui.tab === 'cards')    content.innerHTML = viewCards();
  else if (ui.tab === 'payoff')   content.innerHTML = viewPayoff();
  else                            content.innerHTML = viewBudget();

  if (editing && ui.editingId === 'new') {
    const n = document.getElementById('f-name');
    if (n) setTimeout(() => n.focus(), 60);
  }
}

// Update only the computed panels, so the field being typed into is untouched.
function refreshResults() {
  const p = document.getElementById('payoffResult');
  if (p) p.innerHTML = payoffResult();
  const b = document.getElementById('budgetResult');
  if (b) b.innerHTML = budgetResult();
}

function setSyncBadge(stateName) {
  const el = document.getElementById('syncBadge');
  if (!el) return;
  const map = { saving: 'Saving…', saved: 'Synced', offline: 'Offline, saved on this phone', error: 'Sync problem' };
  if (Store.mode !== 'synced' || !Store.user) { el.textContent = ''; el.className = 'sync'; return; }
  el.textContent = map[stateName] || '';
  el.className = 'sync ' + (stateName === 'offline' || stateName === 'error' ? 'warn' : '');
}

/* ---------- actions ---------- */
function numField(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isFinite(v) && v >= 0 ? v : 0;
}

function saveCard() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) {
    document.getElementById('formError').style.display = 'block';
    document.getElementById('f-name').focus();
    return;
  }
  const due = parseInt(document.getElementById('f-due').value, 10);
  const payload = {
    name,
    balance: numField('f-balance'),
    limit: numField('f-limit'),
    apr: numField('f-apr'),
    minPayment: numField('f-min'),
    dueDay: (due >= 1 && due <= 31) ? due : null
  };

  if (ui.editingId === 'new') D().cards.push({ id: uid(), ...payload });
  else {
    const c = D().cards.find(c => c.id === ui.editingId);
    if (c) Object.assign(c, payload);
  }

  Store.save({ immediate: true });
  ui.editingId = null;
  ui.confirmDelete = false;
  ui.tab = 'cards';
  render();
  window.scrollTo(0, 0);
}

function downloadBackup() {
  const blob = new Blob([Store.exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ledger-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  switch (el.dataset.action) {
    case 'add-card':
      ui.editingId = 'new'; ui.confirmDelete = false; render(); break;

    case 'edit-card':
      ui.editingId = el.dataset.id; ui.confirmDelete = false; render(); break;

    case 'close-editor':
      ui.editingId = null; ui.confirmDelete = false; render(); break;

    case 'save-card':
      saveCard(); break;

    case 'delete-ask':
      ui.confirmDelete = true; render(); break;

    case 'delete-confirm':
      Store.data.cards = D().cards.filter(c => c.id !== ui.editingId);
      Store.save({ immediate: true });
      ui.editingId = null; ui.confirmDelete = false; ui.tab = 'cards'; render(); break;

    case 'method':
      D().settings.method = el.dataset.method;
      Store.save({ immediate: true });
      render(); break;

    case 'apply-extra': {
      const left = D().budget.income - D().budget.expenses - totalMin(D().cards);
      D().settings.extraPayment = Math.max(0, Math.round(left));
      Store.save({ immediate: true });
      ui.tab = 'payoff'; render(); window.scrollTo(0, 0); break;
    }

    case 'export':
      downloadBackup(); break;

    case 'import':
      document.getElementById('importFile').click(); break;

    case 'signout':
      await Store.signOut();
      ui.needsLogin = true; render(); break;

    case 'send-link': {
      const email = (document.getElementById('email').value || '').trim();
      if (!email || !email.includes('@')) { ui.loginError = 'Enter a valid email address.'; render(); return; }
      ui.loginError = '';
      el.disabled = true; el.textContent = 'Sending…';
      try {
        await Store.signIn(email);
        ui.loginSent = true;
      } catch (err) {
        ui.loginError = err.message || 'Could not send the link. Try again.';
      }
      render(); break;
    }

    case 'reset-ask':
      ui.confirmReset = true; render(); break;

    case 'reset-confirm':
      Store.reset();
      ui.confirmReset = false; ui.tab = 'overview'; render(); break;
  }
});

document.addEventListener('input', (e) => {
  const live = e.target.dataset.live;
  if (!live) return;
  const raw = e.target.value;
  const v = raw === '' ? 0 : parseFloat(raw);
  const val = isFinite(v) && v >= 0 ? v : 0;

  if (live === 'extra') D().settings.extraPayment = val;
  else if (live === 'income') D().budget.income = val;
  else if (live === 'expenses') D().budget.expenses = val;

  Store.save();       // local write is immediate; network push is debounced
  refreshResults();   // never touches the field being typed into
});

// Push to the server as soon as a field is done being edited.
document.addEventListener('blur', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.live) Store.flush();
}, true);

document.addEventListener('change', (e) => {
  if (e.target.id !== 'importFile' || !e.target.files || !e.target.files[0]) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      Store.importJson(reader.result);
      ui.tab = 'overview';
      render();
    } catch (err) {
      alert("That file isn't a Ledger backup.");
    }
  };
  reader.readAsText(e.target.files[0]);
});

document.addEventListener('keydown', (e) => {
  if (!ui.editingId) return;
  if (e.key === 'Enter') { e.preventDefault(); saveCard(); }
  if (e.key === 'Escape') { ui.editingId = null; ui.confirmDelete = false; render(); }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    ui.tab = btn.dataset.tab;
    ui.editingId = null;
    ui.confirmDelete = false;
    ui.confirmReset = false;
    render();
    window.scrollTo(0, 0);
  });
});

/* ---------- boot ---------- */
export async function boot(createClient) {
  Store.onSyncChange = setSyncBadge;
  render();

  let result = { needsLogin: false };
  try {
    result = await Store.init(createClient);
  } catch (err) {
    console.error('Init failed, running on this device only', err);
  }

  ui.needsLogin = !!result.needsLogin;
  ui.booting = false;
  render();
  setSyncBadge(Store.syncState);

  if (Store.sb) {
    Store.sb.auth.onAuthStateChange(async (_evt, session) => {
      const nowUser = session ? session.user : null;
      const changed = (nowUser && nowUser.id) !== (Store.user && Store.user.id);
      Store.user = nowUser;
      if (nowUser && changed) {
        ui.needsLogin = false;
        ui.loginSent = false;
        await Store.pull();
        render();
      } else if (!nowUser) {
        ui.needsLogin = true;
        render();
      }
      setSyncBadge(Store.syncState);
    });
  }
}

window.__ledger = { ui, Store, render };
