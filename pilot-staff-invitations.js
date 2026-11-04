'use strict';
// P6.3 - invitation bearer one-use, strictly test-only. No email transmission.
const crypto = require('node:crypto');
const { obtenirClientDatabase, executerRequete } = require('./database');
const { exigerPermission } = require('./auth-authorization');
const { exigerSession } = require('./auth-http');
const { hacherMotDePasse } = require('./auth-passwords');
const VALID = x => Number.isSafeInteger(Number(x)) && Number(x)>0 ? Number(x) : null;
const clean = (s,max) => typeof s==='string' && s.trim().length>0 && s.trim().length<=max ? s.trim() : null;
const emailValid = s => typeof s==='string' && s.length<=190 && /^[a-z0-9][a-z0-9._%+\-]{0,100}@[a-z0-9.-]+\.[a-z]{2,24}$/.test(s);
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const tokenValid = s => typeof s==='string' && /^[A-Za-z0-9_-]{43}$/.test(s);
const allowTest = (req,res,next) => process.env.PGDATABASE==='sateer_test' ? next() : res.status(503).json({statut:'PILOTE_RESERVE_BASE_TEST'});
function originGuard(req,res,next) {
  const desired = process.env.SATEER_PUBLIC_ORIGIN || 'http://localhost:3100';
  const supplied = req.get('origin');
  if(supplied && supplied!==desired) return res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});
  next();
}
// P6.3.2: rate limits per invitation + an aggregate IP safety net.
// Several independent demonstration agents on localhost no longer share the 12-attempt bucket.
// Limits are not removed; no token or password is ever logged or kept in plaintext.
const hits = new Map();
const WINDOW_MS = 15 * 60 * 1000;
function limitPublic(req,res,next){
  const now=Date.now();
  const ip=String(req.ip||req.socket?.remoteAddress||'unknown');
  const token=req.body?.invitation;
  const keys=[['ip:'+ip,60]];
  if(tokenValid(token))keys.push(['invite:'+tokenHash(token),12]);
  if(hits.size>5000){
    for(const [key,item] of hits){if(item.until<=now)hits.delete(key);}
  }
  const buckets=keys.map(([key,max])=>{
    const old=hits.get(key);
    return {key,max,item:old && old.until>now?old:{n:0,until:now+WINDOW_MS}};
  });
  const blocked=buckets.find(({max,item})=>item.n>=max);
  if(blocked){
    const retryAfter=Math.max(1,Math.ceil((blocked.item.until-now)/1000));
    res.set('Retry-After',String(retryAfter));
    res.set('Cache-Control','no-store');
    return res.status(429).json({statut:'TROP_DE_TENTATIVES',retryAfterSeconds:retryAfter});
  }
  for(const {key,item} of buckets){item.n++;hits.set(key,item);}
  next();
}
const publicHeaders = (req,res,next) => { res.set('Cache-Control','no-store'); res.set('Referrer-Policy','no-referrer'); next(); };
const base = '/api/organisations/:organisationId/units/:unitId/staff-invitations';
async function getValidInvitation(client,token){
  const r=await client.query(`SELECT i.*, o.tenant_id
    FROM sateer_staff_invitations i JOIN organisations o ON o.id=i.organisation_id
    WHERE i.token_sha256=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at>NOW() FOR UPDATE OF i`,[tokenHash(token)]);
  if(r.rowCount!==1)return null;
  const i=r.rows[0];
  const valid=await client.query(`SELECT u.id FROM organisation_units u JOIN organisation_roles r ON r.organisation_id=u.organisation_id
   WHERE u.id=$1 AND u.organisation_id=$2 AND u.actif=TRUE AND r.id=$3 AND r.actif=TRUE AND r.scope IN ('UNIT','BOTH')`,[i.unit_id,i.organisation_id,i.role_id]);
  return valid.rowCount===1 ? i : null;
}
async function applyMembership(client,i,personneId){
  const existing=await client.query(`SELECT id FROM relations_personne_organisation
      WHERE personne_id=$1 AND organisation_id=$2 AND type IN ('AGENT','RESPONSABLE','AGENT_SATEER') LIMIT 1`,[personneId,i.organisation_id]);
  if(!existing.rowCount)await client.query(`INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES ($1,$2,'AGENT')`,[personneId,i.organisation_id]);
  const members=await client.query(`SELECT id,actif FROM relations_personne_organisation_unit
      WHERE personne_id=$1 AND organisation_unit_id=$2 AND role_id=$3 FOR UPDATE`,[personneId,i.unit_id,i.role_id]);
  if(members.rowCount){
    if(!members.rows[0].actif)await client.query(`UPDATE relations_personne_organisation_unit SET actif=TRUE,date_fin=NULL,date_modification=NOW() WHERE id=$1`,[members.rows[0].id]);
  }else{
    await client.query(`INSERT INTO relations_personne_organisation_unit(personne_id,organisation_unit_id,role_id,principal,actif)
      VALUES($1,$2,$3,FALSE,TRUE)`,[personneId,i.unit_id,i.role_id]);
  }
  await client.query(`UPDATE sateer_staff_invitations SET accepted_at=NOW(),accepted_person_id=$2 WHERE id=$1`,[i.id,personneId]);
}
function installStaffInvitations(app){
  app.post(base, ...exigerPermission('ASSIGN_MEMBER','UNIT'),allowTest,originGuard,publicHeaders,async(req,res)=>{
    const organisationId=VALID(req.params.organisationId),unitId=VALID(req.params.unitId), roleId=VALID(req.body?.roleId);
    const prenom=clean(req.body?.prenom,100),nom=clean(req.body?.nom,100),email=String(req.body?.email||'').trim().toLowerCase(),tenant=clean(req.body?.tenantCode,12);
    if(!organisationId||!unitId||!roleId||!prenom||!nom||!emailValid(email)||!tenant||!/^[A-Z]{2,12}$/.test(tenant))return res.status(400).json({statut:'INVITATION_INVALIDE'});
    try{
      const scope=await executerRequete(`SELECT u.id FROM organisation_units u
        JOIN organisations o ON o.id=u.organisation_id JOIN tenants t ON t.id=o.tenant_id
        JOIN organisation_roles r ON r.organisation_id=o.id AND r.id=$4 AND r.actif=TRUE AND r.scope IN ('UNIT','BOTH')
        WHERE o.id=$1 AND t.code=$2 AND u.id=$3 AND u.actif=TRUE`,[organisationId,tenant,unitId,roleId]);
      if(!scope.rowCount)return res.status(400).json({statut:'BUREAU_OU_ROLE_INVALIDE'});
      const duplicate=await executerRequete(`SELECT id FROM sateer_staff_invitations WHERE organisation_id=$1 AND unit_id=$2
        AND lower(email)=$3 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1`,[organisationId,unitId,email]);
      if(duplicate.rowCount)return res.status(409).json({statut:'INVITATION_DEJA_ACTIVE'});
      const token=crypto.randomBytes(32).toString('base64url');
      const created=await executerRequete(`INSERT INTO sateer_staff_invitations
        (organisation_id,unit_id,role_id,invited_by,prenom,nom,email,token_sha256,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()+INTERVAL '48 hours') RETURNING id,expires_at`,
        [organisationId,unitId,roleId,req.auth.personneId,prenom,nom,email,tokenHash(token)]);
      // Token never stored in plaintext, logged, or returned in future GETs.
      const url='/activation-agent.html#invitation='+encodeURIComponent(token);
      return res.status(201).json({statut:'INVITATION_CREEE',id:created.rows[0].id,expiresAt:created.rows[0].expires_at,lien:url,
        avertissement:'Lien à communiquer par un canal privé. Aucun e-mail automatique envoyé.'});
    }catch(e){console.error('P6.3 création invitation',e.code||e.message);return res.status(500).json({statut:'ERREUR_INVITATION'});}
  });
  app.get(base,...exigerPermission('ASSIGN_MEMBER','UNIT'),allowTest,publicHeaders,async(req,res)=>{
    const o=VALID(req.params.organisationId),u=VALID(req.params.unitId), t=String(req.query.tenant||'');
    if(!o||!u||!/^[A-Z]{2,12}$/.test(t))return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
    try{
      const r=await executerRequete(`SELECT i.id,i.prenom,i.nom,i.email,i.expires_at,i.accepted_at,i.revoked_at,i.created_at,r.nom AS role_nom
        FROM sateer_staff_invitations i JOIN organisations o ON o.id=i.organisation_id JOIN tenants t ON t.id=o.tenant_id
        JOIN organisation_roles r ON r.id=i.role_id
        WHERE i.organisation_id=$1 AND i.unit_id=$2 AND t.code=$3 ORDER BY i.id DESC LIMIT 100`,[o,u,t]);
      return res.json({statut:'INVITATIONS_CHARGEES',invitations:r.rows});
    }catch(e){console.error('P6.3 liste invitations',e.code||e.message);return res.status(500).json({statut:'ERREUR_INVITATIONS'});}
  });
  app.post(base+'/:invitationId/revoke',...exigerPermission('ASSIGN_MEMBER','UNIT'),allowTest,originGuard,publicHeaders,async(req,res)=>{
    const o=VALID(req.params.organisationId),u=VALID(req.params.unitId),v=VALID(req.params.invitationId),t=String(req.body?.tenantCode||'');
    if(!o||!u||!v||!/^[A-Z]{2,12}$/.test(t))return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
    try{
      const r=await executerRequete(`UPDATE sateer_staff_invitations i SET revoked_at=NOW()
        FROM organisations o JOIN tenants t ON t.id=o.tenant_id
        WHERE i.id=$1 AND i.organisation_id=$2 AND i.unit_id=$3 AND o.id=i.organisation_id AND t.code=$4
          AND i.accepted_at IS NULL AND i.revoked_at IS NULL RETURNING i.id`,[v,o,u,t]);
      return r.rowCount?res.json({statut:'INVITATION_REVOQUEE'}):res.status(404).json({statut:'INVITATION_NON_ACTIVE'});
    }catch(e){console.error('P6.3 retrait invitation',e.code||e.message);return res.status(500).json({statut:'ERREUR_REVOCATION'});}
  });
  // New agent: only a one-time valid invitation can create a professional account.
  app.post('/api/staff-invitations/activate-new',allowTest,originGuard,limitPublic,publicHeaders,async(req,res)=>{
    const token=req.body?.invitation,email=String(req.body?.email||'').trim().toLowerCase(),password=req.body?.motDePasse;
    if(!tokenValid(token)||!emailValid(email)||typeof password!=='string'||password.length<16||password.length>128||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))return res.status(400).json({statut:'ACTIVATION_INVALIDE'});
    let client;
    try{
      client=await obtenirClientDatabase(); await client.query('BEGIN');
      const i=await getValidInvitation(client,token);
      if(!i||i.email!==email){await client.query('ROLLBACK');return res.status(410).json({statut:'INVITATION_INVALIDE_OU_EXPIREE'});}
      const existing=await client.query(`SELECT id FROM auth_accounts WHERE lower(identifiant)=$1 LIMIT 1`,[email]);
      if(existing.rowCount){await client.query('ROLLBACK');return res.status(409).json({statut:'COMPTE_EXISTANT_CONNECTEZ_VOUS'});}
      const passhash=await hacherMotDePasse(password);
      const p=await client.query(`INSERT INTO personnes (prenom,nom,profil) VALUES($1,$2,'PROFESSIONNEL') RETURNING id`,[i.prenom,i.nom]);
      const personneId=p.rows[0].id;
      await client.query(`INSERT INTO auth_accounts(personne_id,identifiant,mot_de_passe_hash,actif) VALUES($1,$2,$3,TRUE)`,[personneId,email,passhash]);
      await applyMembership(client,i,personneId);
      await client.query('COMMIT');return res.status(201).json({statut:'COMPTE_AGENT_ACTIVE',connexion:'/login.html'});
    }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('P6.3 activation',e.code||e.message);
      return res.status(e.code==='23505'?409:500).json({statut:e.code==='23505'?'COMPTE_EXISTANT_OU_AFFECTATION':'ERREUR_ACTIVATION'});
    }finally{if(client)client.release();}
  });
  // Existing SATEER user: explicit authenticated consent, never reset an existing account.
  app.post('/api/staff-invitations/activate-existing',exigerSession,allowTest,originGuard,limitPublic,publicHeaders,async(req,res)=>{
    const token=req.body?.invitation;
    if(!tokenValid(token))return res.status(400).json({statut:'INVITATION_INVALIDE'});
    let client;
    try{
      client=await obtenirClientDatabase();await client.query('BEGIN');
      const i=await getValidInvitation(client,token);
      if(!i){await client.query('ROLLBACK');return res.status(410).json({statut:'INVITATION_INVALIDE_OU_EXPIREE'});}
      const account=await client.query(`SELECT personne_id FROM auth_accounts WHERE id=$1 AND lower(identifiant)=$2 AND actif=TRUE`,[req.auth.compteId,i.email]);
      if(!account.rowCount||Number(account.rows[0].personne_id)!==Number(req.auth.personneId)){
        await client.query('ROLLBACK');return res.status(403).json({statut:'CONNECTEZ_VOUS_AVEC_LE_COMPTE_INVITE'});
      }
      await applyMembership(client,i,req.auth.personneId);
      await client.query('COMMIT');return res.json({statut:'INVITATION_ACCEPTEE',connexion:'/index.html'});
    }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('P6.3 activation existant',e.code||e.message);return res.status(500).json({statut:'ERREUR_ACTIVATION'});
    }finally{if(client)client.release();}
  });
}
module.exports={installStaffInvitations,tokenValid,emailValid};
