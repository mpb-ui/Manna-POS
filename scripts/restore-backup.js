import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {decryptBackup,checksum} from '../lib/backups.js';
import {databaseConfig} from '../lib/database-config.js';

// Restore to an explicitly selected EMPTY database. Never overwrite a running POS.
let pool,client;
try{
  const file=process.argv[2],target=process.env.MANNA_RESTORE_DATABASE_URL,passphrase=process.env.MANNA_BACKUP_PASSPHRASE;
  if(!file||!target||!passphrase||process.env.MANNA_RESTORE_CONFIRM!=='EMPTY_DATABASE')throw new Error('Isi path backup, MANNA_RESTORE_DATABASE_URL, MANNA_BACKUP_PASSPHRASE, dan MANNA_RESTORE_CONFIRM=EMPTY_DATABASE melalui pengelola secret');
  if(target===process.env.DATABASE_URL)throw new Error('Target restore harus berbeda dari DATABASE_URL aplikasi');
  const restored=await decryptBackup(JSON.parse(await readFile(file,'utf8')),passphrase);
  pool=new pg.Pool(databaseConfig(target));client=await pool.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(1835101793)');
  const existing=await client.query("SELECT count(*) AS total FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'");
  if(Number(existing.rows[0].total)!==0)throw new Error('Target bukan database kosong. Restore dibatalkan.');
  await client.query('CREATE TABLE app_state(id TEXT PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await client.query('INSERT INTO app_state(id,data) VALUES ($1,$2::jsonb)',['main',JSON.stringify(restored.data)]);
  const written=(await client.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data;if(checksum(written)!==restored.digest)throw new Error('Verifikasi data hasil restore gagal');
  await client.query('COMMIT');console.log(JSON.stringify({ok:true,checksumVerified:true,summary:restored.summary}));
}catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;}finally{client?.release();await pool?.end();}
