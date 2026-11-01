import {AsyncLocalStorage} from 'node:async_hooks';
export const requestContext=new AsyncLocalStorage();
export function checkMutationActor(state){
  const actor=requestContext.getStore();if(!actor)return;
  const user=state.users.find(u=>u.id===actor.userId&&u.active!==false&&!u.deletedAt&&Number(u.sessionVersion||1)===actor.version);
  if(!user)throw Object.assign(new Error('Akses akun berubah. Silakan masuk kembali.'),{status:401});
}
