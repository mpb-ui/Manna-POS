import crypto from 'node:crypto';
import {verifySnapshot} from './backups.js';

export const OWNER_PIN_POLICY_VERSION=1;
export const validOwnerPin=pin=>typeof pin==='string'&&/^\d{4,12}$/.test(pin);
const time=value=>Date.parse(value)||0;
const version=user=>Number(user.sessionVersion||1);

// USER_UPDATE without pinChanged is from the older audit format: conservatively
// treat it as a possible PIN assignment. Never roll back a later Owner edit.
function recoveryTargets(state,events){
  return (state.users||[]).filter(user=>!user.deletedAt).flatMap(user=>{
    const assignments=(state.auditLogs||[]).filter(row=>row.metadata?.targetUserId===user.id&&
      (row.action==='USER_CREATE'||row.action==='USER_UPDATE'&&row.metadata.pinChanged!==false));
    const assignedAt=Math.max(time(user.pinOwnerAssignedAt),time(user.createdAt),...assignments.map(row=>time(row.createdAt)));
    const changes=events.filter(row=>row.action==='PIN_CHANGE'&&row.userId===user.id&&time(row.createdAt)>assignedAt).map(row=>time(row.createdAt)).sort((a,b)=>a-b);
    return changes.length?[{user,assignedAt,changes}]:[];
  });
}

/** Restore only PIN credentials, never the rest of a business snapshot. */
export function applyOwnerPinPolicy(state,events=[],snapshots=[],now=new Date().toISOString()){
  if(state.ownerPinPolicyVersion>=OWNER_PIN_POLICY_VERSION)return state.ownerPinRecovery;
  const restored=[],unresolved=[];
  for(const {user,assignedAt,changes} of recoveryTargets(state,events)){
    const source=snapshots.filter(row=>time(row.createdAt)>=assignedAt&&time(row.createdAt)<changes[0]).sort((a,b)=>time(b.createdAt)-time(a.createdAt)).map(row=>{
      const previous=row.users.find(candidate=>candidate.id===user.id);
      // Each self-service change increments the session version. Any unexplained
      // increment means a later access/PIN edit might be missing from audit history.
      return previous&&version(user)===version(previous)+changes.filter(t=>t>time(row.createdAt)).length?previous:null;
    }).find(previous=>previous&&typeof previous.pinSalt==='string'&&previous.pinSalt.length>0&&/^[a-f0-9]{64}$/i.test(previous.pinHash||''));
    if(source){
      user.pinSalt=source.pinSalt;user.pinHash=source.pinHash;user.sessionVersion=version(user)+1;
      user.pinRecoveryNeeded=false;restored.push(user.id);
    }else{user.pinRecoveryNeeded=true;unresolved.push(user.id);}
  }
  for(const user of state.users||[])delete user.pinChangeRequired;
  state.ownerPinPolicyVersion=OWNER_PIN_POLICY_VERSION;
  state.ownerPinRecovery={appliedAt:now,restoredCount:restored.length,unresolvedCount:unresolved.length};
  state.auditLogs||=[];
  state.auditLogs.unshift({id:crypto.randomUUID(),userId:null,userName:'Sistem',action:'OWNER_PIN_POLICY_APPLIED',description:'PIN dikelola Owner; ganti PIN mandiri dan Kunci POS dihapus',metadata:{restoredUserIds:restored,unresolvedUserIds:unresolved},createdAt:now});
  state.auditLogs=state.auditLogs.slice(0,2000);
  return state.ownerPinRecovery;
}

/** One-time migration, with a before-image and credential updates in one DB transaction. */
export async function initializeOwnerPinPolicy(store,securityDatabase){
  if(!store.pool){
    const events=(await securityDatabase.recentEvents());
    store.ownerPinRecovery=await store.mutate(state=>applyOwnerPinPolicy(state,events));
    store.ownerPinPolicyVersion=OWNER_PIN_POLICY_VERSION;
    return;
  }
  const client=await store.pool.connect();
  try{
    await client.query('BEGIN');
    const state=(await client.query("SELECT data FROM app_state WHERE id='main' FOR UPDATE")).rows[0].data;
    if(!(state.ownerPinPolicyVersion>=OWNER_PIN_POLICY_VERSION)){
      const events=(await client.query("SELECT data FROM pos_security_events WHERE data->>'action'='PIN_CHANGE' ORDER BY created_at")).rows.map(row=>row.data);
      const targets=recoveryTargets(state,events),snapshots=[];
      if(targets.length){
        const headers=(await client.query('SELECT id,created_at FROM pos_daily_backups ORDER BY created_at DESC')).rows;
        for(const header of headers){
          const captured=new Date(header.created_at).toISOString();
          if(!targets.some(target=>time(captured)>=target.assignedAt&&time(captured)<target.changes[0]))continue;
          const row=(await client.query('SELECT data,digest FROM pos_daily_backups WHERE id=$1',[header.id])).rows[0];
          try{verifySnapshot(row.data,row.digest);}catch{continue;} // An unverifiable snapshot cannot reset credentials.
          snapshots.push({createdAt:captured,users:row.data.users});
        }
      }
      await client.query('INSERT INTO app_state_backups(tag,data) VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING',
        ['owner-pin-policy-v1',JSON.stringify(state)]);
      applyOwnerPinPolicy(state,events,snapshots);
      const patch={users:state.users,auditLogs:state.auditLogs,ownerPinPolicyVersion:state.ownerPinPolicyVersion,ownerPinRecovery:state.ownerPinRecovery};
      await client.query("UPDATE app_state SET data=data||$1::jsonb,updated_at=NOW() WHERE id='main'",[JSON.stringify(patch)]);
    }
    await client.query('COMMIT');
    store.ownerPinPolicyVersion=state.ownerPinPolicyVersion;
    store.ownerPinRecovery=state.ownerPinRecovery;
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
