'use strict';
/** Bordeaux P335BY. Attributions CANONIQUES dans demandes.assignee_a, base test seulement.
 * Les courriers DEMO restent des propositions ; aucun email n'est traité ici.
 * Les refus sont imposés côté serveur indépendamment des vues utilisateur.
 */
const express = require('express');
const {executerRequete, obtenirClientDatabase} = require('./database');
const {obtenirPermissionsEffectivesDatabase} = require('./services-database');
const {proposerAgent,durees} = require('./pilot-mail-dispatch-core');
const ORG=70,TENANT='P6V_3B5AC5AB9DB04657',SYSTEM_ID='7699611241381229531';
const ASSIGN='ASSIGN_CONSULAR_CASES_PILOT',VIEW='VIEW_OPERATIONAL_DASHBOARD';
const no=(res,status,code)=>res.status(status).json({statut:code});
const id=x=>/^[1-9][0-9]{0,14}$/.test(String(x??''))?Number(x):null;
const num=x=>Number.isSafeInteger(Number(x)) && Number(x)>=0?Number(x):null;
function validOrigin(req){
 const actual=req.get('origin'),expected=process.env.SATEER_PUBLIC_ORIGIN;
 if(!actual||!expected)return false;
 try{const a=new URL(actual),e=new URL(expected);return a.origin===e.origin&&a.pathname==='/'&&!a.search&&!a.hash&&!a.username&&!a.password;}catch{return false;}
}
function entitled(rights,code){return rights?.succes===true && (rights.permissionsOrganisation||[]).includes(code);}
async function candidates(query,rights,unitId){
 const r=await query(`SELECT DISTINCT p.id AS "personneId",p.prenom,p.nom,
   COALESCE(s.capacite,1)::float8 AS capacite,COALESCE(s.disponible,TRUE) AS disponible,
   (SELECT COUNT(*)::int FROM demandes d WHERE d.organisation_id=$1 AND d.destination_unit_id=$3
     AND d.assignee_a=p.id AND d.statut IN ('NOUVELLE','EN_COURS')) AS charge,
   (SELECT COUNT(*)::int FROM demandes d WHERE d.organisation_id=$1 AND d.destination_unit_id=$3
     AND d.assignee_a=p.id AND d.statut='TRAITEE') AS traites
  FROM relations_personne_organisation_unit m
  JOIN personnes p ON p.id=m.personne_id
  JOIN organisation_units u ON u.id=m.organisation_unit_id AND u.organisation_id=$1 AND u.actif=TRUE
  JOIN organisations o ON o.id=u.organisation_id
  JOIN tenants t ON t.id=o.tenant_id AND t.code=$2
  JOIN relations_personne_organisation ro ON ro.personne_id=p.id AND ro.organisation_id=o.id
      AND ro.type IN ('AGENT','RESPONSABLE','AGENT_SATEER')
  LEFT JOIN pilot_case_dispatch_agent_settings s ON s.organisation_id=o.id AND s.unit_id=u.id AND s.personne_id=p.id
  WHERE u.id=$3 AND m.actif=TRUE AND (m.date_debut IS NULL OR m.date_debut<=now())
    AND (m.date_fin IS NULL OR m.date_fin>now())
    AND EXISTS (SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
     WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='TAKE_CASES')
  ORDER BY p.id LIMIT 201`,[ORG,TENANT,unitId]);
 if(r.rows.length>200)throw Error('TROP_AGENTS');
 const permitted=[];
 for(const person of r.rows){
   const d=await rights(Number(person.personneId),ORG,TENANT);
   const unit=(d?.permissionsParUnite||[]).find(x=>Number(x.uniteId)===unitId);
   const allowed=entitled(d,'TAKE_CASE')||(unit?.permissions||[]).includes('TAKE_CASE');
   if(allowed)permitted.push({...person, bureauId:unitId,actif:true, habilite:true, absent:person.disponible!==true});
 }
 return permitted;
}
const sortCases=(a,b)=>{
 const rank=x=>x==='URGENTE'?0:x==='IMPORTANTE'?1:2;
 return rank(a.priorite)-rank(b.priorite)||Number(a.id)-Number(b.id);
};
async function unitExists(query,unitId){
 const x=await query(`SELECT u.id,u.nom FROM organisation_units u JOIN organisations o ON o.id=u.organisation_id
 JOIN tenants t ON t.id=o.tenant_id WHERE u.id=$3 AND u.organisation_id=$1 AND t.code=$2 AND u.actif=TRUE`,[ORG,TENANT,unitId]);
 return x.rows[0]||null;
}
async function assignment(c,doc,actor,agents,mode,personneId,motif,action='AFFECTATION_MANUELLE'){
 if(doc.statut!=='NOUVELLE')return {code:409,statut:'DOSSIER_DEJA_PRIS_EN_CHARGE'};
 let choice;
 if(mode==='AUTO')choice=proposerAgent(agents,{mode:'AUTO',bureauId:Number(doc.destination_unit_id)});
 else choice=proposerAgent(agents,{mode:'MANUEL',personneId,bureauId:Number(doc.destination_unit_id)});
 if(!choice.personneId)return {code:409,statut:'AUCUN_AGENT_HABILITE_DISPONIBLE'};
 if(doc.assignee_a!=null && Number(doc.assignee_a)===Number(choice.personneId))return {code:409,statut:'AFFECTATION_DEJA_IDENTIQUE'};
 if(doc.assignee_a!=null && (!motif || motif.trim().length<8))return {code:400,statut:'MOTIF_REAFFECTATION_REQUIS'};
 const previous=doc.assignee_a==null?null:Number(doc.assignee_a);
 const updated=await c.query(`UPDATE demandes SET assignee_a=$1,date_modification=now()
 WHERE id=$2 AND organisation_id=$3 AND destination_unit_id=$4 AND statut='NOUVELLE'
   AND assignee_a IS NOT DISTINCT FROM $5::integer
 RETURNING id,assignee_a,statut`,[choice.personneId,doc.id,ORG,doc.destination_unit_id,previous]);
 if(updated.rowCount!==1)return {code:409,statut:'DOSSIER_MODIFIE_CONCURREMMENT'};
 await c.query(`INSERT INTO pilot_case_dispatch_audit(organisation_id,unit_id,demande_id,agent_id,acteur_id,action,ancien,nouveau,motif)
 VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,[ORG,doc.destination_unit_id,doc.id,choice.personneId,actor,action,
 JSON.stringify({agentId:previous,statut:doc.statut}),JSON.stringify({agentId:choice.personneId,statut:doc.statut,mode,execution:true}),motif||null]);
 agents.find(a=>Number(a.personneId)===Number(choice.personneId)).charge++;
 return {statut:'DOSSIER_AFFECTE',demandeId:Number(doc.id),agentId:choice.personneId,mode,priseEnCharge:false};
}
function createCaseDispatchRouter(deps={}){
 const router=express.Router(),query=deps.query||executerRequete,clientFactory=deps.clientFactory||obtenirClientDatabase;
 const rights=deps.rights||obtenirPermissionsEffectivesDatabase,isTest=deps.isTest||(()=>process.env.PGDATABASE==='sateer_test');
 router.use(async(req,res,next)=>{
   if(!isTest())return no(res,503,'PILOTE_RESERVE_BASE_TEST');
   if(!req.auth?.personneId)return no(res,401,'SESSION_REQUISE');
   if(String(req.query.organisationId)!==String(ORG)||req.query.tenant!==TENANT)return no(res,400,'CONTEXTE_INVALIDE');
   try{
    const d=await rights(Number(req.auth.personneId),ORG,TENANT);
    if(!entitled(d,VIEW))return no(res,403,'PILOTAGE_INTERDIT');
    const x=await query('SELECT current_database() AS db,system_identifier::text AS sid FROM pg_control_system()');
    if(x.rows[0]?.db!=='sateer_test'||x.rows[0]?.sid!==SYSTEM_ID)return no(res,503,'INSTANCE_RECETTE_INVALIDE');
    req.caseCanAssign=entitled(d,ASSIGN);res.set('Cache-Control','private,no-store');return next();
   }catch(e){console.error('P335BY_ACCESS',e.message);return no(res,503,'CONTROLE_INDISPONIBLE');}
 });
 const canWrite=(req,res)=>{if(!req.caseCanAssign){no(res,403,'AFFECTATION_INTERDITE');return false;}
   if(!validOrigin(req)){no(res,403,'ORIGINE_NON_AUTORISEE');return false;}return true;};
 router.get('/access',(req,res)=>res.json({statut:'PILOTAGE_DOSSIERS_AUTORISE',peutAffecter:req.caseCanAssign,organisationId:ORG,tenant:TENANT}));
 router.get('/units',async(req,res)=>{
   try{const u=await query(`SELECT u.id,u.nom FROM organisation_units u JOIN organisations o ON o.id=u.organisation_id
     JOIN tenants t ON t.id=o.tenant_id WHERE u.organisation_id=$1 AND t.code=$2 AND u.actif=TRUE
     ORDER BY u.nom LIMIT 100`,[ORG,TENANT]);
     return res.json({statut:'BUREAUX',bureaux:u.rows});}catch(e){return no(res,503,'BUREAUX_INDISPONIBLES');}
 });
 router.get('/agents',async(req,res)=>{
   const unitId=id(req.query.unitId);if(!unitId)return no(res,400,'UNITE_INVALIDE');
   try{if(!await unitExists(query,unitId))return no(res,404,'UNITE_INTROUVABLE');
    return res.json({statut:'AGENTS_HABILITES',agents:await candidates(query,rights,unitId)});
   }catch(e){console.error('P335BY_AGENTS',e.message);return no(res,503,'AGENTS_INDISPONIBLES');}
 });
 router.get('/cases',async(req,res)=>{
   const unitId=id(req.query.unitId),offset=num(req.query.offset??0);
   if(!unitId||offset===null||offset>100000)return no(res,400,'PAGINATION_INVALIDE');
   try{if(!await unitExists(query,unitId))return no(res,404,'UNITE_INTROUVABLE');
    const [count,rows]=await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM demandes d JOIN tenants t ON t.id=d.tenant_id WHERE d.organisation_id=$1 AND t.code=$2 AND d.destination_unit_id=$3`,[ORG,TENANT,unitId]),
      query(`SELECT d.id,d.categorie,d.objet,d.priorite,d.statut,d.assignee_a AS "agentId",d.date_creation AS "recuLe"
       FROM demandes d JOIN tenants t ON t.id=d.tenant_id WHERE d.organisation_id=$1 AND t.code=$2 AND d.destination_unit_id=$3
       ORDER BY CASE d.priorite WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END,
        d.date_creation ASC,d.id ASC LIMIT 50 OFFSET $4`,[ORG,TENANT,unitId,offset])]);
    return res.json({statut:'DOSSIERS_BUREAU',dossiers:rows.rows,pagination:{total:count.rows[0]?.n??0,offset,limit:50}});
   }catch(e){console.error('P335BY_CASES',e.message);return no(res,503,'DOSSIERS_INDISPONIBLES');}
 });
 router.get('/stats',async(req,res)=>{
   try{
    const x=await query(`SELECT u.id AS "unitId",u.nom AS "bureau",
       COUNT(d.id)::int AS total,
       COUNT(d.id) FILTER (WHERE d.statut='NOUVELLE')::int AS "enAttente",
       COUNT(d.id) FILTER (WHERE d.statut='EN_COURS')::int AS "enCours",
       COUNT(d.id) FILTER (WHERE d.statut='TRAITEE')::int AS traitees,
       COUNT(d.id) FILTER (WHERE d.statut IN ('NOUVELLE','EN_COURS') AND d.assignee_a IS NULL)::int AS "sansAgent",
       COUNT(DISTINCT d.assignee_a) FILTER (WHERE d.statut IN ('NOUVELLE','EN_COURS'))::int AS "agentsAvecCharge",
       ROUND(AVG(EXTRACT(EPOCH FROM (d.date_cloture-d.date_creation))/3600)
         FILTER (WHERE d.statut='TRAITEE' AND d.date_cloture IS NOT NULL)::numeric,1) AS "delaiClotureHeures"
      FROM organisation_units u JOIN organisations o ON o.id=u.organisation_id
      JOIN tenants t ON t.id=o.tenant_id
      LEFT JOIN demandes d ON d.destination_unit_id=u.id AND d.organisation_id=o.id AND d.tenant_id=t.id
      WHERE o.id=$1 AND t.code=$2 AND u.actif=TRUE GROUP BY u.id,u.nom ORDER BY u.nom`,[ORG,TENANT]);
    return res.json({statut:'CHARGE_BUREAUX',bureaux:x.rows,definition:'Dossiers canoniques uniquement. La première réponse et la clôture sont distinctes.'});
   }catch(e){console.error('P335BY_STATS',e.message);return no(res,503,'STATISTIQUES_INDISPONIBLES');}
 });
 router.get('/agent-metrics',async(req,res)=>{
   const unitId=id(req.query.unitId);if(!unitId)return no(res,400,'UNITE_INVALIDE');
   try{if(!await unitExists(query,unitId))return no(res,404,'UNITE_INTROUVABLE');
    const q=await query(`SELECT d.assignee_a AS "agentId",
     COUNT(*) FILTER (WHERE d.statut IN ('NOUVELLE','EN_COURS'))::int AS "dossiersOuverts",
     COUNT(*) FILTER (WHERE d.statut='TRAITEE')::int AS "dossiersTraites",
     ROUND(AVG(EXTRACT(EPOCH FROM (h.premiere_reponse-d.date_creation))/3600)
       FILTER (WHERE h.premiere_reponse IS NOT NULL)::numeric,1) AS "delaiPremiereReponseHeures",
     ROUND(AVG(EXTRACT(EPOCH FROM (h.remise-d.date_creation))/3600)
       FILTER (WHERE h.remise IS NOT NULL)::numeric,1) AS "delaiRemiseHeures"
    FROM demandes d JOIN tenants t ON t.id=d.tenant_id
    LEFT JOIN LATERAL (SELECT
       MIN(dh.date_action) FILTER (WHERE dh.action='REPONSE_ENVOYEE') AS premiere_reponse,
       MIN(dh.date_action) FILTER (WHERE dh.action='DOCUMENT_REMIS_CONFIRME') AS remise
      FROM demande_history dh WHERE dh.demande_id=d.id AND dh.tenant_id=d.tenant_id) h ON true
    WHERE d.organisation_id=$1 AND t.code=$2 AND d.destination_unit_id=$3 AND d.assignee_a IS NOT NULL
    GROUP BY d.assignee_a ORDER BY d.assignee_a`,[ORG,TENANT,unitId]);
    return res.json({statut:'PERFORMANCES_AGENTS',agents:q.rows,note:'Délais constatés dans les dossiers canoniques ; un dossier sans réponse n’entre pas dans la moyenne.'});
   }catch(e){console.error('P335BY_AGENT_METRICS',e.message);return no(res,503,'PERFORMANCES_INDISPONIBLES');}
 });
 router.get('/delays',async(req,res)=>{
   const unitId=id(req.query.unitId);if(!unitId)return no(res,400,'UNITE_INVALIDE');
   try{if(!await unitExists(query,unitId))return no(res,404,'UNITE_INTROUVABLE');
    const q=await query(`SELECT d.id,d.date_creation AS "recuLe",
      MIN(h.date_action) FILTER (WHERE h.action='DOCUMENT_REMIS_CONFIRME') AS "remisLe",
      MIN(h.date_action) FILTER (WHERE h.action='ORIENTATION_AUTOMATIQUE' OR h.action='ORIENTATION') AS "orienteLe",
      MIN(h.date_action) FILTER (WHERE h.action='PRISE_EN_CHARGE') AS "prisEnChargeLe",
      MIN(h.date_action) FILTER (WHERE h.action='REPONSE_ENVOYEE') AS "premiereReponseLe"
      FROM demandes d JOIN tenants t ON t.id=d.tenant_id
      LEFT JOIN demande_history h ON h.demande_id=d.id AND h.tenant_id=d.tenant_id
      WHERE d.organisation_id=$1 AND t.code=$2 AND d.destination_unit_id=$3
      GROUP BY d.id ORDER BY d.date_creation DESC LIMIT 3001`,[ORG,TENANT,unitId]);
    if(q.rows.length>3000)return no(res,409,'CAPACITE_METRIQUES_DEPASSEE');
    return res.json({statut:'DELAIS_MESURES',...durees(q.rows),note:'Mesures disponibles seulement si horodatages réels présents ; aucune estimation garantie.'});
   }catch(e){console.error('P335BY_DELAIS',e.message);return no(res,503,'DELAIS_INDISPONIBLES');}
 });
 router.get('/audit',async(req,res)=>{
   if(!req.caseCanAssign)return no(res,403,'AUDIT_INTERDIT');
   try{const q=await query(`SELECT id,unit_id AS "unitId",demande_id AS "demandeId",agent_id AS "agentId",acteur_id AS "acteurId",
   action,ancien,nouveau,motif,cree_le AS "date" FROM pilot_case_dispatch_audit WHERE organisation_id=$1 ORDER BY cree_le DESC,id DESC LIMIT 100`,[ORG]);
    return res.json({statut:'AUDIT_AFFECTATIONS',evenements:q.rows});
   }catch(e){return no(res,503,'AUDIT_INDISPONIBLE');}
 });
 async function withAssignment(req,res,{unitId,caseId=null,mode,agentId=null,motif=null,lot=false}){
   let c,started=false;
   try{
    c=await clientFactory();await c.query('BEGIN');started=true;
    await c.query("SET LOCAL lock_timeout='4s'");
    await c.query('SELECT pg_advisory_xact_lock($1::bigint)',[BigInt(ORG*1000000+unitId).toString()]);
    if(!await unitExists((s,p)=>c.query(s,p),unitId)){await c.query('ROLLBACK');started=false;return no(res,404,'UNITE_INTROUVABLE');}
    const eligible=await candidates((s,p)=>c.query(s,p),rights,unitId);
    if(!eligible.some(a=>a.disponible===true&&a.habilite===true&&a.absent!==true)){
      await c.query('ROLLBACK');started=false;return no(res,409,'AUCUN_AGENT_ELIGIBLE');
    }
    const all=await c.query(`SELECT d.id,d.statut,d.priorite,d.assignee_a,d.destination_unit_id,d.tenant_id
      FROM demandes d JOIN organisations o ON o.id=d.organisation_id
      JOIN tenants t ON t.id=d.tenant_id AND t.id=o.tenant_id
      WHERE d.organisation_id=$1 AND t.code=$2 AND d.destination_unit_id=$3
      AND d.statut='NOUVELLE' AND ($4::integer IS NULL OR d.id=$4)
      AND ($4::integer IS NOT NULL OR d.assignee_a IS NULL)
      ORDER BY CASE d.priorite WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END,d.date_creation ASC,d.id ASC
      LIMIT $5 FOR UPDATE OF d`,[ORG,TENANT,unitId,caseId,lot?20:1]);
    if((!lot && all.rowCount!==1) || (lot && all.rowCount===0)){
      await c.query('ROLLBACK');started=false;return no(res,404,'DOSSIER_NON_AFFECTABLE');
    }
    const done=[];
    for(const doc of all.rows.sort(sortCases)){
      const action=lot?'REPARTITION_LOT':mode==='AUTO'?'AFFECTATION_AUTO_ASSISTEE':'AFFECTATION_MANUELLE';
      const result=await assignment(c,doc,Number(req.auth.personneId),eligible,mode,agentId,motif,action);
      if(result.statut!=='DOSSIER_AFFECTE'){await c.query('ROLLBACK');started=false;return no(res,result.code||409,result.statut);}
      done.push(result);
    }
    await c.query('COMMIT');started=false;
    return res.json({statut:lot?'LOT_AFFECTE':'DOSSIER_AFFECTE',affectations:done,aucunEmail:true,aucunePriseEnCharge:true});
   }catch(e){console.error('P335BY_ASSIGN_FAIL',e.message);return no(res,503,'AFFECTATION_INDISPONIBLE');}
   finally{if(c){if(started)await c.query('ROLLBACK').catch(()=>{});c.release();}}
 }
 router.post('/cases/:caseId/assign',async(req,res)=>{
   if(!canWrite(req,res))return;
   const unitId=id(req.body?.unitId),caseId=id(req.params.caseId);
   const mode=req.body?.mode,agentId=mode==='MANUEL'?id(req.body?.agentId):null,motif=req.body?.motif;
   if(!unitId||!caseId||!['AUTO','MANUEL'].includes(mode)||mode==='MANUEL'&&!agentId ||
     (motif!=null&&(typeof motif!=='string'||motif.length>300)))return no(res,400,'PARAMETRES_AFFECTATION_INVALIDES');
   return withAssignment(req,res,{unitId,caseId,mode,agentId,motif});
 });
 router.post('/units/:unitId/distribute',async(req,res)=>{
   if(!canWrite(req,res))return;
   const unitId=id(req.params.unitId);if(!unitId)return no(res,400,'UNITE_INVALIDE');
   if(req.body?.confirmation!=='REPARTIR_20_DOSSIERS_MAX')return no(res,400,'CONFIRMATION_REPARTITION_REQUISE');
   return withAssignment(req,res,{unitId,mode:'AUTO',lot:true});
 });
 router.put('/units/:unitId/agents/:agentId/settings',async(req,res)=>{
   if(!canWrite(req,res))return;
   const unitId=id(req.params.unitId),agentId=id(req.params.agentId);
   const cap=Number(req.body?.capacite),disponible=req.body?.disponible;
   if(!unitId||!agentId||!Number.isFinite(cap)||cap<0.25||cap>2||disponible!==true&&disponible!==false)
     return no(res,400,'PARAMETRES_CAPACITE_INVALIDES');
   let c,started=false;
   try{
    c=await clientFactory();await c.query('BEGIN');started=true;
    const eligible=await candidates((s,p)=>c.query(s,p),rights,unitId);
    if(!eligible.some(a=>Number(a.personneId)===agentId)){await c.query('ROLLBACK');started=false;return no(res,403,'AGENT_NON_ELIGIBLE');}
    const before=await c.query('SELECT capacite,disponible FROM pilot_case_dispatch_agent_settings WHERE organisation_id=$1 AND unit_id=$2 AND personne_id=$3 FOR UPDATE',[ORG,unitId,agentId]);
    await c.query(`INSERT INTO pilot_case_dispatch_agent_settings(organisation_id,unit_id,personne_id,capacite,disponible,updated_by)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organisation_id,unit_id,personne_id)
     DO UPDATE SET capacite=EXCLUDED.capacite,disponible=EXCLUDED.disponible,updated_by=EXCLUDED.updated_by,updated_at=now()`,[ORG,unitId,agentId,cap,disponible,req.auth.personneId]);
    await c.query(`INSERT INTO pilot_case_dispatch_audit (organisation_id,unit_id,agent_id,acteur_id,action,ancien,nouveau)
     VALUES($1,$2,$3,$4,'CONFIGURATION_CAPACITE',$5::jsonb,$6::jsonb)`,[ORG,unitId,agentId,req.auth.personneId,JSON.stringify(before.rows[0]||null),JSON.stringify({capacite:cap,disponible})]);
    await c.query('COMMIT');started=false;
    return res.json({statut:'CAPACITE_ENREGISTREE',agentId,capacite:cap,disponible});
   }catch(e){console.error('P335BY_CAPACITE',e.message);return no(res,503,'CAPACITE_INDISPONIBLE');}
   finally{if(c){if(started)await c.query('ROLLBACK').catch(()=>{});c.release();}}
 });
 return router;
}
module.exports={createCaseDispatchRouter,candidates,assignment,validOrigin};
