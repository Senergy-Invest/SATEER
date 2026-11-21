'use strict';
/** E-METER-1C1 : nouvelle declaration canonique a chaque revision, registre append-only. */
const crypto=require('node:crypto');
const {equivalentes}=require('./energy-billing-revision-domain');
const uuid=()=>crypto.randomUUID();
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
function creerEnergyBillingRevisionStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_PG_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let started=false;try{await c.query('BEGIN');started=true;
  const r=await fn(c);await c.query('COMMIT');started=false;return r;
 }catch(e){if(started)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,{tenant,actor,siteId}){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.tenant_id,s.owner_personne_id
    FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1`,[tenant,siteId,actor]);
  return r.rows[0]||null;
 }
 const scope=s=>[s.id,s.tenant_id,s.owner_personne_id];
 const fields=`d.id,d.nature,d.energie,to_char(d.date_document,'YYYY-MM-DD') AS date_document,
 to_char(d.periode_debut,'YYYY-MM-DD') AS periode_debut,to_char(d.periode_fin,'YYYY-MM-DD') AS periode_fin,
 d.devise,d.montant::text AS montant,d.point_id,d.meter_id,d.reference_document,d.reference_justificatif`;
 function dto(r){return {id:String(r.id),nature:r.nature,energie:r.energie,dateDocument:r.date_document,
  periodeDebut:r.periode_debut||null,periodeFin:r.periode_fin||null,devise:r.devise.trim(),montant:r.montant,
  pointId:r.point_id?String(r.point_id):null,meterId:r.meter_id?String(r.meter_id):null,
  referenceDocument:r.reference_document||null,referenceJustificatif:r.reference_justificatif||null};}
 async function original(c,s,declarationId,lock=false){
  const r=await c.query(`SELECT ${fields} FROM energy_billing_declarations d
   WHERE d.id=$1::uuid AND d.site_id=$2 AND d.tenant_id=$3 AND d.owner_personne_id=$4
   LIMIT 1 ${lock?'FOR UPDATE OF d':''}`,[declarationId,...scope(s)]);
  return r.rows[0]||null;
 }
 async function statut(c,s,declarationId){
  const r=await c.query(`SELECT 1 FROM energy_billing_rectifications
   WHERE corrected_declaration_id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 LIMIT 1`,[declarationId,...scope(s)]);
  return r.rows.length>0;
 }
 async function revisions(c,s,declarationId){
  const r=await c.query(`SELECT r.id AS revision_id,r.revision,r.motif,r.date_creation,
    ${fields} FROM energy_billing_rectifications r
   JOIN energy_billing_declarations d ON d.id=r.corrected_declaration_id
    AND d.site_id=r.site_id AND d.tenant_id=r.tenant_id AND d.owner_personne_id=r.owner_personne_id
   WHERE r.original_declaration_id=$1::uuid AND r.site_id=$2 AND r.tenant_id=$3 AND r.owner_personne_id=$4
   ORDER BY r.revision ASC LIMIT 21`,[declarationId,...scope(s)]);
  return r.rows;
 }
 async function lister({tenant,actor,siteId,offset=0}){return using(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(`SELECT d.id AS original_id,
     COALESCE(c.id,d.id) AS actuel_id,
     COALESCE(c.nature,d.nature) AS nature, COALESCE(c.energie,d.energie) AS energie,
     to_char(COALESCE(c.date_document,d.date_document),'YYYY-MM-DD') AS date_document,
     COALESCE(c.montant,d.montant)::text AS montant,
     COALESCE(c.devise,d.devise) AS devise,COALESCE(rev.revision,0) AS revision
    FROM energy_billing_declarations d
    LEFT JOIN LATERAL (
      SELECT x.corrected_declaration_id,x.revision
      FROM energy_billing_rectifications x
      WHERE x.original_declaration_id=d.id AND x.site_id=d.site_id AND x.tenant_id=d.tenant_id
      AND x.owner_personne_id=d.owner_personne_id ORDER BY x.revision DESC LIMIT 1
    ) rev ON true
    LEFT JOIN energy_billing_declarations c ON c.id=rev.corrected_declaration_id
      AND c.site_id=d.site_id AND c.tenant_id=d.tenant_id AND c.owner_personne_id=d.owner_personne_id
    WHERE d.site_id=$1 AND d.tenant_id=$2 AND d.owner_personne_id=$3
    AND NOT EXISTS(SELECT 1 FROM energy_billing_rectifications child WHERE child.corrected_declaration_id=d.id
     AND child.site_id=d.site_id AND child.tenant_id=d.tenant_id AND child.owner_personne_id=d.owner_personne_id)
    ORDER BY d.date_document DESC,d.id LIMIT 51 OFFSET $4`,[...scope(s),offset]);
  return {site:{id:String(s.public_id),nom:s.nom},declarations:r.rows.slice(0,50).map(x=>({
   originalId:String(x.original_id),actuelId:String(x.actuel_id),nature:x.nature,energie:x.energie,
   dateDocument:x.date_document instanceof Date?x.date_document.toISOString().slice(0,10):String(x.date_document).slice(0,10),
   montant:x.montant,devise:x.devise.trim(),revision:Number(x.revision)
  })),offset,limite:50,suivant:r.rows.length>50,comptageSansDoublon:true,
  aucunePieceTransfereeAutomatiquement:true,calculsDisponibles:false};
 });}
 async function get({tenant,actor,siteId,declarationId}){return using(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const first=await original(c,s,declarationId);if(!first||await statut(c,s,declarationId))return null;
  const rs=await revisions(c,s,declarationId);
  return {site:{id:String(s.public_id),nom:s.nom},original:dto(first),
   actuel:rs.length?dto(rs[rs.length-1]):dto(first),revisionActuelle:rs.length?rs[rs.length-1].revision:0,
   revisions:rs.map(r=>({id:String(r.revision_id),revision:r.revision,motif:r.motif,
    dateCreation:r.date_creation,declaration:dto(r)})),
   piecesTransfereesAutomatiquement:false,qualification:'DECLARE_A_VERIFIER',calculsDisponibles:false};
 });}
 async function creer({tenant,actor,siteId,declarationId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return {code:'SITE_NON_AUTORISE'};
  // Verrou par declaration racine ; toutes les revisions sont serialisees.
  const first=await original(c,s,declarationId,true);
  if(!first||await statut(c,s,declarationId))return {code:'DECLARATION_NON_AUTORISEE'};
  const digest=hash(data);
  const prior=await c.query(`SELECT id,corrected_declaration_id,revision,content_hash FROM energy_billing_rectifications
    WHERE original_declaration_id=$1::uuid AND site_id=$2 AND owner_personne_id=$3 AND request_key=$4::uuid LIMIT 1`,
    [declarationId,s.id,s.owner_personne_id,requestKey]);
  if(prior.rows.length){const p=prior.rows[0];return p.content_hash===digest?
   {code:'OK',revisionId:String(p.id),id:String(p.corrected_declaration_id),revision:p.revision,nouveau:false}:
   {code:'CLE_REUTILISEE'};}
  const rs=await revisions(c,s,declarationId);
  const current=rs.length?dto(rs[rs.length-1]):dto(first);
  if(equivalentes(current,data.valeurs))return {code:'AUCUNE_MODIFICATION'};
  const revision=rs.length+1;if(revision>20)return {code:'LIMITE_REVISIONS'};
  const v=data.valeurs;
  if(v.pointId){const p=await c.query(`SELECT energie FROM energy_meter_points
    WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[v.pointId,...scope(s)]);
    if(!p.rows.length)return {code:'POINT_NON_AUTORISE'};
    if(p.rows[0].energie!==v.energie)return {code:'ENERGIE_POINT_DIFFERENTE'};
  }
  if(v.meterId){const m=await c.query(`SELECT 1 FROM energy_meter_devices
    WHERE id=$1::uuid AND point_id=$2::uuid AND site_id=$3 AND tenant_id=$4 AND owner_personne_id=$5`,
    [v.meterId,v.pointId,...scope(s)]);if(!m.rows.length)return {code:'COMPTEUR_NON_AUTORISE'};}
  const nextId=uuid(),revisionId=uuid();
  const ins=await c.query(`INSERT INTO energy_billing_declarations
   (id,site_id,tenant_id,owner_personne_id,point_id,meter_id,nature,energie,date_document,periode_debut,periode_fin,
    devise,montant,reference_document,reference_justificatif,auteur_personne_id,request_key,content_hash)
    VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9::date,$10::date,$11::date,$12,$13::numeric,$14,$15,$16,$17::uuid,$18)
    ON CONFLICT DO NOTHING RETURNING id`,
    [nextId,...scope(s),v.pointId,v.meterId,v.nature,v.energie,v.dateDocument,v.periodeDebut,v.periodeFin,
     v.devise,v.montant,v.referenceDocument,v.referenceJustificatif,actor,requestKey,hash(v)]);
  if(!ins.rows.length)return {code:'CLE_REUTILISEE'};
  await c.query(`INSERT INTO energy_billing_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
    VALUES($1,$2,$3,$4,'BillingDeclarationRecorded.v1',$5::uuid,$6::jsonb)`,
    [...scope(s),actor,nextId,JSON.stringify({origine:'RECTIFICATION',originalId:declarationId,revision})]);
  await c.query(`INSERT INTO energy_billing_rectifications
   (id,site_id,tenant_id,owner_personne_id,original_declaration_id,corrected_declaration_id,revision,
    motif,acteur_personne_id,request_key,content_hash)
    VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9,$10::uuid,$11)`,
    [revisionId,...scope(s),declarationId,nextId,revision,data.motif,actor,requestKey,digest]);
  return {code:'OK',id:nextId,revisionId,revision,nouveau:true,qualification:'DECLARE_A_VERIFIER',piecesTransfereesAutomatiquement:false};
 });}
 return {get,creer,lister};
}
module.exports={creerEnergyBillingRevisionStore};
