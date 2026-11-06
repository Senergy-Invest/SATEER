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
async function configRight(personneId,org,tenant){
 const check=await verifierPermissionPersonneDatabase({personneId,organisationId:org,tenantCode:tenant,permissionCode:'CREATE_UNIT'});
 return Boolean(check.succes&&check.autorise&&check.portee==='ORGANISATION');
}
const catalogSQL=`SELECT c.id,c.code,c.categorie,c.titre,c.pieces_obligatoires AS "piecesObligatoires",c.delai_indicatif_jours AS "delaiIndicatifJours",c.actif,c.mis_a_jour_le AS "maj"
 FROM organisation_procedure_catalogue c JOIN organisations o ON o.id=c.organisation_id AND o.tenant_id=c.tenant_id
 JOIN tenants t ON t.id=c.tenant_id WHERE c.organisation_id=$1 AND t.code=$2`;
function validPieces(p){return Array.isArray(p)&&p.length<=12&&p.every(x=>DOCUMENT_SET.has(x))&&new Set(p).size===p.length;}
function setup(app,exigerSession){
 const router=express.Router();router.use((req,res,next)=>{res.set('Cache-Control','private,no-store');res.set('X-Content-Type-Options','nosniff');if(!isTest())return status(res,503,'P7_TEST_SEULEMENT');next();});router.use(exigerSession);
 router.get('/catalogue',async(req,res)=>{
  const org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant);
  if(!org||!tenant)return status(res,400,'CONTEXTE_INVALIDE');
  try{if(!await inOrg(req.auth.personneId,org,tenant))return status(res,403,'HORS_ORGANISATION');
   const q=await executerRequete(catalogSQL+' AND c.actif=TRUE ORDER BY c.titre',[org,tenant]);
   return res.json({statut:'CATALOGUE_CHARGE',procedures:q.rows});
  }catch(e){console.error('P7 catalogue',e);return status(res,503,'CATALOGUE_INDISPONIBLE');}
 });
 router.get('/administration',async(req,res)=>{
  const org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant);
  if(!org||!tenant)return status(res,400,'CONTEXTE_INVALIDE');
  try{if(!await configRight(req.auth.personneId,org,tenant))return status(res,403,'CONFIGURATION_INTERDITE');
   const q=await executerRequete(catalogSQL+' ORDER BY c.titre',[org,tenant]);return res.json({statut:'CATALOGUE_ADMIN',procedures:q.rows});
  }catch(e){console.error('P7 administration',e);return status(res,503,'CATALOGUE_INDISPONIBLE');}
 });
 router.put('/administration/:code',async(req,res)=>{
  if(!sameOrigin(req))return status(res,403,'ORIGINE_NON_AUTORISEE');
  const org=validId(req.body?.organisationId),tenant=validTenant(req.body?.tenantCode),code=validCode(req.params.code);
  const cat=req.body?.categorie,titre=req.body?.titre,pieces=req.body?.piecesObligatoires,days=req.body?.delaiIndicatifJours;
  const d=days==null||days===''?null:Number(days);
  if(!org||!tenant||!code||!CATEGORY_SET.has(cat)||typeof titre!=='string'||!titre.trim()||titre.length>160||!validPieces(pieces)||(req.body?.actif===true&&cat==='PASSEPORT'&&pieces.length===0)||
    (d!==null&&(!Number.isInteger(d)||d<1||d>365))||typeof req.body?.actif!=='boolean')return status(res,400,'CONFIGURATION_INVALIDE');
  try{if(!await configRight(req.auth.personneId,org,tenant))return status(res,403,'CONFIGURATION_INTERDITE');
   const q=await executerRequete(`INSERT INTO organisation_procedure_catalogue(tenant_id,organisation_id,code,categorie,titre,pieces_obligatoires,delai_indicatif_jours,actif,valide_par)
   SELECT t.id,o.id,$3,$4,$5,$6,$7,$8,$9 FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND t.code=$2
   ON CONFLICT(organisation_id,code) DO UPDATE SET categorie=EXCLUDED.categorie,titre=EXCLUDED.titre,pieces_obligatoires=EXCLUDED.pieces_obligatoires,delai_indicatif_jours=EXCLUDED.delai_indicatif_jours,actif=EXCLUDED.actif,valide_par=EXCLUDED.valide_par,mis_a_jour_le=now()
   RETURNING id,code,categorie,titre,actif`,[org,tenant,code,cat,titre.trim(),pieces,d,req.body.actif,req.auth.personneId]);
   if(!q.rowCount)return status(res,404,'ORGANISATION_INTROUVABLE');return res.json({statut:'PROCEDURE_CONFIGUREE',procedure:q.rows[0]});
  }catch(e){console.error('P7 config',e);return status(res,503,'CONFIGURATION_INDISPONIBLE');}
 });
 router.get('/preparer',async(req,res)=>{
  const org=validId(req.query.organisationId),tenant=validTenant(req.query.tenant),code=validCode(req.query.code);
  if(!org||!tenant||!code)return status(res,400,'PARAMETRES_INVALIDES');
  try{if(!await inOrg(req.auth.personneId,org,tenant))return status(res,403,'HORS_ORGANISATION');
   const q=await executerRequete(catalogSQL+' AND c.code=$3 AND c.actif=TRUE',[org,tenant,code]);
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
   const q=await client.query(catalogSQL+' AND c.code=$3 AND c.actif=TRUE FOR SHARE',[org,tenant,code]);
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
