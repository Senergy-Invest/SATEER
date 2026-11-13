'use strict';
// Lecteur HTTP des seuls e-mails synthetiques du pilote Bordeaux; aucune ecriture.
const express = require('express');
const mailIntent = require('./public/sateer-mail-intent-core');
const guidance = require('./sateer-mail-guidance-core');
const triage = require('./pilot-mail-triage-http');
const { executerRequete } = require('./database');
const { obtenirPermissionsEffectivesDatabase } = require('./services-database');
const ORG = 70;
const TENANT = 'P6V_3B5AC5AB9DB04657';
const PG_SYSTEM_ID = '7699611241381229531';
const validId = raw => /^(?:[1-9][0-9]{0,14})$/.test(String(raw || '')) ? Number(raw) : null;
const deny = (res, code, name) => res.status(code).json({ statut:name });
function createEmailDemoRouter(deps={}) {
 const router = express.Router();
 const query=deps.query || executerRequete;
 const rights=deps.rights || obtenirPermissionsEffectivesDatabase;
 const isTest=deps.isTest || (()=>process.env.PGDATABASE==='sateer_test');
 router.use((req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  if(!isTest())return deny(res,503,'RECEPTION_DEMO_DESACTIVEE');
  if(!req.auth?.personneId)return deny(res,401,'SESSION_REQUISE');
  next();
 });
 router.use(async(req,res,next)=>{
  const org=validId(req.query.organisationId), tenant=req.query.tenant;
  if(org!==ORG || tenant!==TENANT)return deny(res,400,'CONTEXTE_INVALIDE');
  try {
   const d=await rights(Number(req.auth.personneId),ORG,TENANT);
   const permissions=d?.permissionsOrganisation||[];
   if(!d?.succes || !permissions.includes('VIEW_CONSULAR_MAIL_DEMO'))return deny(res,403,'CONSULTATION_INTERDITE');
   const p=await query('SELECT current_database() AS db, system_identifier::text AS sid FROM pg_control_system()');
   if(p.rows[0]?.db!=='sateer_test'||p.rows[0]?.sid!==PG_SYSTEM_ID) return deny(res,503,'INSTANCE_RECETTE_INVALIDE');
   req.demoPermissions=permissions; // droits obtenus côté serveur, jamais du client
   next();
  } catch(e){console.error('EMAIL_DEMO_CONTROL_ERROR',e.message);return deny(res,503,'CONSULTATION_INDISPONIBLE');}
 });
 triage.installTriageRoutes(router,{query,clientFactory:deps.clientFactory});
 router.get('/access',(req,res)=>res.json({statut:'ACCES_COURRIERS_DEMO_AUTORISE',lectureSeule:true,source:'DEMO_SYNTHETIQUE'}));
 router.get('/messages',async(req,res)=>{
  try {
   const p=await query(`SELECT e.id,e.mailbox_key AS "boite",e.from_label AS "expediteur",e.subject AS "objet",e.body AS "texte",e.categorie_proposee AS "categorieProposee",e.motif_qualification AS "motif",e.statut,e.created_at AS "dateReception",u.nom AS "uniteSuggeree"
    FROM pilot_email_inbox_demo e
    JOIN organisations o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
    JOIN tenants t ON t.id=e.tenant_id AND t.code=$2
    LEFT JOIN organisation_units u ON u.id=e.unite_suggeree_id AND u.organisation_id=e.organisation_id
    WHERE e.organisation_id=$1 AND e.source='DEMO_SYNTHETIQUE'
    ORDER BY e.created_at DESC,e.id DESC LIMIT 501`,[ORG,TENANT]);
   if(p.rows.length>500)return deny(res,503,'CAPACITE_RECETTE_DEPASSEE');
   // Ancienne API : pas de contournement de la file filtrée par le serveur.
   const a=[];for(const m of p.rows){if(await triage.secretaryAllowed(req,m,query)){const {texte,...visible}=m;a.push(visible);}}
   return res.json({statut:'COURRIERS_SYNTHETIQUES_CHARGES',enLectureSeule:true, messages:a});
  } catch(e){console.error('EMAIL_DEMO_LIST_ERROR',e.message);return deny(res,503,'COURRIERS_INDISPONIBLES');}
 });
 router.get('/messages/:id',async(req,res)=>{
  const id=validId(req.params.id);if(!id)return deny(res,400,'ID_INVALIDE');
  try {
   const p=await query(`SELECT e.id,e.mailbox_key AS "boite",e.from_label AS "expediteur",e.subject AS "objet",e.body AS "texte",e.categorie_proposee AS "categorieProposee",e.motif_qualification AS "motif",e.statut,e.created_at AS "dateReception",u.nom AS "uniteSuggeree"
    FROM pilot_email_inbox_demo e
    JOIN organisations o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
    JOIN tenants t ON t.id=e.tenant_id AND t.code=$2
    LEFT JOIN organisation_units u ON u.id=e.unite_suggeree_id AND u.organisation_id=e.organisation_id
    WHERE e.id=$3 AND e.organisation_id=$1 AND e.source='DEMO_SYNTHETIQUE'`,[ORG,TENANT,id]);
   if(!p.rowCount)return deny(res,404,'COURRIER_INTROUVABLE');
   if(!await triage.secretaryAllowed(req,p.rows[0],query))return deny(res,403,'COURRIER_HORS_FILE_SECRETARIAT');
   return res.json({statut:'COURRIER_SYNTHETIQUE_CHARGE',enLectureSeule:true,message:p.rows[0]});
  } catch(e){console.error('EMAIL_DEMO_DETAIL_ERROR',e.message);return deny(res,503,'COURRIER_INDISPONIBLE');}
 });
 // Préqualification côté serveur pour le seul courrier synthétique autorisé.
 // Aucune création de dossier, aucune décision d'envoi ou de routage.
 router.get('/messages/:id/qualification',async(req,res)=>{
  const id=validId(req.params.id);if(!id)return deny(res,400,'ID_INVALIDE');
  try {
   const p=await query(`SELECT e.subject AS objet,e.body AS texte
    FROM pilot_email_inbox_demo e
    JOIN organisations o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
    JOIN tenants t ON t.id=e.tenant_id AND t.code=$2
    WHERE e.id=$3 AND e.organisation_id=$1 AND e.source='DEMO_SYNTHETIQUE'`,[ORG,TENANT,id]);
   if(!p.rowCount)return deny(res,404,'COURRIER_INTROUVABLE');
   if(!await triage.secretaryAllowed(req,p.rows[0],query))return deny(res,403,'COURRIER_HORS_FILE_SECRETARIAT');
   const decision=mailIntent.qualifier(p.rows[0].objet,p.rows[0].texte);
   return res.json({statut:'PREQUALIFICATION_SYNTHETIQUE',lectureSeule:true,
    validationHumaineRequise:true,decision});
  } catch(e){console.error('EMAIL_DEMO_QUALIFICATION_ERROR',e.message);return deny(res,503,'QUALIFICATION_INDISPONIBLE');}
 });
 // Conseil guidé basé exclusivement sur le catalogue actif validé par le Consulat.
 // Aucun appel IA, aucune réponse sortante, aucun routage ni modification SQL.
 async function conseilPour(decision,corps){
  if(decision.intention!=='INFORMATION')return {etat:'HORS_INFORMATION',fiche:null};
  const q=await query(`SELECT c.code,c.titre,c.categorie,c.pieces_obligatoires,c.actif,c.valide_par,c.validation_explicite,c.mis_a_jour_le
     FROM organisation_procedure_catalogue c
     JOIN organisations o ON o.id=c.organisation_id AND o.tenant_id=c.tenant_id
     JOIN tenants t ON t.id=c.tenant_id AND t.code=$2
     WHERE c.organisation_id=$1 AND c.categorie=$3 AND c.actif=TRUE AND c.valide_par IS NOT NULL AND c.validation_explicite=TRUE
     ORDER BY c.titre ASC LIMIT 30`,[ORG,TENANT,decision.categorie]);
  return guidance.selectionnerFiche(decision,corps,q.rows);
 }
 router.get('/messages/:id/conseil',async(req,res)=>{
  const id=validId(req.params.id);if(!id)return deny(res,400,'ID_INVALIDE');
  try {
   const p=await query(`SELECT e.subject AS objet,e.body AS texte
     FROM pilot_email_inbox_demo e
     JOIN organisations o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
     JOIN tenants t ON t.id=e.tenant_id AND t.code=$2
     WHERE e.id=$3 AND e.organisation_id=$1 AND e.source='DEMO_SYNTHETIQUE'`,[ORG,TENANT,id]);
   if(!p.rowCount)return deny(res,404,'COURRIER_INTROUVABLE');
   if(!await triage.secretaryAllowed(req,p.rows[0],query))return deny(res,403,'COURRIER_HORS_FILE_SECRETARIAT');
   const decision=mailIntent.qualifier(p.rows[0].objet,p.rows[0].texte);
   const conseil=await conseilPour(decision,p.rows[0].texte);
   return res.json({statut:'CONSEIL_DE_RECETTE',lectureSeule:true,envoiAutorise:false,
     approbationReponseAutomatique:false,origine:'CATALOGUE_CONSULAT',decision,conseil});
  } catch(e){console.error('EMAIL_DEMO_CONSEIL_ERROR',e.message);return deny(res,503,'CONSEIL_INDISPONIBLE');}
 });
 router.get('/scenarios/:id/conseil',async(req,res)=>{
  const scenario=mailIntent.scenarios.find(x=>x.id===req.params.id);
  if(!scenario)return deny(res,404,'SCENARIO_INCONNU');
  try {
   const decision=mailIntent.qualifier(scenario.objet,scenario.texte);
   const conseil=await conseilPour(decision,scenario.texte);
   return res.json({statut:'CONSEIL_SCENARIO',lectureSeule:true,envoiAutorise:false,
     approbationReponseAutomatique:false,origine:'CATALOGUE_CONSULAT',decision,conseil});
  } catch(e){console.error('EMAIL_DEMO_SCENARIO_ERROR',e.message);return deny(res,503,'CONSEIL_INDISPONIBLE');}
 });
 router.all('/messages', (req,res)=>res.status(405).json({statut:'LECTURE_SEULE'}));
 router.all('/messages/:id', (req,res)=>res.status(405).json({statut:'LECTURE_SEULE'}));
 return router;
}
module.exports={createEmailDemoRouter};
