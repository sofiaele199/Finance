/* Ledger data layer.
 *
 * Two modes, decided at runtime:
 *   local  - nothing configured yet. Data lives in this browser only.
 *   synced - Supabase configured. Data lives in your account, on every device.
 *
 * In synced mode the browser cache is still written on every change and is
 * treated as the source of truth for rendering. That means the app opens
 * instantly and keeps working with no signal; the network write happens after.
 */

const LOCAL_KEY = 'ledger.v1';

const DEFAULTS = {
  cards: [],
  accounts: [],
  expenses: [],
  budget: { income: 0, expenses: 0 },
  settings: { method: 'avalanche', extraPayment: 0 }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export const Store = {
  mode: 'local',
  user: null,
  sb: null,
  data: clone(DEFAULTS),
  syncState: 'idle',      // idle | saving | saved | offline | error
  onSyncChange: () => {},

  configured() {
    return !!(window.LEDGER_CONFIG
      && window.LEDGER_CONFIG.SUPABASE_URL
      && window.LEDGER_CONFIG.SUPABASE_ANON_KEY
      && !window.LEDGER_CONFIG.SUPABASE_URL.includes('YOUR_'));
  },

  readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return clone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        cards: Array.isArray(parsed.cards) ? parsed.cards : [],
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        budget: (parsed.budget && typeof parsed.budget === 'object') ? parsed.budget : clone(DEFAULTS.budget),
        settings: (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : clone(DEFAULTS.settings)
      };
    } catch (e) {
      return clone(DEFAULTS);
    }
  },

  writeLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      console.error('Local write failed', e);
      return false;
    }
  },

  setSync(s) {
    this.syncState = s;
    try { this.onSyncChange(s); } catch (e) {}
  },

  async init(createClient) {
    this.data = this.readLocal();

    if (!this.configured() || !createClient) {
      this.mode = 'local';
      return { needsLogin: false };
    }

    this.sb = createClient(
      window.LEDGER_CONFIG.SUPABASE_URL,
      window.LEDGER_CONFIG.SUPABASE_ANON_KEY
    );
    this.mode = 'synced';

    const { data } = await this.sb.auth.getSession();
    this.user = data && data.session ? data.session.user : null;

    if (!this.user) return { needsLogin: true };

    await this.pull();
    return { needsLogin: false };
  },

  // Fetch the server copy. Server wins on first load of a session, since
  // another device may have newer numbers than this browser's cache.
  async pull() {
    if (this.mode !== 'synced' || !this.user) return;
    try {
      const { data, error } = await this.sb
        .from('ledger')
        .select('payload')
        .eq('user_id', this.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data && data.payload) {
        const p = data.payload;
        this.data = {
          cards: Array.isArray(p.cards) ? p.cards : [],
          accounts: Array.isArray(p.accounts) ? p.accounts : [],
          expenses: Array.isArray(p.expenses) ? p.expenses : [],
          budget: (p.budget && typeof p.budget === 'object') ? p.budget : clone(DEFAULTS.budget),
          settings: (p.settings && typeof p.settings === 'object') ? p.settings : clone(DEFAULTS.settings)
        };
        this.writeLocal();
      } else {
        // First sign-in on a fresh account: adopt whatever is already local.
        await this.push();
      }
      this.setSync('saved');
    } catch (e) {
      console.warn('Pull failed, using local copy', e);
      this.setSync('offline');
    }
  },

  async push() {
    if (this.mode !== 'synced' || !this.user) return;
    this.setSync('saving');
    try {
      const { error } = await this.sb
        .from('ledger')
        .upsert(
          { user_id: this.user.id, payload: this.data, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
      this.setSync('saved');
    } catch (e) {
      console.warn('Push failed, kept locally', e);
      this.setSync('offline');
    }
  },

  // Every mutation goes through here. Local write is synchronous and always
  // succeeds first, so a network failure can never lose what you typed.
  _pushTimer: null,
  save({ immediate = false } = {}) {
    this.writeLocal();
    if (this.mode !== 'synced' || !this.user) return;
    clearTimeout(this._pushTimer);
    if (immediate) this.push();
    else this._pushTimer = setTimeout(() => this.push(), 800);
  },

  flush() {
    clearTimeout(this._pushTimer);
    if (this.mode === 'synced' && this.user) this.push();
  },

  async signIn(email) {
    if (this.mode !== 'synced') throw new Error('Sync is not configured');
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
  },

  async signOut() {
    if (this.sb) await this.sb.auth.signOut();
    this.user = null;
  },

  exportJson() {
    return JSON.stringify({ exported: new Date().toISOString(), ...this.data }, null, 2);
  },

  importJson(text) {
    const p = JSON.parse(text);
    if (!p || typeof p !== 'object') throw new Error('Not a Ledger backup');
    this.data = {
      cards: Array.isArray(p.cards) ? p.cards : [],
      accounts: Array.isArray(p.accounts) ? p.accounts : [],
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      budget: (p.budget && typeof p.budget === 'object') ? p.budget : clone(DEFAULTS.budget),
      settings: (p.settings && typeof p.settings === 'object') ? p.settings : clone(DEFAULTS.settings)
    };
    this.save({ immediate: true });
  },

  reset() {
    this.data = clone(DEFAULTS);
    this.save({ immediate: true });
  }
};
