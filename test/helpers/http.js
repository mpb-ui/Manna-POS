const tokens=new Map();
// Tests of CSRF itself use global fetch directly. This helper only supplies the
// session token to existing business API suites, just as public/app.js does.
export async function secureFetch(url,options={}){
  const headers=new Headers(options.headers),method=String(options.method||'GET').toUpperCase(),cookie=headers.get('cookie'),path=new URL(url);
  if(cookie&&path.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method)&&!headers.has('x-manna-csrf')){
    const id=path.origin+'|'+cookie;let token=tokens.get(id);
    if(!token){const session=await globalThis.fetch(path.origin+'/api/session',{headers:{cookie}});token=(await session.json()).csrfToken;if(token)tokens.set(id,token);}
    if(token)headers.set('x-manna-csrf',token);
  }
  const response=await globalThis.fetch(url,{...options,headers});
  if(path.pathname==='/api/login'&&response.ok){const body=await response.clone().json(),cookie=response.headers.get('set-cookie')?.split(';')[0];if(cookie&&body.csrfToken)tokens.set(path.origin+'|'+cookie,body.csrfToken);}
  return response;
}
