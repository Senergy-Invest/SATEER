"use strict";
// Adaptateur de persistance du dossier énergétique; aucun droit métier ici.
const crypto=require('node:crypto');
function sha256(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function creerEnergyCaseStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw new TypeError('CLIENT_POSTGRES_REQUIS');
 async function creer({tenant,owner,requestKey,saisie}){
  const client=await obtenirClient();let transaction=false;
  try{
   await client.query('BEGIN');transaction=true;
   const {rows:t}=await client.query('SELECT id FROM tenants WHERE code=$1 AND actif=TRUE',[tenant]);
   if(t.length!==1){await client.query('ROLLBACK');transaction=false;return {code:'TENANT_ABSENT'};}
   const tenantId=Number(t[0].id),hash=sha256(saisie);
   const {rows:r}=await client.query(`INSERT INTO energy_cases(public_id,tenant_id,owner_personne_id,request_key,content_hash,profil,type_site,nom_site,pays,alimentation,compteur,besoins,description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
    ON CONFLICT(tenant_id,owner_personne_id,request_key) DO NOTHING RETURNING id,public_id,date_creation`,
    [crypto.randomUUID(),tenantId,owner,requestKey,hash,saisie.profil,saisie.typeSite,saisie.nomSite,saisie.pays,saisie.alimentation,saisie.compteur,JSON.stringify(saisie.besoins),saisie.description]);
   let row=r[0],nouveau=Boolean(row);
   if(nouveau){await client.query(`INSERT INTO energy_case_events(energy_case_id,tenant_id,actor_personne_id,event_type,event_data)
      VALUES ($1,$2,$3,'EnergyCaseCreated.v1',$4::jsonb)`,[row.id,tenantId,owner,JSON.stringify({source:'SUNU_COURANT',version:1,consentementRecette:true})]);}
   else {
    const {rows:existing}=await client.query('SELECT id,public_id,date_creation,content_hash FROM energy_cases WHERE tenant_id=$1 AND owner_personne_id=$2 AND request_key=$3',[tenantId,owner,requestKey]);
    if(existing.length!==1 || existing[0].content_hash!==hash){await client.query('ROLLBACK');transaction=false;return {code:'CLE_REUTILISEE_POUR_AUTRE_SAISIE'};}
    row=existing[0];
   }
   await client.query('COMMIT');transaction=false;
   return {code:'OK',nouveau,publicId:String(row.public_id),dateCreation:row.date_creation};
  }catch(e){if(transaction)try{await client.query('ROLLBACK');}catch(_){}throw e;}
  finally{client.release();}
 }
 async function lister({tenant,owner}){
  // La portée utilisateur est toujours imposée en SQL, jamais filtrée seulement dans le navigateur.
  const client=await obtenirClient();try{
   const {rows}=await client.query(`SELECT c.public_id,c.profil,c.type_site,c.nom_site,c.pays,c.alimentation,c.compteur,c.besoins,c.description,c.statut,c.date_creation
    FROM energy_cases c JOIN tenants t ON t.id=c.tenant_id
    WHERE t.code=$1 AND t.actif=TRUE AND c.owner_personne_id=$2 ORDER BY c.date_creation DESC,c.id DESC LIMIT 51`,[tenant,owner]);
   return {cases:rows.slice(0,50).map(projeter),autresDisponibles:rows.length>50};
  }finally{client.release();}
 }
 async function obtenir({tenant,owner,publicId}){
  const client=await obtenirClient();try{
   const {rows}=await client.query(`SELECT c.public_id,c.profil,c.type_site,c.nom_site,c.pays,c.alimentation,c.compteur,c.besoins,c.description,c.statut,c.date_creation
    FROM energy_cases c JOIN tenants t ON t.id=c.tenant_id
    WHERE t.code=$1 AND t.actif=TRUE AND c.owner_personne_id=$2 AND c.public_id=$3::uuid LIMIT 1`,[tenant,owner,publicId]);
   return rows.length===1?projeter(rows[0]):null;
  }finally{client.release();}
 }
 return {creer,lister,obtenir};
}
function projeter(r){return {id:String(r.public_id),profil:r.profil,typeSite:r.type_site,nomSite:r.nom_site,pays:r.pays,alimentation:r.alimentation,compteur:r.compteur,besoins:r.besoins,description:r.description,statut:r.statut,dateCreation:r.date_creation};}
module.exports={creerEnergyCaseStore};
