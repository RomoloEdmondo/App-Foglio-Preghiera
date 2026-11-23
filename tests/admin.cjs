const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { createServer } = require('node:http');
const { resolve, extname, sep } = require('node:path');
const { chromium } = require('playwright');
const root=resolve(__dirname,'..');
const ownerId='dbe3d8e8-3e14-4010-b227-a8dad5e7c1a3';
const otherId='11111111-1111-4111-8111-111111111111';
const sample={checkedAt:new Date().toISOString(),databaseBytes:12725395,postgresVersion:'17.6',queryMs:148,
  tables:[{name:'prayer_months',bytes:352256,rls:true,policies:1},{name:'prayer_months_de',bytes:294912,rls:true,policies:1},{name:'prayer_group_members',bytes:32768,rls:true,policies:1},{name:'maintenance_audit',bytes:16384,rls:true,policies:0}],
  months:[{language:'it',count:12,lastUpdated:'2026-11-22T19:34:12Z'},{language:'de',count:5,lastUpdated:'2026-11-10T14:24:56Z'}],
  storage:{bytes:0,objects:0},buckets:[],usersTruncated:false,
  users:[{id:ownerId,email:'romolo.91@live.it',confirmed:true,lastSignIn:new Date().toISOString()},{id:otherId,email:'gruppo@example.invalid',confirmed:true,lastSignIn:null}],
  memberships:[{user_id:ownerId,language:'it'},{user_id:ownerId,language:'de'},{user_id:otherId,language:'it'}],audit:[]};
