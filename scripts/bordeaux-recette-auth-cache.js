'use strict';
// Sessions d'audit locales, temporaires et strictement privees.
// Aucune modification de la politique de limitation de connexions SATEER.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;
function personId(me) {
  return Number(me?.body?.personne?.id || me?.body?.personneId || me?.body?.personne_id || 0);
}
class AuditAuthCache {
  constructor(file, options = {}) {
    this.file = path.resolve(file);
    this.now = options.now || (() => Date.now());
    this.maxAgeMs = options.maxAgeMs || DEFAULT_MAX_AGE_MS;
    const dir=path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const ds = fs.lstatSync(dir);
    assert(ds.isDirectory() && (ds.mode & 0o077)===0, 'Dossier de sessions non prive : arret');
    this.entries={};
    if(fs.existsSync(this.file)) {
      const st=fs.lstatSync(this.file);
      assert(st.isFile() && (st.mode&0o077)===0 && st.nlink===1, 'Cache de sessions non prive : arret');
      const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(data.version===1 && data.entries && typeof data.entries==='object' && !Array.isArray(data.entries)) this.entries=data.entries;
    }
    let purged=false;
    for(const [key,entry] of Object.entries(this.entries)) {
      if(!entry || !Number.isFinite(entry.at) || this.now()-entry.at>this.maxAgeMs || this.now()-entry.at<0) {
        delete this.entries[key]; purged=true;
      }
    }
    if(purged) this.persist();
  }
  persist() {
    const tmp=this.file+'.tmp-'+process.pid;
    const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
    try {fs.writeFileSync(fd,JSON.stringify({version:1,entries:this.entries})+'\n');}
    finally {fs.closeSync(fd);}
    fs.renameSync(tmp,this.file);
  }
  async authenticate(label, user, req) {
    const cached=this.entries[label];
    if(cached && typeof cached.cookie==='string' && Number.isFinite(cached.at)
       && this.now()-cached.at >= 0 && this.now()-cached.at <= this.maxAgeMs
       && Number.isSafeInteger(cached.personId) && cached.personId>0) {
      const me=await req('/api/auth/me', cached.cookie);
      if(me.status===200 && personId(me)===cached.personId) {
        return {ok:true,cookie:cached.cookie,me,cached:true,status:200};
      }
    }
    if(cached){delete this.entries[label];this.persist();}
    const res=await req('/api/auth/login',null,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({identifiant:user.login,motDePasse:user.password})
    });
    if(res.status!==200){return {ok:false,status:res.status,code:typeof res.body?.statut==='string'?res.body.statut:'REPONSE_INATTENDUE',rateLimited:res.status===429};}
    const cookies=typeof res.headers?.getSetCookie==='function'?res.headers.getSetCookie():[res.headers?.get('set-cookie')||''];
    const cookie=cookies.map(x=>x.split(';')[0]).find(x=>x.startsWith('sateer_session='));
    if(!cookie)return {ok:false,status:200,code:'COOKIE_SESSION_ABSENT'};
    const me=await req('/api/auth/me',cookie);
    const id=personId(me);
    if(me.status!==200||!id)return {ok:false,status:me.status,code:'IDENTITE_SESSION_INVALIDE'};
    this.entries[label]={cookie,at:this.now(),personId:id};
    this.persist();
    return {ok:true,cookie,me,cached:false,status:200};
  }
}
module.exports={AuditAuthCache,personId};
