import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {Store} from '../lib/store.js';
import {SecurityStore} from '../lib/security-store.js';
import {reserveAttempt} from '../lib/security.js';
import {BackupManager,encryptBackup,decryptBackup,checksum} from '../lib/backups.js';
import {databaseConfig} from '../lib/database-config.js';
import {requestContext} from '../lib/request-context.js';

test('Postgres persists concurrent login limits and revocations across instances; backup restores exactly into an isolated schema',{skip:!process.env.TEST_SECURITY_DATABASE_URL},async()=>{
 const schema='security_'+crypto.randomBytes(8).toString('hex'),root=new pg.Pool(databaseConfig(process.env.TEST_SECURITY_DATABASE_URL));let pool,temporary;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({...databaseConfig(process.env.TEST_SECURITY_DATABASE_URL),options:'-csearch_path='+schema});
  const store=new Store();store.pool=pool;await store.init();const initial=(await pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data;
  await store.mutate(state=>{state.users.push({id:'owner',username:'owner',active:true,sessionVersion:1});state.orders.push({id:'receipt',total:55000,paidAmount:55000,payments:[{amount:25000},{amount:30000}],items:[]});state.homeCampaign={items:[{thumbnail:'data:image/png;base64,test'}]};});
  const first=new SecurityStore(pool),second=new SecurityStore(pool);await first.init();await second.init();
  const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?first:second).mutate(state=>reserveAttempt(state,'owner','ip-'+i,Date.now()))));assert.equal(results.filter(r=>r.allowed).length,5);
  const restarted=new SecurityStore(pool);await restarted.init();assert.equal((await restarted.mutate(state=>reserveAttempt(state,'owner','new-ip',Date.now()))).allowed,false);
  await first.mutate(state=>{state.sessions.test={id:'session',userId:'owner',expiresAt:Date.now()+10000};});assert((await second.read()).sessions.test);await second.mutate(state=>{delete state.sessions.test;});assert.equal((await restarted.read()).sessions.test,undefined);
  const backup=new BackupManager(store);await backup.init();assert(backup.status.verified);await backup.capture();assert.equal(Number((await pool.query('SELECT count(*) AS total FROM pos_daily_backups')).rows[0].total),1);
  const source=(await pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data;
  const restored=await decryptBackup(await encryptBackup(source,'postgres restore passphrase'),'postgres restore passphrase');
  await pool.query('CREATE TABLE restore_test (id TEXT PRIMARY KEY, data JSONB NOT NULL)');await pool.query('INSERT INTO restore_test VALUES ($1,$2::jsonb)',['restored',JSON.stringify(restored.data)]);
  const roundtrip=(await pool.query('SELECT data FROM restore_test')).rows[0].data;assert.deepEqual(roundtrip.orders,source.orders);assert.deepEqual(roundtrip.homeCampaign,source.homeCampaign);assert.equal(checksum(roundtrip),checksum(source));
  const restoreSchema=schema+'_restore';await root.query(`CREATE SCHEMA ${restoreSchema}`);temporary=await mkdtemp(os.tmpdir()+'/manna-backup-');
  const file=temporary+'/test.mannabackup';await writeFile(file,JSON.stringify(await encryptBackup(source,'postgres restore passphrase')),{mode:0o600});
  const target=new URL(process.env.TEST_SECURITY_DATABASE_URL);target.searchParams.set('options','-csearch_path='+restoreSchema);
  const options={cwd:new URL('..',import.meta.url).pathname,env:{...process.env,MANNA_RESTORE_DATABASE_URL:target.toString(),MANNA_BACKUP_PASSPHRASE:'postgres restore passphrase',MANNA_RESTORE_CONFIRM:'EMPTY_DATABASE'}};
  const restoredCli=await promisify(execFile)(process.execPath,['scripts/restore-backup.js',file],options);assert.equal(JSON.parse(restoredCli.stdout).ok,true);
  assert.equal(checksum((await root.query(`SELECT data FROM ${restoreSchema}.app_state WHERE id='main'`)).rows[0].data),checksum(source));
  await assert.rejects(promisify(execFile)(process.execPath,['scripts/restore-backup.js',file],options),/Target bukan database kosong/);
  await store.mutate(state=>{state.users[0].sessionVersion=2;});
  await assert.rejects(requestContext.run({userId:'owner',version:1},()=>store.mutate(state=>state.orders.push({id:'forbidden'}))),/Akses akun berubah/);
  assert.equal((await store.read()).orders.filter(o=>o.id==='forbidden').length,0);assert.equal(initial.orders.length,0);
 }finally{await pool?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema}_restore CASCADE`);await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await rm(temporary||'',{recursive:true,force:true}).catch(()=>{});await root.end();}
});

test('public database connections verify TLS; only Render private self-signed endpoints use the documented exception',()=>{
 assert.equal(databaseConfig('postgres://u:p@localhost/test').ssl,false);
 assert.equal(databaseConfig('postgres://u:p@attacker-localhost.example/test?sslmode=no-verify').ssl.rejectUnauthorized,true);
 assert.equal(databaseConfig('postgres://u:p@dpg-example-a/test',{render:true}).ssl.rejectUnauthorized,false);
 assert.equal(databaseConfig('postgres://u:p@dpg-example-a/test',{render:false}).ssl.rejectUnauthorized,true);
 assert.equal(new URL(databaseConfig('postgres://u:p@public.example/test?sslmode=no-verify').connectionString).searchParams.has('sslmode'),false);
});
