import crypto from 'node:crypto';

// Kept separate from the business document: failed logins never lock orders/payments.
export class SecurityStore {
  constructor(pool) { this.pool=pool; this.memory={limits:{},sessions:{}}; this.events=[]; this.queue=Promise.resolve(); }
  async init() {
    if(!this.pool)return;
    await this.pool.query(`CREATE TABLE IF NOT EXISTS pos_security (id TEXT PRIMARY KEY, data JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS pos_security_events (id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), data JSONB NOT NULL);
      CREATE INDEX IF NOT EXISTS pos_security_events_date ON pos_security_events(created_at DESC)`);
    await this.pool.query("INSERT INTO pos_security(id,data) VALUES ('main',$1::jsonb) ON CONFLICT DO NOTHING",[JSON.stringify(this.memory)]);
  }
  async read() { if(!this.pool)return structuredClone(this.memory); return (await this.pool.query("SELECT data FROM pos_security WHERE id='main'")).rows[0].data; }
  async mutate(fn) {
    if(!this.pool){const next=this.queue.then(async()=>{const draft=structuredClone(this.memory),value=await fn(draft);this.memory=draft;return value;});this.queue=next.catch(()=>{});return next;}
    const client=await this.pool.connect();
    try { await client.query('BEGIN'); const state=(await client.query("SELECT data FROM pos_security WHERE id='main' FOR UPDATE")).rows[0].data;
      const value=await fn(state);await client.query("UPDATE pos_security SET data=$1::jsonb WHERE id='main'",[JSON.stringify(state)]);await client.query('COMMIT');return value;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async event(action,details={}) {
    const row={id:crypto.randomUUID(),createdAt:new Date().toISOString(),action,...details};
    if(!this.pool){this.events.unshift(row);this.events=this.events.slice(0,1000);return;}
    await this.pool.query('INSERT INTO pos_security_events(id,data) VALUES ($1,$2::jsonb)',[row.id,JSON.stringify(row)]);
  }
  async recentEvents() { return this.pool?(await this.pool.query('SELECT data FROM pos_security_events ORDER BY created_at DESC LIMIT 100')).rows.map(r=>r.data):this.events.slice(0,100); }
}
