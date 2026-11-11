'use strict';
/** SATEER P7 - TEST UNIQUEMENT. Demandes guidees + copies chiffrees par dossier. */
const express=require('express');
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {obtenirClientDatabase,executerRequete}=require('./database');
const {verifierPermissionPersonneDatabase}=require('./auth-authorization');
const {obtenirPermissionsEffectivesDatabase,listerOrganisationsPersonneDatabase}=require('./services-database');
const {decrypt}=require('./private-files-crypto');
const CATEGORY_SET=new Set(['PASSEPORT','CARTE_CONSULAIRE','ETAT_CIVIL','RENDEZ_VOUS','INFORMATION','AUTRE']);
const DOCUMENT_SET=new Set(['CNI_RECTO','CNI_VERSO','PASSEPORT','CARTE_CONSULAIRE','ACTE_NAISSANCE','JUSTIFICATIF_DOMICILE','AUTRE']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
const validTenant=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_-]{1,49}$/.test(x)?x:null;
const validCode=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{2,63}$/.test(x)?x:null;
const status=(res,http,code,extra={})=>res.status(http).json({statut:code,...extra});
const isTest=()=>process.env.PGDATABASE==='sateer_test';
const sameOrigin=req=>Boolean(process.env.SATEER_PUBLIC_ORIGIN)&&req.get('Origin')===process.env.SATEER_PUBLIC_ORIGIN;
function storeRoot(){
 const home=path.join(os.homedir(),'.sateer-private');
 const test=path.join(home,'sateer_test');
 for(const p of [home,test]){
  const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('STOCKAGE_NON_PRIVE');
 }
 return test;
}
function sourcePath(id){if(!uuid.test(id))throw Error('ID_INVALIDE');const dir=path.join(storeRoot(),'citizen-files');const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('STOCKAGE_NON_PRIVE');return path.join(dir,id+'.enc');}
function sharedDir(){const dir=path.join(storeRoot(),'case-files');fs.mkdirSync(dir,{mode:0o700});const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('STOCKAGE_NON_PRIVE');return dir;}
function sharedPath(id){if(!uuid.test(id))throw Error('ID_INVALIDE');return path.join(sharedDir(),id+'.enc');}
async function inOrg(personneId,org,tenant){
 const xs=await listerOrganisationsPersonneDatabase(personneId,tenant);
 return xs.some(x=>Number(x.id)===org);
}
// P3.3.5R : le droit de creer des bureaux n'est pas un prealable a la lecture
// du catalogue. Toutes les decisions sont prises sur le serveur et dans le
// contexte strict organisation + tenant. Aucune permission d'unite n'est globale.
async function droitOrganisation(personneId,org,tenant,permissionCode){
 const check=await verifierPermissionPersonneDatabase({personneId,organisationId:org,tenantCode:tenant,permissionCode});
 return Boolean(check.succes&&check.autorise&&check.portee==='ORGANISATION');
}
async function configRight(personneId,org,tenant){
 // Compatibilite avec la configuration historique P7 : CREATE_UNIT peut editer.
 return droitOrganisation(personneId,org,tenant,'CREATE_UNIT');
}
async function publicationRight(personneId,org,tenant){
 // Validation et publication : permission institutionnelle existante.
 return droitOrganisation(personneId,org,tenant,'MANAGE_PUBLICATIONS');
}
async function catalogueReadRight(personneId,org,tenant){
 // Le superviseur peut inspecter sans obtenir un droit d'edition.
 return (await droitOrganisation(personneId,org,tenant,'VIEW_OPERATIONAL_DASHBOARD'))
    || (await droitOrganisation(personneId,org,tenant,'MANAGE_PROCEDURES'))
    || (await configRight(personneId,org,tenant))
    || (await publicationRight(personneId,org,tenant));
}
async function catalogueEditRight(personneId,org,tenant){
 // Edition : permission dédiée, portée strictement organisationnelle.
 // CREATE_UNIT et MANAGE_PUBLICATIONS ne donnent jamais ce droit indirectement.
 return droitOrganisation(personneId,org,tenant,'MANAGE_PROCEDURES');
}
function adminAction(req){
 const org=validId(req.body?.organisationId),tenant=validTenant(req.body?.tenantCode),code=validCode(req.params.code);
 const revision=req.body?.revision;
 if(!org||!tenant||!code||req.body?.confirmation!==true||typeof revision!=='string'||
    !/^\d{10}\.\d{6}$/.test(revision))return null;
 return {org,tenant,code,revision};
}
const catalogSQL=`SELECT c.id,c.code,c.categorie,c.titre,c.pieces_obligatoires AS "piecesObligatoires",c.delai_indicatif_jours AS "delaiIndicatifJours",c.actif,c.mis_a_jour_le AS "maj",EXTRACT(EPOCH FROM c.mis_a_jour_le)::numeric(19,6)::text AS "revision",
 c.valide_par AS "validePar",c.validation_explicite AS "validationExplicite",c.date_validation AS "validationLe",c.date_publication AS "publicationLe",
 CASE WHEN c.actif AND c.validation_explicite AND c.valide_par IS NOT NULL THEN 'PUBLIEE'
      WHEN c.actif THEN 'A_REVALIDER'
      WHEN c.validation_explicite AND c.valide_par IS NOT NULL THEN 'VALIDEE'
      ELSE 'BROUILLON' END AS etat
 FROM organisation_procedure_catalogue c JOIN organisations o ON o.id=c.organisation_id AND o.tenant_id=c.tenant_id
 JOIN tenants t ON t.id=c.tenant_id WHERE c.organisation_id=$1 AND t.code=$2`;
