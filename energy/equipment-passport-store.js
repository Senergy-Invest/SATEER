'use strict';
/** Equipment Registry v1 : une fiche par appareil physique déclaré, pas par ligne groupée. */
const crypto=require('node:crypto');
function creerEquipmentPassportStore({obtenirClient,photoVault}){
 if(typeof obtenirClient!=='function'||!photoVault)throw new TypeError('DEPENDANCES_PASSEPORT');
 async function useClient(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return useClient(async c=>{let active=false;try{await c.query('BEGIN');active=true;const r=await fn(c);await c.query('COMMIT');active=false;return r;}catch(e){if(active)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 const passportScope=`FROM energy_equipment_passports p
   JOIN energy_inventory_equipements eq ON eq.id=p.inventaire_equipement_id
     AND eq.site_id=p.site_id AND eq.tenant_id=p.tenant_id AND eq.owner_personne_id=p.owner_personne_id
   JOIN energy_inventory_sites s ON s.id=p.site_id AND s.tenant_id=p.tenant_id AND s.owner_personne_id=p.owner_personne_id
   JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND p.owner_personne_id=$2`;
 const passportCols=`p.id,p.public_id,p.site_id,p.tenant_id,p.owner_personne_id,p.scan_token,p.numero_individuel,p.statut,p.revision,p.date_creation,
    eq.public_id AS inventory_public_id,eq.nom,eq.famille,eq.quantite,eq.puissance_unitaire_w,s.public_id AS site_public_id`;
 function dto(row){return {id:String(row.public_id),siteId:String(row.site_public_id),inventoryId:String(row.inventory_public_id),numeroIndividuel:Number(row.numero_individuel),quantiteDeclaree:Number(row.quantite),nom:row.nom,famille:row.famille,puissanceUnitaireW:row.puissance_unitaire_w,statut:row.statut,revision:Number(row.revision),dateCreation:row.date_creation};}
 async function event(c,row,owner,type,payload){await c.query(`INSERT INTO energy_equipment_passport_events(passeport_id,tenant_id,acteur_personne_id,event_type,payload)
  VALUES ($1,$2,$3,$4,$5::jsonb)`,[row.id,row.tenant_id,owner,type,JSON.stringify(payload)]);}
 async function create({tenant,owner,siteId,inventoryId,numeroIndividuel}){return tx(async c=>{
  const q=await c.query(`SELECT eq.id,eq.site_id,eq.tenant_id,eq.owner_personne_id,eq.quantite
     FROM energy_inventory_equipements eq JOIN energy_inventory_sites s ON s.id=eq.site_id AND s.tenant_id=eq.tenant_id AND s.owner_personne_id=eq.owner_personne_id
     JOIN tenants t ON t.id=eq.tenant_id AND t.actif=TRUE
     WHERE t.code=$1 AND eq.owner_personne_id=$2 AND s.public_id=$3::uuid AND eq.public_id=$4::uuid
     LIMIT 1`,[tenant,owner,siteId,inventoryId]);
  if(!q.rows.length)return {code:'EQUIPEMENT_INACCESSIBLE'};
  const eq=q.rows[0];if(numeroIndividuel>Number(eq.quantite))return {code:'NUMERO_HORS_QUANTITE'};
  const token=crypto.randomBytes(20).toString('base64url');
  const ins=await c.query(`INSERT INTO energy_equipment_passports(public_id,site_id,inventaire_equipement_id,tenant_id,owner_personne_id,numero_individuel,scan_token)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (inventaire_equipement_id,numero_individuel) DO NOTHING RETURNING id,public_id,tenant_id,scan_token`,
     [crypto.randomUUID(),eq.site_id,eq.id,eq.tenant_id,owner,numeroIndividuel,token]);
  let row=ins.rows[0],newly=!!row;
  if(!row){const r=await c.query(`SELECT id,public_id,tenant_id,scan_token FROM energy_equipment_passports
      WHERE inventaire_equipement_id=$1 AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 AND numero_individuel=$5 LIMIT 1`,
     [eq.id,eq.site_id,eq.tenant_id,owner,numeroIndividuel]);
   if(r.rows.length!==1)return {code:'PASSEPORT_CONFLIT'};row=r.rows[0];}
  if(newly)await event(c,row,owner,'EquipmentPassportCreated.v1',{inventoryId,numeroIndividuel,provenance:'DECLAREE',verification:'NON_VERIFIE'});
  return {code:'OK',newly,id:String(row.public_id)};
 });}
 async function list({tenant,owner,siteId}){return useClient(async c=>{
  const r=await c.query(`SELECT ${passportCols} ${passportScope} AND s.public_id=$3::uuid ORDER BY p.date_creation,p.id LIMIT 501`,[tenant,owner,siteId]);
  return {passeports:r.rows.slice(0,500).map(dto),listePartielle:r.rows.length>500};
 });}
 async function getRow(c,{tenant,owner,passportId}){
  const r=await c.query(`SELECT ${passportCols} ${passportScope} AND p.public_id=$3::uuid LIMIT 1`,[tenant,owner,passportId]);return r.rows[0]||null;
 }
 async function full({tenant,owner,passportId}){return useClient(async c=>{
  const row=await getRow(c,{tenant,owner,passportId});if(!row)return null;
  const photos=await c.query(`SELECT id,type_photo,mime_type,taille_octets,date_creation FROM energy_equipment_photos
    WHERE passeport_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 AND date_suppression IS NULL ORDER BY date_creation,id`,
    [row.id,row.tenant_id,owner]);
  return {passeport:dto(row),scanToken:row.scan_token,photos:photos.rows.map(p=>({id:String(p.id),type:p.type_photo,mime:p.mime_type,taille:Number(p.taille_octets),dateCreation:p.date_creation}))};
 });}
 async function scan({tenant,owner,token}){return useClient(async c=>{
  const r=await c.query(`SELECT p.public_id FROM energy_equipment_passports p JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
  WHERE t.code=$1 AND p.owner_personne_id=$2 AND p.scan_token=$3 LIMIT 1`,[tenant,owner,token]);
  if(r.rows.length!==1)return null;const id=String(r.rows[0].public_id);
  const row=await getRow(c,{tenant,owner,passportId:id});return row?{passeport:dto(row)}:null;
 });}
 async function addPhoto({tenant,owner,passportId,type,bytes,mime}){
  const photoId=crypto.randomUUID();let written=false;
  try{return await tx(async c=>{
    const p=await getRow(c,{tenant,owner,passportId});if(!p)return {code:'PASSEPORT_INTROUVABLE'};
    const r=await c.query(`SELECT COUNT(*)::int AS n FROM energy_equipment_photos WHERE passeport_id=$1 AND date_suppression IS NULL`,[p.id]);
    if(Number(r.rows[0].n)>=4)return {code:'MAX_PHOTOS_ATTEINT'};
    await photoVault.save({bytes,owner,passportId,photoId,type,mime});written=true;
    await c.query(`INSERT INTO energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id,type_photo,mime_type,taille_octets)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[photoId,p.id,p.tenant_id,owner,type,mime,bytes.length]);
    await event(c,p,owner,'EquipmentPhotoAdded.v1',{photoId,type,mime,taille:bytes.length,provenance:'PHOTO_UTILISATEUR_NON_VERIFIEE'});
    return {code:'OK',photoId};
  });}catch(e){if(written)await photoVault.erase(photoId).catch(()=>{});throw e;}
 }
 async function photoMeta(c,{tenant,owner,passportId,photoId}){
  const p=await getRow(c,{tenant,owner,passportId});if(!p)return null;
  const r=await c.query(`SELECT id,type_photo,mime_type,taille_octets FROM energy_equipment_photos
    WHERE id=$1::uuid AND passeport_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 AND date_suppression IS NULL LIMIT 1`,
    [photoId,p.id,p.tenant_id,owner]);return r.rows.length?{row:r.rows[0],p}:null;
 }
 async function readPhoto({tenant,owner,passportId,photoId}){return useClient(async c=>{
  const match=await photoMeta(c,{tenant,owner,passportId,photoId});if(!match)return null;
  const meta=match.row;
  const bytes=await photoVault.read({owner,passportId,photoId,type:meta.type_photo,mime:meta.mime_type});
  if(bytes.length!==Number(meta.taille_octets))throw Error('PHOTO_TAILLE_INCOHERENTE');
  return {bytes,mime:meta.mime_type};
 });}
 async function removePhoto({tenant,owner,passportId,photoId}){
  const result=await tx(async c=>{
   const match=await photoMeta(c,{tenant,owner,passportId,photoId});if(!match)return {code:'PHOTO_INTROUVABLE'};
   await c.query('UPDATE energy_equipment_photos SET date_suppression=NOW() WHERE id=$1',[photoId]);
   await event(c,match.p,owner,'EquipmentPhotoRemoved.v1',{photoId,motif:'SUPPRESSION_DEMANDEE_PAR_PROPRIETAIRE'});
   return {code:'OK'};
  });
  if(result.code==='OK')await photoVault.erase(photoId).catch(()=>{/* fichier chiffré orphelin : aucune nouvelle exposition, opération de réparation à documenter */});
  return result;
 }
 return {create,list,full,scan,addPhoto,readPhoto,removePhoto};
}
module.exports={creerEquipmentPassportStore};
