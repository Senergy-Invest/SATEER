'use strict';
/**
 * P3.3.5AK - API TEMPORAIRE, exclusivement localhost et sateer_test.
 * Aucun INSERT / UPDATE / DELETE. Simulation de validation/publication en RAM.
 * Les endpoints officiels /api/pilot-procedures restent strictement intacts.
 */
const express = require('express');
const { executerRequete } = require('./database');
const { verifierPermissionPersonneDatabase } = require('./auth-authorization');
const { ORG,TENANT,CONFIRMATION,createRecetteState } = require('./pilot-procedures-recette-core');
const data = createRecetteState();
const answer = (res,code,message)=>res.status(code).json({statut:message,recette:true,officielle:false,persistante:false});
const origin = ()=>'http://127.0.0.1:'+String(process.env.PORT || 3200);
function localRequest(req) {
  const remote=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');
  return (remote==='127.0.0.1'||remote==='::1') && req.headers.host === '127.0.0.1:'+String(process.env.PORT||3200);
}
async function getAccess(personneId) {
  if (!Number.isSafeInteger(Number(personneId)) || Number(personneId)<1) return {member:false,vice:false};
  const q=await executerRequete(`SELECT
   EXISTS(SELECT 1 FROM public.relations_personne_organisation_roles rel
    JOIN public.organisation_roles r ON r.id=rel.role_id AND r.organisation_id=rel.organisation_id
    JOIN public.organisations o ON o.id=rel.organisation_id
    JOIN public.tenants t ON t.id=o.tenant_id
    WHERE rel.personne_id=$1 AND rel.organisation_id=$2 AND t.code=$3
      AND rel.actif=TRUE AND r.actif=TRUE AND r.scope IN ('ORGANISATION','BOTH')
      AND rel.date_debut<=CURRENT_TIMESTAMP
      AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)) AS member,
   EXISTS(SELECT 1 FROM public.relations_personne_organisation_roles rel
    JOIN public.organisation_roles r ON r.id=rel.role_id AND r.organisation_id=rel.organisation_id
    JOIN public.organisations o ON o.id=rel.organisation_id
    JOIN public.tenants t ON t.id=o.tenant_id
    WHERE rel.personne_id=$1 AND rel.organisation_id=$2 AND t.code=$3
      AND rel.actif=TRUE AND r.actif=TRUE AND LEFT(r.code,20)='VICE_CONSUL_RECETTE_'
      AND r.scope IN ('ORGANISATION','BOTH') AND rel.date_debut<=CURRENT_TIMESTAMP
      AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)) AS vice`,[Number(personneId),ORG,TENANT]);
  const membership=q.rows[0]||{};
  if (!membership.member || !membership.vice) return {member:Boolean(membership.member),vice:false};
  const right=await verifierPermissionPersonneDatabase({personneId:Number(personneId),organisationId:ORG,
    tenantCode:TENANT,permissionCode:'MANAGE_PUBLICATIONS'});
  return {member:true,vice:Boolean(right?.succes && right?.autorise && right?.portee==='ORGANISATION')};
}
async function catalogue(code) {
  const params=[ORG,TENANT]; let where='';
  if (code) {params.push(code);where=' AND c.code=$3';}
  const q=await executerRequete(`SELECT c.code,c.titre,c.categorie,c.pieces_obligatoires,
    c.delai_indicatif_jours,c.actif,c.validation_explicite,c.valide_par,
    EXTRACT(EPOCH FROM c.mis_a_jour_le)::numeric(19,6)::text AS revision
    FROM public.organisation_procedure_catalogue c
    JOIN public.organisations o ON o.id=c.organisation_id AND o.tenant_id=c.tenant_id
    JOIN public.tenants t ON t.id=o.tenant_id
    WHERE c.organisation_id=$1 AND t.code=$2 AND c.titre LIKE '[DEMO BORDEAUX]%' ${where}
    ORDER BY c.titre LIMIT 30`,params);
  return q.rows;
}
function createRouter() {
  const router=express.Router();
  // Ce module n'est monté que lorsque le drapeau explicite est activé.
  router.use((req,res,next)=>{
    if (process.env.PGDATABASE!=='sateer_test' ||
        process.env.SATEER_LISTEN_HOST!=='127.0.0.1' ||
        process.env.SATEER_ENABLE_BORDEAUX_PROCEDURE_RECETTE!=='1' || !localRequest(req))
      return answer(res,404,'RECETTE_DESACTIVEE');
    next();
  });
  router.get('/catalogue', async(req,res)=>{
    if (req.query.organisationId!==String(ORG)||req.query.tenant!==TENANT)
      return answer(res,400,'CONTEXTE_RECETTE_INVALIDE');
    try {
      const access=await getAccess(req.auth?.personneId);
      if (!access.member) return answer(res,403,'HORS_ORGANISATION');
      const rows=await catalogue();
      return res.json({statut:'CATALOGUE_RECETTE',recette:true,officielle:false,
        persistante:false,aucunePublicationInstitutionnelle:true,peutSimuler:access.vice,
        procedures:data.list(rows,access.vice)});
    }catch(err){console.error('P335AK lecture',err.message);return answer(res,503,'RECETTE_INDISPONIBLE');}
  });
  router.post('/actions/:code', express.json({limit:'2kb'}), async(req,res)=>{
    if (req.headers.origin!==origin() || req.headers['content-type']?.split(';')[0].trim()!=='application/json')
      return answer(res,403,'ORIGINE_OU_TYPE_REFUSE');
    const code=String(req.params.code||'');
    const {action,revision,confirmation,organisationId,tenantCode}=req.body||{};
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(code) || organisationId!==ORG || tenantCode!==TENANT ||
      !['VALIDER','PUBLIER','RETIRER'].includes(action) || confirmation!==CONFIRMATION)
      return answer(res,400,'ACTION_RECETTE_INVALIDE');
    try {
      const access=await getAccess(req.auth?.personneId);
      if (!access.vice) return answer(res,403,'VICE_CONSUL_NON_AUTORISE');
      const rows=await catalogue(code);
      if (rows.length!==1)return answer(res,404,'FICHE_FICTIVE_ABSENTE');
      const updated=data.transition(rows[0],action,revision,confirmation);
      return res.json({statut:'SIMULATION_'+action+'_OK',procedure:updated,
        recette:true,officielle:false,persistante:false,
        aucunePublicationInstitutionnelle:true,aucuneNotification:true});
    }catch(err){
      if (err.statusCode)return answer(res,err.statusCode,err.message);
      console.error('P335AK action',err.message);return answer(res,503,'RECETTE_INDISPONIBLE');
    }
  });
  return router;
}
module.exports={createRouter};