(async()=>{
  const {createHandler}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(resolve(root,'supabase/functions/maintenance-admin/handler.js'),'utf8')).toString('base64'));
  let calls=0;
  const backend={auth:{getUser:async token=>({data:{user:token==='owner'?{id:ownerId,email:'romolo.91@live.it',email_confirmed_at:'2026-01-01'}:token==='forged'?{id:otherId,email:'romolo.91@live.it',email_confirmed_at:'2026-01-01'}:null}}),admin:{createUser:async()=>({data:{user:{id:otherId,email:'new@example.invalid'}}}),updateUserById:async()=>({data:{}}),deleteUser:async()=>({data:{}}),getUserById:async()=>({data:{user:{id:otherId,email:'gruppo@example.invalid'}}}),listUsers:async()=>({data:{users:[]}})}},rpc:async(name,args)=>{calls++;return {data:name==='maintenance_snapshot'?sample:null}},from:()=>({insert:async()=>({error:null}),select:()=>({limit:async()=>({data:[]}),order:()=>({limit:async()=>({data:[]})})})})};
  const handler=createHandler(backend);
  const invoke=(token,body)=>handler(new Request('http://localhost',{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)}));
  assert.equal((await invoke(null,{action:'overview'})).status,401);
  assert.equal((await invoke('invalid',{action:'overview'})).status,401);
  assert.equal((await invoke('forged',{action:'overview'})).status,403);
  assert.equal(calls,0,'Rejected identities never read data');
  assert.equal((await invoke('owner',{action:'overview'})).status,200);
  assert.equal((await invoke('owner',{action:'membership',userId:ownerId,language:'it',enabled:false})).status,400);
  assert.equal((await invoke('owner',{action:'membership',userId:otherId,language:'xx',enabled:true})).status,400);
  assert.equal((await invoke('owner',{action:'membership',userId:otherId,language:'de',enabled:true})).status,200);
  assert.equal((await invoke('owner',{action:'sql',query:'drop table'})).status,400);
  assert.equal((await handler(new Request('http://localhost',{method:'OPTIONS',headers:{Origin:'https://evil.invalid'}}))).status,403);
  assert.equal((await invoke('forged',{action:'delete_user',userId:otherId})).status,403);
  assert.equal((await invoke('owner',{action:'delete_user',userId:ownerId,confirmEmail:'romolo.91@live.it'})).status,400);
  assert.equal((await invoke('owner',{action:'delete_user',userId:otherId,confirmEmail:'wrong@example.invalid'})).status,400);
  assert.equal((await invoke('owner',{action:'delete_user',userId:otherId,confirmEmail:'gruppo@example.invalid'})).status,200);
  assert.equal((await invoke('owner',{action:'create_user',email:'new@example.invalid',password:'Long-test-password!'})).status,200);
  assert.equal((await invoke('owner',{action:'reset_password',userId:otherId,password:'short'})).status,400);
  assert.equal((await invoke('owner',{action:'reset_password',userId:otherId,password:'Long-test-password!'})).status,200);
  console.log('PASS backend: verified owner, forged-email rejection, missing/invalid sessions, protected owner, validated changes, no arbitrary operations.');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.jpeg':'image/jpeg','.png':'image/png'};
  const server=createServer((req,res)=>{let path=new URL(req.url,'http://local').pathname;if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}try{res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||'msedge'});
  const errors=[];let deny=false,fail=false,changes=0;
  async function open(logged=true){
    const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
    const session={access_token:'owner',refresh_token:'test-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:ownerId,email:'romolo.91@live.it',aud:'authenticated'}};
    await context.addInitScript(({logged,session})=>{if(logged)localStorage.setItem('sb-zqhuctdwpdjdfrinlkcz-auth-token',JSON.stringify(session));},{logged,session});
    await context.route('https://zqhuctdwpdjdfrinlkcz.supabase.co/**',async route=>{
      const req=route.request(),url=req.url();const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      if(url.includes('/auth/v1/logout'))return json({});
      if(url.includes('/auth/v1/token'))return json(session);
      if(url.includes('/auth/v1/user'))return json(session.user);
      if(url.includes('/functions/v1/maintenance-admin')){
        if(deny)return json({error:'Area riservata al manutentore.'},403);
        if(fail)return json({error:'Servizio momentaneamente non disponibile.'},503);
        const body=req.postDataJSON();
        if(body.action==='overview')return json(sample);
        if(['create_user','reset_password','delete_user'].includes(body.action))return json({saved:true});
        if(body.action==='membership'){
          changes++;sample.memberships=sample.memberships.filter(m=>!(m.user_id===body.userId&&m.language===body.language));
          if(body.enabled)sample.memberships.push({user_id:body.userId,language:body.language});
          sample.audit.unshift({target_id:body.userId,language:body.language,enabled:body.enabled,created_at:new Date().toISOString()});return json({saved:true});
        }
      }
      if(url.includes('/rest/v1/prayer_group_members'))return json([{language:'it'},{language:'de'}]);
      if(url.includes('/rest/v1/prayer_months'))return json(null);
      return json({error:'Unexpected request'},500);
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/admin/`);return page;
  }
  try{
    const page=await open();await page.locator('#dashboard').waitFor({state:'visible'});
    assert.equal(await page.locator('#stats .stat').count(),4);
    assert(await page.locator(`[data-user="${ownerId}"]`).first().isDisabled());
    mkdirSync(resolve(root,'test-results'),{recursive:true});
    await page.screenshot({path:resolve(root,'test-results/admin-desktop.png'),fullPage:true});
    for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);}
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(root,'test-results/admin-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1100});
    await page.locator('#userSearch').fill('gruppo');assert.equal(await page.locator('#userRows tr').count(),1);
    const target=page.locator(`[data-user="${otherId}"][data-language="de"]`);
    await target.click();await page.getByRole('button',{name:'Annulla',exact:true}).click();assert.equal(changes,0);
    await target.click();await page.locator('#confirmChange').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Accesso aggiornato'));
    assert.equal(changes,1);assert.equal(await target.getAttribute('aria-pressed'),'true');assert((await page.locator('#auditRows').innerText()).includes('Accesso abilitato'));
    await page.locator('#createUser').click();await page.locator('#userForm [name=email]').fill('new@example.invalid');await page.locator('#userForm [name=password]').fill('Long-test-password!');await page.locator('#userForm button[type=submit]').click();await page.locator('#userDialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    await page.locator('[data-operation=reset_password]').click();await page.locator('#userForm [name=password]').fill('Long-test-password!');await page.locator('#userForm button[type=submit]').click();await page.locator('#userDialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    await page.locator('[data-operation=delete_user]').click();await page.locator('#cancelUser').click();assert(await page.locator('#userDialog').isHidden());
    await page.locator('#access').screenshot({path:resolve(root,'test-results/admin-users.png')});
    const download=page.waitForEvent('download');await page.locator('#downloadReport').click();const report=await download;const body=readFileSync(await report.path(),'utf8');assert(!body.includes('romolo.91'));assert(!body.includes('sb_publishable'));
    fail=true;await page.locator('#refresh').click();await page.locator('#gate').waitFor({state:'visible'});assert.equal(await page.locator('#userRows').innerText(),'');fail=false;await page.locator('#retryGate').click();await page.locator('#dashboard').waitFor({state:'visible'});
    await page.locator('#adminLogout').click();await page.locator('#adminLogin').waitFor({state:'visible'});assert.equal(await page.locator('#publicKey').innerText(),'');
    deny=true;const denied=await open();await denied.getByText('Area riservata al manutentore.',{exact:true}).waitFor();assert(await denied.locator('#dashboard').isHidden());assert.equal(await denied.locator('#userRows').innerText(),'');deny=false;
    const login=await open(false);await login.locator('#adminLogin').waitFor({state:'visible'});await login.locator('#adminLogin input[name=password]').fill('test-only');await login.getByRole('button',{name:'Accedi all’amministrazione'}).click();await login.locator('#dashboard').waitFor({state:'visible'});
    await login.goto(`http://127.0.0.1:${server.address().port}/it/`);await login.locator('#appShell').waitFor({state:'visible'});await login.locator('#accountButton').click();assert(await login.locator('#adminLink').isVisible());
    assert.deepEqual(errors,[]);
    console.log('PASS admin UI: desktop/mobile, access denial, login/logout, search, confirmation/cancel, membership persistence, audit, report, failure/retry, owner menu link.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
