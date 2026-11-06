'use strict';
// Lecteur HTTP des seuls e-mails synthetiques du pilote Bordeaux; aucune ecriture.
const express = require('express');
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
   if(!d?.succes || !(d.permissionsOrganisation||[]).includes('VIEW_OPERATIONAL_DASHBOARD'))return deny(res,403,'CONSULTATION_INTERDITE');
   const p=await query('SELECT current_database() AS db, system_identifier::text AS sid FROM pg_control_system()');
   if(p.rows[0]?.db!=='sateer_test'||p.rows[0]?.sid!==PG_SYSTEM_ID) return deny(res,503,'INSTANCE_RECETTE_INVALIDE');
   next();
  } catch(e){console.error('EMAIL_DEMO_CONTROL_ERROR',e.message);return deny(res,503,'CONSULTATION_INDISPONIBLE');}
 });
 router.get('/messages',async(req,res)=>{
  try {
   const p=await query(`SELECT e.id,e.mailbox_key AS "boite",e.from_label AS "expediteur",e.subject AS "objet",e.categorie_proposee AS "categorieProposee",e.motif_qualification AS "motif",e.statut,e.created_at AS "dateReception",u.nom AS "uniteSuggeree"
    FROM pilot_email_inbox_demo e
    JOIN organisations o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
    JOIN tenants t ON t.id=e.tenant_id AND t.code=$2
    LEFT JOIN organisation_units u ON u.id=e.unite_suggeree_id AND u.organisation_id=e.organisation_id
    WHERE e.organisation_id=$1 AND e.source='DEMO_SYNTHETIQUE'
    ORDER BY e.created_at DESC,e.id DESC LIMIT 50`,[ORG,TENANT]);
   return res.json({statut:'COURRIERS_SYNTHETIQUES_CHARGES',enLectureSeule:true, messages:p.rows});
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
   return res.json({statut:'COURRIER_SYNTHETIQUE_CHARGE',enLectureSeule:true,message:p.rows[0]});
  } catch(e){console.error('EMAIL_DEMO_DETAIL_ERROR',e.message);return deny(res,503,'COURRIER_INDISPONIBLE');}
 });
 router.all('/messages', (req,res)=>res.status(405).json({statut:'LECTURE_SEULE'}));
 router.all('/messages/:id', (req,res)=>res.status(405).json({statut:'LECTURE_SEULE'}));
 return router;
}
module.exports={createEmailDemoRouter};