function validPieces(p){return Array.isArray(p)&&p.length<=12&&p.every(x=>DOCUMENT_SET.has(x))&&new Set(p).size===p.length;}
function setup(app,exigerSession){
 const router=express.Router();router.use((req,res,next)=>{res.set('Cache-Control','private,no-store');res.set('X-Content-Type-Options','nosniff');if(!isTest())return status(res,503,'P7_TEST_SEULEMENT');next();});router.use(exigerSession);
 router.get('/catalogue',async(req,res)=>{
  const org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant);
  if(!org||!tenant)return status(res,400,'CONTEXTE_INVALIDE');
  try{if(!await inOrg(req.auth.personneId,org,tenant))return status(res,403,'HORS_ORGANISATION');
   const q=await executerRequete(catalogSQL+' AND c.actif=TRUE AND c.validation_explicite=TRUE AND c.valide_par IS NOT NULL ORDER BY c.titre',[org,tenant]);
   return res.json({statut:'CATALOGUE_CHARGE',procedures:q.rows});
  }catch(e){console.error('P7 catalogue',e);return status(res,503,'CATALOGUE_INDISPONIBLE');}
 });
 router.get('/administration',async(req,res)=>{
  const org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant);
  if(!org||!tenant)return status(res,400,'CONTEXTE_INVALIDE');
  try{if(!await catalogueReadRight(req.auth.personneId,org,tenant))return status(res,403,'CONFIGURATION_INTERDITE');
   const q=await executerRequete(catalogSQL+' ORDER BY c.titre',[org,tenant]);return res.json({statut:'CATALOGUE_ADMIN',procedures:q.rows});
  }catch(e){console.error('P7 administration',e);return status(res,503,'CATALOGUE_INDISPONIBLE');}
 });
 // Enregistrer ne vaut JAMAIS validation. Toute modification retire automatiquement
 // la fiche de la publication, y compris pour une fiche déjà publiée.
 router.put('/administration/:code',async(req,res)=>{
  if(!sameOrigin(req))return status(res,403,'ORIGINE_NON_AUTORISEE');
  const org=validId(req.body?.organisationId),tenant=validTenant(req.body?.tenantCode),code=validCode(req.params.code);
  const cat=req.body?.categorie,titre=req.body?.titre,pieces=req.body?.piecesObligatoires,days=req.body?.delaiIndicatifJours;
  const d=days==null||days===''?null:Number(days);
  const revision=req.body?.revision??null;
  // L'ancien champ actif est interdit à TRUE : impossible de publier par un PUT historique.
  if(!org||!tenant||!code||!CATEGORY_SET.has(cat)||typeof titre!=='string'||!titre.trim()||titre.length>160||
     !validPieces(pieces)||(d!==null&&(!Number.isInteger(d)||d<1||d>365))||req.body?.actif===true||
     (revision!==null&&(typeof revision!=='string'||!/^\d{10}\.\d{6}$/.test(revision))))
   return status(res,400,'CONFIGURATION_INVALIDE');
  try{
   if(!await catalogueEditRight(req.auth.personneId,org,tenant))return status(res,403,'CONFIGURATION_INTERDITE');
   const q=await executerRequete(`INSERT INTO organisation_procedure_catalogue
    (tenant_id,organisation_id,code,categorie,titre,pieces_obligatoires,delai_indicatif_jours,actif,valide_par,validation_explicite,date_validation,date_publication)
    SELECT t.id,o.id,$3,$4,$5,$6,$7,FALSE,NULL,FALSE,NULL,NULL
    FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND t.code=$2
    ON CONFLICT(organisation_id,code) DO UPDATE SET
      categorie=EXCLUDED.categorie,titre=EXCLUDED.titre,pieces_obligatoires=EXCLUDED.pieces_obligatoires,
      delai_indicatif_jours=EXCLUDED.delai_indicatif_jours,actif=FALSE,valide_par=NULL,
      validation_explicite=FALSE,date_validation=NULL,date_publication=NULL,mis_a_jour_le=now()
    WHERE organisation_procedure_catalogue.tenant_id=EXCLUDED.tenant_id
      AND $8::numeric IS NOT NULL
      AND EXTRACT(EPOCH FROM organisation_procedure_catalogue.mis_a_jour_le)::numeric(19,6)=$8::numeric
    RETURNING id,code,categorie,titre,actif,mis_a_jour_le AS "maj",EXTRACT(EPOCH FROM mis_a_jour_le)::numeric(19,6)::text AS "revision"`,
    [org,tenant,code,cat,titre.trim(),pieces,d,revision]);
   if(!q.rowCount)return status(res,409,'FICHE_EXISTANTE_MODIFIEE_OU_ORGANISATION_ABSENTE');
   return res.json({statut:'BROUILLON_ENREGISTRE',procedure:{...q.rows[0],etat:'BROUILLON'}});
  }catch(e){console.error('P7 brouillon',e);return status(res,503,'CONFIGURATION_INDISPONIBLE');}
 });
 // Confirmation explicite et vérifiée sur serveur. Revision optimiste : une modification
 // entre l'ouverture de la page et la validation invalide la demande de validation.
 router.post('/administration/:code/valider',async(req,res)=>{
  if(!sameOrigin(req))return status(res,403,'ORIGINE_NON_AUTORISEE');
  const ctx=adminAction(req);if(!ctx)return status(res,400,'VALIDATION_INVALIDE');
  try{
   if(!await publicationRight(req.auth.personneId,ctx.org,ctx.tenant))return status(res,403,'VALIDATION_INTERDITE');
   const q=await executerRequete(`UPDATE organisation_procedure_catalogue c
    SET valide_par=$4,validation_explicite=TRUE,date_validation=now(),actif=FALSE,
        date_publication=NULL,mis_a_jour_le=now()
    WHERE c.organisation_id=$1 AND c.code=$3 AND EXTRACT(EPOCH FROM c.mis_a_jour_le)::numeric(19,6)=$5::numeric
      AND c.actif=FALSE AND c.validation_explicite=FALSE
      AND (c.categorie<>'PASSEPORT' OR cardinality(c.pieces_obligatoires)>0)
      AND NOT ('AUTRE'=ANY(c.pieces_obligatoires))
      AND EXISTS (SELECT 1 FROM organisations o JOIN tenants t ON t.id=o.tenant_id
        WHERE o.id=c.organisation_id AND t.id=c.tenant_id AND t.code=$2)
    RETURNING c.id,c.code,c.mis_a_jour_le AS "maj",EXTRACT(EPOCH FROM mis_a_jour_le)::numeric(19,6)::text AS "revision"`,
    [ctx.org,ctx.tenant,ctx.code,req.auth.personneId,ctx.revision]);
   if(!q.rowCount)return status(res,409,'FICHE_MODIFIEE_OU_NON_VALIDABLE');
   return res.json({statut:'FICHE_VALIDEE',procedure:{...q.rows[0],etat:'VALIDEE'}});
  }catch(e){console.error('P7 validation',e);return status(res,503,'VALIDATION_INDISPONIBLE');}
 });
 router.post('/administration/:code/publier',async(req,res)=>{
  if(!sameOrigin(req))return status(res,403,'ORIGINE_NON_AUTORISEE');
  const ctx=adminAction(req);if(!ctx)return status(res,400,'PUBLICATION_INVALIDE');
  try{
   if(!await publicationRight(req.auth.personneId,ctx.org,ctx.tenant))return status(res,403,'PUBLICATION_INTERDITE');
   const q=await executerRequete(`UPDATE organisation_procedure_catalogue c
    SET actif=TRUE,date_publication=now(),mis_a_jour_le=now()
    WHERE c.organisation_id=$1 AND c.code=$3 AND EXTRACT(EPOCH FROM c.mis_a_jour_le)::numeric(19,6)=$4::numeric
      AND c.actif=FALSE AND c.validation_explicite=TRUE AND c.valide_par IS NOT NULL
      AND EXISTS (SELECT 1 FROM organisations o JOIN tenants t ON t.id=o.tenant_id
        WHERE o.id=c.organisation_id AND t.id=c.tenant_id AND t.code=$2)
    RETURNING c.id,c.code,c.mis_a_jour_le AS "maj",EXTRACT(EPOCH FROM mis_a_jour_le)::numeric(19,6)::text AS "revision"`,
    [ctx.org,ctx.tenant,ctx.code,ctx.revision]);
   if(!q.rowCount)return status(res,409,'FICHE_NON_VALIDEE_OU_MODIFIEE');
   return res.json({statut:'FICHE_PUBLIEE',procedure:{...q.rows[0],etat:'PUBLIEE'}});
  }catch(e){console.error('P7 publication',e);return status(res,503,'PUBLICATION_INDISPONIBLE');}
 });
 router.post('/administration/:code/retirer',async(req,res)=>{
  if(!sameOrigin(req))return status(res,403,'ORIGINE_NON_AUTORISEE');
  const ctx=adminAction(req);if(!ctx)return status(res,400,'RETRAIT_INVALIDE');
  try{
   if(!await publicationRight(req.auth.personneId,ctx.org,ctx.tenant))return status(res,403,'PUBLICATION_INTERDITE');
   const q=await executerRequete(`UPDATE organisation_procedure_catalogue c
    SET actif=FALSE,date_publication=NULL,mis_a_jour_le=now()
    WHERE c.organisation_id=$1 AND c.code=$3 AND EXTRACT(EPOCH FROM c.mis_a_jour_le)::numeric(19,6)=$4::numeric AND c.actif=TRUE
      AND EXISTS (SELECT 1 FROM organisations o JOIN tenants t ON t.id=o.tenant_id
        WHERE o.id=c.organisation_id AND t.id=c.tenant_id AND t.code=$2)
    RETURNING c.id,c.code,c.mis_a_jour_le AS "maj",EXTRACT(EPOCH FROM mis_a_jour_le)::numeric(19,6)::text AS "revision"`,
    [ctx.org,ctx.tenant,ctx.code,ctx.revision]);
   if(!q.rowCount)return status(res,409,'FICHE_DEJA_RETIREE_OU_MODIFIEE');
   return res.json({statut:'FICHE_RETIREE',procedure:{...q.rows[0],etat:'A_REVALIDER_OU_VALIDEE'}});
  }catch(e){console.error('P7 retrait',e);return status(res,503,'RETRAIT_INDISPONIBLE');}
 });
 router.get('/preparer',async(req,res)=>{
  const org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant),code=validCode(req.query.code);
  if(!org||!tenant||!code)return status(res,400,'PARAMETRES_INVALIDES');
  try{if(!await inOrg(req.auth.personneId,org,tenant))return status(res,403,'HORS_ORGANISATION');
   const q=await executerRequete(catalogSQL+' AND c.code=$3 AND c.actif=TRUE AND c.validation_explicite=TRUE AND c.valide_par IS NOT NULL',[org,tenant,code]);
   if(!q.rowCount)return status(res,404,'PROCEDURE_NON_CONFIGUREE');
   const files=await executerRequete(`SELECT id,categorie,nom_original AS nom,date_creation AS "dateCreation" FROM citizen_private_files WHERE personne_id=$1 ORDER BY date_creation DESC LIMIT 50`,[req.auth.personneId]);
   const proc=q.rows[0];const pieces=proc.piecesObligatoires.map(cat=>({categorie:cat,documents:files.rows.filter(f=>f.categorie===cat)}));
   return res.json({statut:'DOSSIER_PREPARE',procedure:proc,pieces,manquantes:pieces.filter(x=>!x.documents.length).map(x=>x.categorie)});
  }catch(e){console.error('P7 preparer',e);return status(res,503,'PREPARATION_INDISPONIBLE');}
 });
 router.post('/envoyer',async(req,res)=>{
  if(!sameOrigin(req))return status(res,403,'ORIGINE_NON_AUTORISEE');
  const org=validId(req.body?.organisationId),tenant=validTenant(req.body?.tenantCode),code=validCode(req.body?.code);
  const ids=req.body?.documentIds,confirmation=req.body?.confirmation;
  if(!org||!tenant||!code||confirmation!==true||!Array.isArray(ids)||ids.length>15||new Set(ids).size!==ids.length||ids.some(x=>!uuid.test(String(x))))return status(res,400,'ENVOI_INVALIDE');
  const note=typeof req.body?.note==='string'?req.body.note.trim():'';
  if(note.length>1000)return status(res,400,'NOTE_TROP_LONGUE');
  let client;const written=[];let caseId=null;
  try{
   if(!await inOrg(req.auth.personneId,org,tenant))return status(res,403,'HORS_ORGANISATION');
   client=await obtenirClientDatabase();await client.query('BEGIN');
   const q=await client.query(catalogSQL+' AND c.code=$3 AND c.actif=TRUE AND c.validation_explicite=TRUE AND c.valide_par IS NOT NULL FOR SHARE',[org,tenant,code]);
   if(!q.rowCount){await client.query('ROLLBACK');return status(res,409,'PROCEDURE_NON_CONFIGUREE');}
   const proc=q.rows[0];
   const documents=ids.length?(await client.query(`SELECT id,categorie,nom_original,mime_type,taille_octets FROM citizen_private_files WHERE personne_id=$1 AND id=ANY($2::uuid[]) FOR SHARE`,[req.auth.personneId,ids])).rows:[];
   if(documents.length!==ids.length){await client.query('ROLLBACK');return status(res,409,'PIECE_ABSENTE_DU_COFFRE');}
   const provided=new Set(documents.map(d=>d.categorie));
   const missing=proc.piecesObligatoires.filter(cat=>!provided.has(cat));
   if(missing.length){await client.query('ROLLBACK');return status(res,409,'PIECES_MANQUANTES',{pieces:missing});}
   const create=await client.query(`INSERT INTO demandes(tenant_id,organisation_id,personne_id,categorie,objet,description,statut,priorite,canal,metadata)
    SELECT t.id,o.id,$3,$4,$5,$6,'NOUVELLE','NORMALE','MON_CONSULAT',jsonb_build_object('procedureCode',$7::text,'catalogueMisAJour',$8::text,'piecesPartagees',$9::int,'delaiIndicatifJours',$10::int,'piecesObligatoires',$11::text[])
    FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND t.code=$2
    RETURNING id,tenant_id`,[org,tenant,req.auth.personneId,proc.categorie,proc.titre,`Démarche guidée : ${proc.titre}. ${note}`.slice(0,1500),code,String(proc.maj),documents.length,proc.delaiIndicatifJours,proc.piecesObligatoires]);
   if(!create.rowCount)throw Error('ORG_ABSENTE');caseId=create.rows[0].id;
   await client.query(`INSERT INTO demande_history(tenant_id,demande_id,auteur_personne_id,ancien_statut,nouveau_statut,action,commentaire)
    VALUES($1,$2,$3,NULL,'NOUVELLE','CREATION','Démarche guidée, pièces explicitement validées par le citoyen.')`,[create.rows[0].tenant_id,caseId,req.auth.personneId]);
   for(const d of documents){
    const ciphertext=await fsp.readFile(sourcePath(d.id));
    // Valider integrite et titulaire avant d'en faire une copie independante du coffre.
    const plain=decrypt(ciphertext,req.auth.personneId,d.id,d.categorie,d.mime_type);
    if(plain.length!==d.taille_octets)throw Error('PIECE_CORROMPUE');
    const sharedId=crypto.randomUUID();const destination=sharedPath(sharedId);
    await fsp.writeFile(destination,ciphertext,{flag:'wx',mode:0o600});written.push(destination);
    await client.query(`INSERT INTO demande_documents_partages(id,demande_id,personne_id,document_source_id,categorie,nom_original,mime_type,taille_octets)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[sharedId,caseId,req.auth.personneId,d.id,d.categorie,d.nom_original,d.mime_type,d.taille_octets]);
   }
   await client.query(`INSERT INTO demande_history(tenant_id,demande_id,auteur_personne_id,action,commentaire,metadata)
     VALUES($1,$2,$3,'PIECES_TRANSMISES','Pièces jointes au dossier selon la sélection du citoyen.',jsonb_build_object('nombre',$4::int))`,[create.rows[0].tenant_id,caseId,req.auth.personneId,documents.length]);
   await client.query('COMMIT');client.release();client=null;
   // Le routage P6 demeure responsable de l'orientation; un echec n'annule pas un dossier enregistre.
   let orientation={statut:'NON_ORIENTEE'};
   try{const {routeNewCitizenCase}=require('./pilot-routing-rules');orientation=await routeNewCitizenCase({demandeId:caseId,organisationId:org,tenantCode:tenant,categorie:proc.categorie,canal:'MON_CONSULAT'});}catch(e){console.error('P7 routing pending',e.message);orientation={statut:'ORIENTATION_EN_ATTENTE'};}
   return res.status(201).json({statut:'DEMANDE_GUIDEE_CREEE',demande:{id:caseId},piecesJointes:documents.length,orientationAutomatique:orientation});
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});for(const f of written)await fsp.unlink(f).catch(()=>{});console.error('P7 envoi',e);return status(res,503,'ENVOI_INDISPONIBLE');}
  finally{if(client)client.release();}
 });
 async function caseAccess(req,caseId,org,tenant){
  const q=await executerRequete(`SELECT d.id,d.personne_id,d.destination_unit_id FROM demandes d JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id JOIN tenants t ON t.id=d.tenant_id WHERE d.id=$1 AND d.organisation_id=$2 AND t.code=$3`,[caseId,org,tenant]);
  if(!q.rowCount)return null;
  const d=q.rows[0];if(Number(d.personne_id)===Number(req.auth.personneId))return d;
  if(!d.destination_unit_id)return null;
  const droits=await obtenirPermissionsEffectivesDatabase(req.auth.personneId,org,tenant);
  if(!droits.succes)return null;
  const unit=(droits.permissionsParUnite||[]).find(p=>Number(p.uniteId)===Number(d.destination_unit_id));
  // Consultation de pieces personnelles : seul un membre explicitement habilite
  // dans l'unite destinataire peut acceder (pas la simple supervision globale).
  const permits=new Set((unit&&unit.permissions)||[]);
  if(!permits.has('VIEW_CASE')&&!permits.has('VIEW_INCOMING'))return null;
  const cap=await executerRequete(`SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id WHERE uc.organisation_unit_id=$1 AND uc.actif=TRUE AND c.actif=TRUE AND c.code='VIEW_INBOX'`,[d.destination_unit_id]);
  return cap.rowCount?d:null;
 }
 // P3.3.5L2 — Supervision organisationnelle des dossiers (lecture seule).
 // Ne donne aucun acces aux pieces jointes et ne modifie ni etat, ni notification.
 async function pilotSupervisionPermise(req, organisationId, tenantCode) {
  const droit=await verifierPermissionPersonneDatabase({
   personneId:req.auth.personneId,organisationId,tenantCode,
   permissionCode:'VIEW_OPERATIONAL_DASHBOARD'
  });
  return Boolean(droit.succes&&droit.autorise&&droit.portee==='ORGANISATION');
 }
 const supervisionScope=`FROM demandes d
  JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
  JOIN tenants t ON t.id=d.tenant_id
  JOIN personnes p ON p.id=d.personne_id`;
 const supervisionScopeWhere='d.organisation_id=$1 AND t.code=$2';
 function supervisionQueryContext(req){
  const org=validId(req.query.organisationId);
  const tenant=validTenant(req.query.tenant);
  return org&&tenant?{org,tenant}:null;
 }
 // P3.3.5N — Pilotage agrégé (lecture seule, permission organisationnelle vérifiée).
 // Les délais ci-dessous sont des anciennetés depuis réception, jamais des délais consulaires promis.
 router.get('/supervision/synthese',async(req,res)=>{
  const ctx=supervisionQueryContext(req);
  if(!ctx)return status(res,400,'CONTEXTE_INVALIDE');
  try{
   if(!await pilotSupervisionPermise(req,ctx.org,ctx.tenant))return status(res,403,'ACCES_REFUSE');
   const scope=`FROM demandes d JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
     JOIN tenants t ON t.id=d.tenant_id`;
   const where='WHERE d.organisation_id=$1 AND t.code=$2';
   const counts=await executerRequete(`SELECT
    COUNT(*) FILTER (WHERE d.statut='NOUVELLE' AND d.destination_unit_id IS NULL)::int AS "aOrienter",
    COUNT(*) FILTER (WHERE d.statut='NOUVELLE' AND d.destination_unit_id IS NOT NULL)::int AS "attentePriseEnCharge",
    COUNT(*) FILTER (WHERE d.statut='EN_COURS')::int AS "enTraitement",
    COUNT(*) FILTER (WHERE d.statut='TRAITEE')::int AS "clotures",
    COUNT(*) FILTER (WHERE d.statut IN ('NOUVELLE','EN_COURS') AND d.priorite='URGENTE')::int AS "urgentsOuverts"
    ${scope} ${where}`,[ctx.org,ctx.tenant]);
   const priorites=await executerRequete(`SELECT d.id,d.objet,d.categorie,d.statut,d.priorite,d.date_creation,
    d.destination_unit_id AS "unitId",u.nom AS "unitName",p.prenom,p.nom
    ${scope}
    JOIN personnes p ON p.id=d.personne_id
    LEFT JOIN organisation_units u ON u.id=d.destination_unit_id AND u.organisation_id=d.organisation_id
    ${where} AND d.statut IN ('NOUVELLE','EN_COURS')
    ORDER BY CASE WHEN d.priorite='URGENTE' THEN 0 ELSE 1 END,
      d.date_creation ASC,d.id ASC LIMIT 5`,[ctx.org,ctx.tenant]);
   const bureaux=await executerRequete(`SELECT d.destination_unit_id AS "unitId",
    COALESCE(u.nom,'Non orienté') AS "unitName",
    COUNT(*) FILTER (WHERE d.statut='NOUVELLE')::int AS "aPrendre",
    COUNT(*) FILTER (WHERE d.statut='EN_COURS')::int AS "enCours",
    COUNT(*) FILTER (WHERE d.priorite='URGENTE')::int AS "urgents"
    ${scope}
    LEFT JOIN organisation_units u ON u.id=d.destination_unit_id AND u.organisation_id=d.organisation_id
    ${where} AND d.statut IN ('NOUVELLE','EN_COURS')
    GROUP BY d.destination_unit_id,u.nom
    ORDER BY COUNT(*) DESC,COALESCE(u.nom,'Non orienté') ASC LIMIT 6`,[ctx.org,ctx.tenant]);
   return res.json({statut:'SYNTHESE_SUPERVISION',comptes:counts.rows[0]||{},
    priorites:priorites.rows,bureaux:bureaux.rows,
    regleAnciennete:'DEPUIS_CREATION',seuilRetardConfigure:false,lectureSeule:true});
  }catch(err){console.error('P335N synthese supervision',err);return status(res,503,'SYNTHESE_INDISPONIBLE');}
 });
 router.get('/supervision/filtres',async(req,res)=>{
  const ctx=supervisionQueryContext(req);
  if(!ctx)return status(res,400,'CONTEXTE_INVALIDE');
  try{
   if(!await pilotSupervisionPermise(req,ctx.org,ctx.tenant))return status(res,403,'ACCES_REFUSE');
   const categories=await executerRequete(`SELECT DISTINCT d.categorie ${supervisionScope} WHERE ${supervisionScopeWhere} AND d.categorie IS NOT NULL ORDER BY d.categorie`,[ctx.org,ctx.tenant]);
   const unites=await executerRequete(`SELECT u.id,u.nom FROM organisation_units u JOIN organisations o ON o.id=u.organisation_id JOIN tenants t ON t.id=o.tenant_id WHERE u.organisation_id=$1 AND t.code=$2 ORDER BY u.nom,u.id`,[ctx.org,ctx.tenant]);
   return res.json({statut:'FILTRES_SUPERVISION',categories:categories.rows.map(x=>x.categorie),unites:unites.rows});
  }catch(err){console.error('P335L2 filtres supervision',err);return status(res,503,'SUPERVISION_INDISPONIBLE');}
 });
 router.get('/supervision/dossiers',async(req,res)=>{
  const ctx=supervisionQueryContext(req);
  if(!ctx)return status(res,400,'CONTEXTE_INVALIDE');
  const pageRaw=String(req.query.page||'1');
  if(!/^[1-9][0-9]{0,3}$/.test(pageRaw))return status(res,400,'PAGE_INVALIDE');
  const page=Number(pageRaw),pageSize=20;
  const etat=String(req.query.statut||'').trim();
  if(etat&&!['NOUVELLE','EN_COURS','TRAITEE'].includes(etat))return status(res,400,'STATUT_INVALIDE');
  const categorie=String(req.query.categorie||'').trim();
  const recherche=String(req.query.q||'').trim();
  const orientation=String(req.query.orientation||'').trim();
  const tri=String(req.query.tri||'ACTIVITE').trim();
  const urgence=String(req.query.urgence||'').trim();
  if(orientation&&!['A_ORIENTER','ATTENTE_AGENT'].includes(orientation))return status(res,400,'ORIENTATION_INVALIDE');
  if(!['ACTIVITE','ANCIENNETE','URGENCE'].includes(tri))return status(res,400,'TRI_INVALIDE');
  if(urgence&&urgence!=='1')return status(res,400,'URGENCE_INVALIDE');
  if(categorie.length>80||recherche.length>100)return status(res,400,'FILTRE_INVALIDE');
  const unite=req.query.unitId?validId(req.query.unitId):null;
  if(req.query.unitId&&!unite)return status(res,400,'UNITE_INVALIDE');
  try{
   if(!await pilotSupervisionPermise(req,ctx.org,ctx.tenant))return status(res,403,'ACCES_REFUSE');
   const args=[ctx.org,ctx.tenant],conditions=[supervisionScopeWhere];
   if(etat){args.push(etat);conditions.push(`d.statut=$${args.length}`);}
   if(categorie){args.push(categorie);conditions.push(`d.categorie=$${args.length}`);}
   if(unite){args.push(unite);conditions.push(`d.destination_unit_id=$${args.length}`);}
   if(orientation==='A_ORIENTER')conditions.push(`d.statut='NOUVELLE' AND d.destination_unit_id IS NULL`);
   if(orientation==='ATTENTE_AGENT')conditions.push(`d.statut='NOUVELLE' AND d.destination_unit_id IS NOT NULL`);
   if(urgence==='1')conditions.push(`d.priorite='URGENTE' AND d.statut IN ('NOUVELLE','EN_COURS')`);
   if(recherche){args.push(recherche);
    conditions.push(`(d.id::text=$${args.length} OR d.objet ILIKE '%' || $${args.length} || '%' OR p.prenom ILIKE '%' || $${args.length} || '%' OR p.nom ILIKE '%' || $${args.length} || '%' OR CONCAT_WS(' ',p.prenom,p.nom) ILIKE '%' || $${args.length} || '%')`);
   }
   const where=' WHERE '+conditions.join(' AND ');
   const ordering={ACTIVITE:'COALESCE(d.date_modification,d.date_creation) DESC,d.id DESC',
    ANCIENNETE:'d.date_creation ASC,d.id ASC',
    URGENCE:"CASE WHEN d.priorite='URGENTE' THEN 0 ELSE 1 END,d.date_creation ASC,d.id ASC"}[tri];
   const total=await executerRequete(`SELECT COUNT(*)::int AS n ${supervisionScope}${where}`,args);
   const rows=await executerRequete(`SELECT d.id,d.objet,d.categorie,d.statut,d.priorite,
      d.date_creation,d.date_modification,d.date_cloture,
      p.prenom,p.nom,d.destination_unit_id AS "unitId",u.nom AS "unitName"
      ${supervisionScope}
      LEFT JOIN organisation_units u ON u.id=d.destination_unit_id AND u.organisation_id=d.organisation_id
      ${where}
      ORDER BY ${ordering}
      LIMIT $${args.length+1} OFFSET $${args.length+2}`,
      [...args,pageSize,(page-1)*pageSize]);
   return res.json({statut:'DOSSIERS_SUPERVISION',dossiers:rows.rows,total:Number(total.rows[0]?.n||0),page,pageSize});
  }catch(err){console.error('P335L2 dossiers supervision',err);return status(res,503,'SUPERVISION_INDISPONIBLE');}
 });
 router.get('/supervision/dossiers/:id',async(req,res)=>{
  const ctx=supervisionQueryContext(req),id=validId(req.params.id);
  if(!ctx||!id)return status(res,400,'PARAMETRES_INVALIDES');
  try{
   if(!await pilotSupervisionPermise(req,ctx.org,ctx.tenant))return status(res,403,'ACCES_REFUSE');
   const dossier=await executerRequete(`SELECT d.id,d.objet,d.description,d.categorie,d.statut,d.priorite,
    d.date_creation,d.date_modification,d.date_cloture,
    d.metadata->'sateer_document'->>'statut' AS "documentStatut",
    p.prenom,p.nom,u.nom AS "unitName"
    ${supervisionScope}
    LEFT JOIN organisation_units u ON u.id=d.destination_unit_id AND u.organisation_id=d.organisation_id
    WHERE ${supervisionScopeWhere} AND d.id=$3`,[ctx.org,ctx.tenant,id]);
   if(!dossier.rowCount)return status(res,404,'DOSSIER_ABSENT_DU_PERIMETRE');
   const base=[ctx.org,ctx.tenant,id];
   const messages=await executerRequete(`SELECT r.id,r.type,r.contenu,r.date_creation,
    auteur.prenom AS auteur_prenom,auteur.nom AS auteur_nom
    FROM demande_reponses r JOIN demandes d ON d.id=r.demande_id AND d.tenant_id=r.tenant_id
    JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
    JOIN tenants t ON t.id=d.tenant_id
    LEFT JOIN personnes auteur ON auteur.id=r.auteur_personne_id
    WHERE d.organisation_id=$1 AND t.code=$2 AND d.id=$3 AND r.visible_citoyen=TRUE
    ORDER BY r.date_creation ASC,r.id ASC LIMIT 100`,base);
   const historique=await executerRequete(`SELECT h.id,h.action,h.commentaire,h.ancien_statut,h.nouveau_statut,h.date_action,
    auteur.prenom AS auteur_prenom,auteur.nom AS auteur_nom
    FROM demande_history h JOIN demandes d ON d.id=h.demande_id AND d.tenant_id=h.tenant_id
    JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
    JOIN tenants t ON t.id=d.tenant_id
    LEFT JOIN personnes auteur ON auteur.id=h.auteur_personne_id
    WHERE d.organisation_id=$1 AND t.code=$2 AND d.id=$3
    ORDER BY h.date_action DESC,h.id DESC LIMIT 100`,base);
   return res.json({statut:'DETAIL_SUPERVISION',dossier:dossier.rows[0],messages:messages.rows,historique:historique.rows,limite:100,lectureSeule:true});
  }catch(err){console.error('P335L2 detail supervision',err);return status(res,503,'DETAIL_SUPERVISION_INDISPONIBLE');}
 });
 // P3.3.5J — Journal Agent. Lecture seule, jamais les pièces privées.
 // Autorisation par l'unité réelle du dossier, pas par une unité demandée arbitrairement.
 router.get('/dossiers/:id/journal-agent',async(req,res)=>{
  const id=validId(req.params.id),org=validId(req.query.organisationId),unitId=validId(req.query.unitId),tenant=validTenant(req.query.tenant);
  if(!id||!org||!unitId||!tenant)return status(res,400,'PARAMETRES_INVALIDES');
  try{
   const dossier=await caseAccess(req,id,org,tenant);
   if(!dossier||Number(dossier.destination_unit_id)!==unitId||Number(dossier.personne_id)===Number(req.auth.personneId))
    return status(res,403,'ACCES_REFUSE');
   // caseAccess vérifie déjà l'autorisation et la capacité VIEW_INBOX du bureau pour tout non-propriétaire.
   const p=[id,org,tenant,unitId];
   const messages=await executerRequete(`
     SELECT r.id,r.contenu,r.type,r.date_creation,
            auteur.prenom AS auteur_prenom,auteur.nom AS auteur_nom
     FROM demande_reponses r
     JOIN demandes d ON d.id=r.demande_id AND d.tenant_id=r.tenant_id
     JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
     JOIN tenants t ON t.id=d.tenant_id
     LEFT JOIN personnes auteur ON auteur.id=r.auteur_personne_id
     WHERE d.id=$1 AND d.organisation_id=$2 AND t.code=$3
       AND d.destination_unit_id=$4 AND r.visible_citoyen=TRUE
     ORDER BY r.date_creation DESC,r.id DESC LIMIT 100`,p);
   const historique=await executerRequete(`
     SELECT h.id,h.action,h.commentaire,h.ancien_statut,h.nouveau_statut,h.date_action,
            auteur.prenom AS auteur_prenom,auteur.nom AS auteur_nom
     FROM demande_history h
     JOIN demandes d ON d.id=h.demande_id AND d.tenant_id=h.tenant_id
     JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
     JOIN tenants t ON t.id=d.tenant_id
     LEFT JOIN personnes auteur ON auteur.id=h.auteur_personne_id
     WHERE d.id=$1 AND d.organisation_id=$2 AND t.code=$3
       AND d.destination_unit_id=$4
     ORDER BY h.date_action DESC,h.id DESC LIMIT 100`,p);
   return res.json({statut:'JOURNAL_AGENT_CHARGE',dossierId:id,
    messages:messages.rows, historique:historique.rows,limite:100});
  }catch(err){console.error('P335J journal agent indisponible',err);
   return status(res,503,'JOURNAL_AGENT_INDISPONIBLE');}
 });
 router.get('/dossiers/:id/suivi',async(req,res)=>{
  const id=validId(req.params.id),org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant);
  if(!id||!org||!tenant)return status(res,400,'PARAMETRES_INVALIDES');
  try{if(!await caseAccess(req,id,org,tenant))return status(res,403,'ACCES_REFUSE');
   const q=await executerRequete(`SELECT d.date_creation, d.statut,
    (d.metadata->>'delaiIndicatifJours')::int AS "delaiIndicatifJours", d.objet AS "procedure",
    (CURRENT_DATE - d.date_creation::date)::int AS "ageJours",
    CASE WHEN d.metadata->>'delaiIndicatifJours' IS NULL THEN NULL
    ELSE (d.date_creation::date + (d.metadata->>'delaiIndicatifJours')::int) END AS "echeanceIndicative"
    FROM demandes d WHERE d.id=$1 AND d.organisation_id=$2`,[id,org]);
   return res.json({statut:'SUIVI_CHARGE',suivi:q.rows[0]||null});
  }catch(e){console.error('P7 suivi',e);return status(res,503,'SUIVI_INDISPONIBLE');}
 });
 router.get('/dossiers/:id/documents',async(req,res)=>{
  const id=validId(req.params.id),org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant);
  if(!id||!org||!tenant)return status(res,400,'PARAMETRES_INVALIDES');
  try{if(!await caseAccess(req,id,org,tenant))return status(res,403,'ACCES_REFUSE');
   const data=await executerRequete(`SELECT id,categorie,nom_original AS nom,mime_type AS format,taille_octets AS taille,date_partage FROM demande_documents_partages WHERE demande_id=$1 ORDER BY date_partage`,[id]);
   return res.json({statut:'PIECES_DOSSIER',documents:data.rows});
  }catch(e){console.error('P7 docs list',e);return status(res,503,'DOCUMENTS_INDISPONIBLES');}
 });
 router.get('/dossiers/:id/documents/:documentId',async(req,res)=>{
  const id=validId(req.params.id),org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant),docId=req.params.documentId;
  if(!id||!org||!tenant||!uuid.test(docId))return status(res,400,'PARAMETRES_INVALIDES');
  try{if(!await caseAccess(req,id,org,tenant))return status(res,403,'ACCES_REFUSE');
   const q=await executerRequete('SELECT * FROM demande_documents_partages WHERE demande_id=$1 AND id=$2',[id,docId]);
   if(!q.rowCount)return status(res,404,'DOCUMENT_INTROUVABLE');
   const d=q.rows[0];const cipher=await fsp.readFile(sharedPath(docId));
   const plain=decrypt(cipher,d.personne_id,d.document_source_id,d.categorie,d.mime_type);
   if(plain.length!==d.taille_octets)throw Error('TAILLE_INCORRECTE');
   const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[d.mime_type];
   if(!ext)throw Error('FORMAT_INVALIDE');
   res.set('Content-Type','application/octet-stream');res.set('Content-Disposition',`attachment; filename="piece-${docId}.${ext}"`);res.set('Content-Length',String(plain.length));return res.end(plain);
  }catch(e){console.error('P7 file read',e.message);return status(res,503,'DOCUMENT_INDISPONIBLE');}
 });
 app.use('/api/pilot-procedures',router);
}
module.exports={setup,CATEGORY_SET,DOCUMENT_SET,validCode,validPieces};
