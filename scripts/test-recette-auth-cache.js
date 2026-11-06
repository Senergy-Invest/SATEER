'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AuditAuthCache}=require('./bordeaux-recette-auth-cache');
async function test(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sateer-recette-test-'));
  fs.chmodSync(root,0o700);
  try {
    let now=1000000, logins=0, getMe=0;
    const sessions=new Map();
    const user={login:'synthetic-user',password:'PRIVATE_PASSWORD_NOT_TO_SAVE'};
    const req=async (url,cookie,options)=>{
      if(url==='/api/auth/me') {getMe++;const id=sessions.get(cookie);
        return {status:id?200:401,body:id?{personne:{id}}:{statut:'SESSION_INVALIDE'}};
      }
      assert.equal(url,'/api/auth/login');
      logins++;
      if(logins>10)return {status:429,body:{statut:'TROP_DE_TENTATIVES'}};
      assert.equal(JSON.parse(options.body).identifiant,user.login);
      const token='sateer_session=session-'+logins;
      sessions.set(token,300+logins);
      return {status:200,body:{statut:'AUTHENTIFICATION_REUSSIE'},headers:{getSetCookie(){return [token+'; HttpOnly; SameSite=Lax'];}}};
    };
    const file=path.join(root,'sessions.json');
    for(let i=0;i<8;i++) {
      const cache=new AuditAuthCache(file,{now:()=>now});
      const auth=await cache.authenticate('PROFILE_'+i,user,req);
      assert(auth.ok&&!auth.cached);
    }
    assert.equal(logins,8);
    // The second complete run uses eight verified sessions, no new POST /login.
    const again=new AuditAuthCache(file,{now:()=>now+5000});
    for(let i=0;i<8;i++) {
      const auth=await again.authenticate('PROFILE_'+i,user,req);
      assert(auth.ok&&auth.cached);
    }
    assert.equal(logins,8);
    assert(getMe>=16);
    console.log('PASS : 2 executions consecutives, 8 profils, 8 POST login seulement');
    assert.equal(fs.statSync(file).mode & 0o077,0);
    const contents=fs.readFileSync(file,'utf8');
    assert(!contents.includes(user.password));
    assert(!contents.includes(user.login));
    console.log('PASS : cache prive 0600, aucun mot de passe ni identifiant stocke');
    // Exhausted IP limit becomes an explicit non-fatal diagnostic (no fake bad password).
    await again.authenticate('PROFILE_8',user,req);
    await again.authenticate('PROFILE_9',user,req);
    const throttle=await again.authenticate('PROFILE_10',user,req);
    assert.equal(throttle.status,429);
    assert.equal(throttle.code,'TROP_DE_TENTATIVES');
    assert(throttle.rateLimited);
    console.log('PASS : HTTP 429 identifie sans confondre avec de mauvais identifiants');
    const wrong=await again.authenticate('INVALID_PASSWORD',{login:'incorrect',password:'bad'},async (url)=>{
      assert.equal(url,'/api/auth/login');return {status:401,body:{statut:'IDENTIFIANTS_INVALIDES'}};
    });
    assert(!wrong.ok && !wrong.rateLimited && wrong.status===401 && wrong.code==='IDENTIFIANTS_INVALIDES');
    console.log('PASS : HTTP 401 distingue du quota 429');
    // Expired cache is reauthenticated only when allowed by the server.
    const expired=new AuditAuthCache(file,{now:()=>now+61*60*1000});
    const result=await expired.authenticate('PROFILE_0',user,req);
    assert.equal(result.status,429);
    assert(!result.ok&&result.rateLimited);
    console.log('PASS : session expiree refusee proprement si serveur encore limite');
    console.log('RECETTE_AUTH_CACHE_PASS : 5/5');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test().catch(e=>{console.error(e);process.exitCode=1;});
