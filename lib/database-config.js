// Render's private Postgres endpoint uses a self-signed certificate. Require
// encryption there; verify the certificate and host for public endpoints.
export function databaseConfig(connectionString,{render=process.env.RENDER==='true',ca=process.env.PG_SSL_CA}={}){
  const url=new URL(connectionString),host=url.hostname;
  const local=['localhost','127.0.0.1','[::1]'].includes(host);
  const privateRender=render&&/^dpg-[a-z0-9-]+$/.test(host);
  for(const param of ['ssl','sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat'])url.searchParams.delete(param);
  return {connectionString:url.toString(),ssl:local?false:privateRender?{rejectUnauthorized:false}:{rejectUnauthorized:true,...ca?{ca}:{}},max:5,connectionTimeoutMillis:10000};
}
