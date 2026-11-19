'use strict';
/** MVP02-B1 — Partage volontaire par code, contributions isolées et arbitrage atomique du propriétaire.
 * Ne donne aucun accès aux photos, au passeport, aux dossiers EnergyCase ou aux API d'inventaire existantes.
 */
const crypto=require('node:crypto');
const {nouveauCode,digestCode}=require('./energy-collaboration-domain');
const uuid=()=>crypto.randomUUID();
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
function creerEnergyCollaborationStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_POSTGRES_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function transaction(fn){return using(async c=>{let inTx=false;try{
  await c.query('BEGIN');inTx=true;const r=await fn(c);await c.query('COMMIT');inTx=false;return r;
 }catch(e){if(inTx)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function ownSite(c,{tenant,actor,siteId}){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.type_site,s.tenant_id,s.owner_personne_id
    FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND s.owner_personne_id=$2 AND s.public_id=$3::uuid LIMIT 1`,[tenant,actor,siteId]);
  return r.rows[0]||null;
 }
 async function event(c,scope,actor,action,id,details={}){
  await c.query(`INSERT INTO energy_inventory_collaboration_events
    (site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_public_id,details)
    VALUES ($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,
    [scope.site_id??scope.id,scope.tenant_id,scope.owner_personne_id,actor,action,id,JSON.stringify(details)]);
 }
 const inviteCols='i.id,i.public_id,i.site_id,i.tenant_id,i.owner_personne_id,i.invitee_personne_id,i.statut,i.expires_at';
 function inviteDTO(i){return {id:String(i.public_id),statut:i.statut,expireLe:i.expires_at,
   acceptePar:i.invitee_personne_id?Number(i.invitee_personne_id):null};}
 async function createInvite({tenant,actor,siteId}){return transaction(async c=>{
  const site=await ownSite(c,{tenant,actor,siteId});if(!site)return {code:'SITE_INACCESSIBLE'};
  // Lock du site : limite d'invitations actives garantie même lors d'appels concurrents.
  await c.query('SELECT id FROM energy_inventory_sites WHERE id=$1 FOR UPDATE',[site.id]);
  const q=await c.query(`SELECT COUNT(*)::int AS n FROM energy_inventory_invitations
    WHERE site_id=$1 AND statut IN ('OUVERTE','ACCEPTEE') AND expires_at>NOW()`,[site.id]);
  if(Number(q.rows[0].n)>=5)return {code:'INVITATIONS_ACTIVES_MAX'};
  const raw=nouveauCode(),id=uuid();
  const r=await c.query(`INSERT INTO energy_inventory_invitations
    (public_id,site_id,tenant_id,owner_personne_id,token_hash,expires_at)
    VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL '48 hours') RETURNING public_id,expires_at`,
    [id,site.id,site.tenant_id,actor,digestCode(raw)]);
  await event(c,site,actor,'InvitationIssued.v1',id,{dureeHeures:48});
  return {code:'OK',invitation:{id:String(r.rows[0].public_id),expireLe:r.rows[0].expires_at},
    codeInvitation:raw}; // Transmis UNE FOIS au responsable, jamais récupérable ensuite.
 });}
 async function listOwnerInvites({tenant,actor,siteId}){return using(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(`SELECT ${inviteCols} FROM energy_inventory_invitations i
    WHERE i.site_id=$1 AND i.tenant_id=$2 AND i.owner_personne_id=$3
    ORDER BY i.id DESC LIMIT 51`,[s.id,s.tenant_id,actor]);
  return {invitations:r.rows.slice(0,50).map(inviteDTO),listePartielle:r.rows.length>50};
 });}
 async function acceptInvite({tenant,actor,codeInvitation}){return transaction(async c=>{
  const q=await c.query(`SELECT ${inviteCols},s.nom AS site_nom,t.code AS tenant_code
    FROM energy_inventory_invitations i
    JOIN energy_inventory_sites s ON s.id=i.site_id AND s.tenant_id=i.tenant_id AND s.owner_personne_id=i.owner_personne_id
    JOIN tenants t ON t.id=i.tenant_id AND t.actif=TRUE
    WHERE i.token_hash=$1 AND t.code=$2 AND i.expires_at>NOW() FOR UPDATE OF i`,[digestCode(codeInvitation),tenant]);
  if(q.rows.length!==1)return {code:'INVITATION_INVALIDE'};
  const i=q.rows[0];
  if(i.owner_personne_id===actor||i.statut==='REVOQUEE'||new Date(i.expires_at).getTime()<=Date.now())return {code:'INVITATION_INVALIDE'};
  if(i.statut==='ACCEPTEE')return i.invitee_personne_id===actor?
    {code:'OK',invitation:{id:String(i.public_id),siteNom:i.site_nom,expireLe:i.expires_at},nouvelle:false}:{code:'INVITATION_INVALIDE'};
  if(i.statut!=='OUVERTE'||i.invitee_personne_id!==null)return {code:'INVITATION_INVALIDE'};
  await c.query(`UPDATE energy_inventory_invitations SET statut='ACCEPTEE',invitee_personne_id=$1,date_acceptation=NOW()
    WHERE id=$2`,[actor,i.id]);
  await event(c,i,actor,'InvitationAccepted.v1',i.public_id,{});
  return {code:'OK',nouvelle:true,invitation:{id:String(i.public_id),siteNom:i.site_nom,expireLe:i.expires_at}};
 });}
 async function revokeInvite({tenant,actor,siteId,invitationId}){return transaction(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return {code:'SITE_INACCESSIBLE'};
  const r=await c.query(`SELECT id,public_id,statut FROM energy_inventory_invitations
    WHERE public_id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 FOR UPDATE`,
    [invitationId,s.id,s.tenant_id,actor]);
  if(r.rows.length!==1)return {code:'INVITATION_INTROUVABLE'};
  if(r.rows[0].statut==='REVOQUEE')return {code:'OK',nouvelle:false};
  await c.query(`UPDATE energy_inventory_invitations SET statut='REVOQUEE',date_revocation=NOW() WHERE id=$1`,[r.rows[0].id]);
  await event(c,s,actor,'InvitationRevoked.v1',invitationId,{});
  return {code:'OK',nouvelle:true};
 });}
 async function listParticipations({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT i.public_id,i.expires_at,s.nom AS site_nom
    FROM energy_inventory_invitations i
    JOIN energy_inventory_sites s ON s.id=i.site_id AND s.tenant_id=i.tenant_id AND s.owner_personne_id=i.owner_personne_id
    JOIN tenants t ON t.id=i.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND i.invitee_personne_id=$2 AND i.statut='ACCEPTEE' AND i.expires_at>NOW()
    ORDER BY i.date_acceptation DESC LIMIT 51`,[tenant,actor]);
  return {participations:r.rows.slice(0,50).map(i=>({invitationId:String(i.public_id),siteNom:i.site_nom,expireLe:i.expires_at})),listePartielle:r.rows.length>50};
 });}
 async function submit({tenant,actor,invitationId,requestKey,saisie}){return transaction(async c=>{
  // Vérifie à chaque écriture la possession de l'invitation et sa validité temporelle.
  const r=await c.query(`SELECT ${inviteCols},s.nom AS site_nom FROM energy_inventory_invitations i
    JOIN energy_inventory_sites s ON s.id=i.site_id AND s.tenant_id=i.tenant_id AND s.owner_personne_id=i.owner_personne_id
    JOIN tenants t ON t.id=i.tenant_id AND t.actif=TRUE
    WHERE i.public_id=$1::uuid AND t.code=$2 AND i.invitee_personne_id=$3
      AND i.statut='ACCEPTEE' AND i.expires_at>NOW() FOR UPDATE OF i`,[invitationId,tenant,actor]);
  if(r.rows.length!==1)return {code:'CONTRIBUTION_NON_AUTORISEE'};
  const i=r.rows[0],digest=hash(saisie),id=uuid();
  // La même clé conserve son résultat même lorsque la limite est atteinte.
  const prior=await c.query(`SELECT public_id,content_hash FROM energy_inventory_contributions
    WHERE invitation_id=$1 AND contributeur_personne_id=$2 AND request_key=$3`,[i.id,actor,requestKey]);
  if(prior.rows.length){return prior.rows[0].content_hash===digest?
    {code:'OK',nouvelle:false,id:String(prior.rows[0].public_id)}:{code:'CLE_REUTILISEE'};}
  const count=await c.query(`SELECT COUNT(*)::int AS n FROM energy_inventory_contributions WHERE invitation_id=$1`,[i.id]);
  if(Number(count.rows[0].n)>=100)return {code:'LIMITE_PROPOSITIONS_ATTEINTE'};
  const ins=await c.query(`INSERT INTO energy_inventory_contributions
    (public_id,invitation_id,site_id,tenant_id,owner_personne_id,contributeur_personne_id,
     request_key,content_hash,nom,famille,quantite,puissance_unitaire_w)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(invitation_id,contributeur_personne_id,request_key) DO NOTHING RETURNING public_id`,
    [id,i.id,i.site_id,i.tenant_id,i.owner_personne_id,actor,requestKey,digest,
     saisie.nom,saisie.famille,saisie.quantite,saisie.puissanceUnitaireW]);
  const nouveau=ins.rows.length===1;
  if(!nouveau){const old=await c.query(`SELECT public_id,content_hash FROM energy_inventory_contributions
     WHERE invitation_id=$1 AND contributeur_personne_id=$2 AND request_key=$3`,[i.id,actor,requestKey]);
    if(old.rows.length!==1||old.rows[0].content_hash!==digest)return {code:'CLE_REUTILISEE'};
    return {code:'OK',nouvelle:false,id:String(old.rows[0].public_id)};
  }
  await event(c,i,actor,'ContributionSubmitted.v1',id,{famille:saisie.famille,quantite:saisie.quantite,provenance:'DECLAREE_NON_VERIFIEE'});
  return {code:'OK',nouvelle:true,id};
 });}
 function contributionDTO(c){return {id:String(c.public_id),invitationId:String(c.invitation_public_id||c.invitation_id),
   nom:c.nom,famille:c.famille,quantite:Number(c.quantite),puissanceUnitaireW:c.puissance_unitaire_w,
   statut:c.statut,dateCreation:c.date_creation,dateDecision:c.date_decision,
   equipmentId:c.equipment_public_id?String(c.equipment_public_id):null};}
 async function listOwnProposals({tenant,actor,invitationId}){return using(async c=>{
  const r=await c.query(`SELECT c.*,i.public_id AS invitation_public_id,e.public_id AS equipment_public_id
    FROM energy_inventory_contributions c JOIN energy_inventory_invitations i ON i.id=c.invitation_id
    JOIN tenants t ON t.id=c.tenant_id AND t.actif=TRUE
    LEFT JOIN energy_inventory_equipements e ON e.id=c.equipment_id
    WHERE t.code=$1 AND c.contributeur_personne_id=$2 AND i.public_id=$3::uuid
     AND i.invitee_personne_id=$2 AND i.statut='ACCEPTEE' AND i.expires_at>NOW()
    ORDER BY c.date_creation DESC,c.id DESC LIMIT 51`,[tenant,actor,invitationId]);
  return {contributions:r.rows.slice(0,50).map(contributionDTO),listePartielle:r.rows.length>50};
 });}
 async function listOwnerProposals({tenant,actor,siteId}){return using(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(`SELECT c.*,i.public_id AS invitation_public_id,e.public_id AS equipment_public_id
    FROM energy_inventory_contributions c JOIN energy_inventory_invitations i ON i.id=c.invitation_id
    LEFT JOIN energy_inventory_equipements e ON e.id=c.equipment_id
    WHERE c.site_id=$1 AND c.tenant_id=$2 AND c.owner_personne_id=$3
    ORDER BY (c.statut='SOUMISE') DESC,c.date_creation DESC,c.id DESC LIMIT 101`,[s.id,s.tenant_id,actor]);
  return {contributions:r.rows.slice(0,100).map(contributionDTO),listePartielle:r.rows.length>100};
 });}
 async function defaultZone(c,site,owner){
  const found=await c.query(`SELECT id FROM energy_inventory_zones
    WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
    ORDER BY CASE WHEN type_zone='BATIMENT' THEN 0 WHEN type_zone='EXTERIEUR' THEN 1 ELSE 2 END,id LIMIT 1`,
    [site.id,site.tenant_id,owner]);
  if(found.rows.length)return found.rows[0].id;
  const kind=site.type_site==='EXPLOITATION_AGRICOLE'?'EXTERIEUR':'BATIMENT';
  const nom=kind==='EXTERIEUR'?'Zone principale (à préciser)':'Emplacement principal (à préciser)';
  const keyBytes=crypto.createHash('sha256').update('SATEER-COLLAB-ZONE-v1:'+site.public_id).digest('hex');
  const requestKey=keyBytes.slice(0,8)+'-'+keyBytes.slice(8,12)+'-4'+keyBytes.slice(13,16)+'-8'+keyBytes.slice(17,20)+'-'+keyBytes.slice(20,32);
  const contenu=hash({typeZone:kind,nom,parentId:null});
  const created=await c.query(`INSERT INTO energy_inventory_zones
    (public_id,site_id,tenant_id,owner_personne_id,parent_id,request_key,content_hash,type_zone,nom)
    VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)
    ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING RETURNING id,public_id`,
    [uuid(),site.id,site.tenant_id,owner,requestKey,contenu,kind,nom]);
  if(created.rows.length){await c.query(`INSERT INTO energy_inventory_events
    (site_id,tenant_id,actor_personne_id,entity_public_id,event_type,payload)
    VALUES ($1,$2,$3,$4,'InventoryZoneDeclared.v1',$5::jsonb)`,
    [site.id,site.tenant_id,owner,created.rows[0].public_id,JSON.stringify({typeZone:kind,nom,provenance:'DECLAREE_AUTO_POUR_CONTRIBUTION'})]);
    return created.rows[0].id;}
  const prior=await c.query(`SELECT id,content_hash FROM energy_inventory_zones
    WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3`,[site.id,owner,requestKey]);
  if(prior.rows.length!==1||prior.rows[0].content_hash!==contenu)throw Error('ZONE_PAR_DEFAUT_CONFLIT');
  return prior.rows[0].id;
 }
 async function review({tenant,actor,siteId,contributionId,decision}){return transaction(async c=>{
  const site=await ownSite(c,{tenant,actor,siteId});if(!site)return {code:'SITE_INACCESSIBLE'};
  const q=await c.query(`SELECT c.* FROM energy_inventory_contributions c
    WHERE c.site_id=$1 AND c.tenant_id=$2 AND c.owner_personne_id=$3 AND c.public_id=$4::uuid FOR UPDATE`,
    [site.id,site.tenant_id,actor,contributionId]);
  if(q.rows.length!==1)return {code:'PROPOSITION_INTROUVABLE'};
  const prop=q.rows[0];
  if(prop.statut!=='SOUMISE')return {code:'DEJA_ARBITREE',statut:prop.statut};
  if(decision==='REFUSER'){
    await c.query(`UPDATE energy_inventory_contributions SET statut='REFUSEE',date_decision=NOW() WHERE id=$1`,[prop.id]);
    await event(c,site,actor,'ContributionRejected.v1',contributionId,{});
    return {code:'OK',statut:'REFUSEE'};
  }
  const zoneId=await defaultZone(c,site,actor);
  const payload={zoneId,nom:prop.nom,famille:prop.famille,quantite:Number(prop.quantite),
    puissanceUnitaireW:prop.puissance_unitaire_w};
  const created=await c.query(`INSERT INTO energy_inventory_equipements
    (public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,
     nom,famille,quantite,puissance_unitaire_w)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING RETURNING id,public_id`,
    [uuid(),site.id,zoneId,site.tenant_id,actor,prop.public_id,hash(payload),
     prop.nom,prop.famille,prop.quantite,prop.puissance_unitaire_w]);
  let item=created.rows[0];
  if(!item){const existing=await c.query(`SELECT id,public_id,content_hash FROM energy_inventory_equipements
    WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3`,[site.id,actor,prop.public_id]);
    if(existing.rows.length!==1||existing.rows[0].content_hash!==hash(payload))throw Error('CONTRIBUTION_COLLISION_CANONIQUE');
    item=existing.rows[0];
  }
  if(created.rows.length)await c.query(`INSERT INTO energy_inventory_events
    (site_id,tenant_id,actor_personne_id,entity_public_id,event_type,payload)
    VALUES ($1,$2,$3,$4,'InventoryEquipmentDeclared.v1',$5::jsonb)`,
    [site.id,site.tenant_id,actor,item.public_id,JSON.stringify({origine:'CONTRIBUTION_ACCEPTEE',contributionId,
     contributeurPersonneId:prop.contributeur_personne_id,verification:'DECLARATIF_NON_MESURE'})]);
  await c.query(`UPDATE energy_inventory_contributions SET statut='ACCEPTEE',equipment_id=$1,date_decision=NOW() WHERE id=$2`,
    [item.id,prop.id]);
  await event(c,site,actor,'ContributionAccepted.v1',contributionId,{equipmentId:String(item.public_id)});
  return {code:'OK',statut:'ACCEPTEE',equipmentId:String(item.public_id)};
 });}
 return {createInvite,listOwnerInvites,acceptInvite,revokeInvite,listParticipations,submit,
   listOwnProposals,listOwnerProposals,review};
}
module.exports={creerEnergyCollaborationStore};
