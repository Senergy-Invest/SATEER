'use strict';
/** E-METER-1B2 : source de vérité PostgreSQL + blob chiffré dans le coffre Energy.
 * Zéro identité ni droit issu du navigateur ; association par FK composite 063. */
const crypto=require('node:crypto');
const {sanitizeName}=require('./energy-billing-evidence-domain');
function creerBillingEvidenceStore({obtenirClient,vault}){
 if(typeof obtenirClient!=='function'||!vault||!['save','read','erase'].every(k=>typeof vault[k]==='function'))throw TypeError('DEPENDANCES_EVIDENCE');
 const use=async fn=>{const c=await obtenirClient();try{return await fn(c);}finally{c.release();}};
 async function site(c,{tenant,actor,siteId},lock=false){const q=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,s.public_id
  FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
  WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1 ${lock?'FOR UPDATE OF s':''}`,[tenant,siteId,actor]);return q.rows[0]||null;}
 const scope=s=>[s.id,s.tenant_id,s.owner_personne_id];
 async function declaration(c,s,declarationId){const r=await c.query(`SELECT id FROM energy_billing_declarations
   WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[declarationId,...scope(s)]);return r.rows[0]||null;}
 const dto=x=>({id:String(x.id),declarationId:String(x.declaration_id),nom:x.nom_original,mime:x.mime_type,
  taille:Number(x.taille_octets),qualification:x.qualification,dateCreation:x.date_creation});
 async function lister(x){return use(async c=>{const s=await site(c,x);if(!s||!await declaration(c,s,x.declarationId))return null;
  const r=await c.query(`SELECT id,declaration_id,nom_original,mime_type,taille_octets,qualification,date_creation
    FROM energy_billing_attachments WHERE declaration_id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
    ORDER BY date_creation,id LIMIT 6`,[x.declarationId,...scope(s)]);
  return {fichiers:r.rows.map(dto),limite:5,qualification:'FICHIERS_NON_VERIFIES'};
 });}
 async function creer(x){let created=null,done=false;
  try{return await use(async c=>{await c.query('BEGIN');try{
   const s=await site(c,x,true);if(!s||!await declaration(c,s,x.declarationId)){await c.query('ROLLBACK');return {code:'DECLARATION_NON_AUTORISEE'};}
   const hash=crypto.createHash('sha256').update(x.bytes).digest('hex');
   const already=await c.query(`SELECT id,declaration_id,nom_original,mime_type,taille_octets,qualification,date_creation,sha256
     FROM energy_billing_attachments WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,x.requestKey]);
   if(already.rows.length){await c.query('ROLLBACK');const a=already.rows[0];return a.declaration_id===x.declarationId&&a.sha256===hash&&a.mime_type===x.mime?{code:'OK',nouveau:false,fichier:dto(a)}:{code:'CLE_REUTILISEE'};}
   const count=await c.query(`SELECT COUNT(*)::int AS n FROM energy_billing_attachments WHERE declaration_id=$1 AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[x.declarationId,...scope(s)]);
   if(Number(count.rows[0].n)>=5){await c.query('ROLLBACK');return {code:'LIMITE_5_FICHIERS'};}
   const fileId=crypto.randomUUID(),name=sanitizeName(x.name,x.mime);
   const record={fileId,tenant:s.tenant_id,owner:s.owner_personne_id,site:s.id,declarationId:x.declarationId,mime:x.mime,bytes:x.bytes};
   created=fileId;await vault.save(record);
   const inserted=await c.query(`INSERT INTO energy_billing_attachments
    (id,site_id,tenant_id,owner_personne_id,declaration_id,nom_original,mime_type,taille_octets,sha256,auteur_personne_id,request_key)
    VALUES($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9,$10,$11::uuid)
    RETURNING id,declaration_id,nom_original,mime_type,taille_octets,qualification,date_creation`,
    [fileId,...scope(s),x.declarationId,name,x.mime,x.bytes.length,hash,x.actor,x.requestKey]);
   await c.query(`INSERT INTO energy_billing_attachment_events
    (attachment_id,site_id,tenant_id,owner_personne_id,acteur_personne_id,action)
    VALUES($1::uuid,$2,$3,$4,$5,'BillingAttachmentStored.v1')`,[fileId,...scope(s),x.actor]);
   await c.query('COMMIT');done=true;return {code:'OK',nouveau:true,fichier:dto(inserted.rows[0])};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}});}
  catch(e){if(created&&!done)await vault.erase(created).catch(()=>{});throw e;}
 }
 async function telecharger(x){return use(async c=>{const s=await site(c,x);if(!s)return null;
  const r=await c.query(`SELECT id,declaration_id,mime_type,taille_octets,sha256
   FROM energy_billing_attachments WHERE id=$1::uuid AND declaration_id=$2::uuid
     AND site_id=$3 AND tenant_id=$4 AND owner_personne_id=$5`,[x.fileId,x.declarationId,...scope(s)]);
  if(!r.rows.length)return null;const f=r.rows[0];
  const bytes=await vault.read({fileId:f.id,tenant:s.tenant_id,owner:s.owner_personne_id,site:s.id,
    declarationId:x.declarationId,mime:f.mime_type,size:f.taille_octets,sha256:f.sha256});
  return {bytes,mime:f.mime_type};
 });}
 return {lister,creer,telecharger};
}
module.exports={creerBillingEvidenceStore};
