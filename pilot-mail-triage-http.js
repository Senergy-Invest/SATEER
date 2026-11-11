'use strict';
/** P335BX - APIs de file et de parametrage du seul pilote Bordeaux.
 * Le paramétrage choisit une FILE VIRTUELLE, jamais une action opérationnelle.
 * Ces routes s'installent APRES les garde-fous de session/tenant/cluster du routeur existant.
 */
const {obtenirClientDatabase} = require('./database');
const core=require('./pilot-mail-triage-core');
const ORG=70, TENANT='P6V_3B5AC5AB9DB04657';
const CONFIG='CONFIGURE_CONSULAR_MAIL_DEMO', OP='VIEW_OPERATIONAL_DASHBOARD';
const deny=(res,code,statut)=>res.status(code).json({statut});
const vice=req=>Array.isArray(req.demoPermissions)&&req.demoPermissions.includes(OP);
const admin=req=>vice(req)&&req.demoPermissions.includes(CONFIG);
const validId=v=>/^[1-9][0-9]{0,14}$/.test(String(v??''))?Number(v):null;
function sameOrigin(req){
 const origin=req.get('origin');const expected=process.env.SATEER_PUBLIC_ORIGIN;
 if(!origin||!expected)return false;
 try {const u=new URL(origin),e=new URL(expected);return u.origin===e.origin && u.username==='' && u.password==='' && u.pathname==='/' && u.search==='' && u.hash==='';}
 catch{return false;}
}
async function getRules(query){
 const r=await query(`SELECT r.category_key AS "categorie",r.mode AS "mode",r.destination_unit_id AS "bureauId",r.actif,
   (u.id IS NOT NULL AND u.actif=TRUE AND EXISTS (
       SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
       WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='RECEIVE_INCOMING')
    AND EXISTS (SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
       WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='VIEW_INBOX')) AS "bureauValide"
   FROM pilot_email_triage_demo_rules r
   LEFT JOIN organisation_units u ON u.id=r.destination_unit_id AND u.organisation_id=r.organisation_id
   WHERE r.organisation_id=$1 AND r.tenant_code=$2 ORDER BY r.category_key`,[ORG,TENANT]);
 return r.rows;
}
async function messages(query){
 // Entierement synthétique. Pas de messagerie IMAP/SMTP.
 const r=await query(`SELECT e.id,e.mailbox_key AS "boite",e.from_label AS "expediteur",
 e.subject AS "objet",e.body AS "texte",e.statut,e.created_at AS "dateReception",
 u.nom AS "uniteSuggeree"
 FROM pilot_email_inbox_demo e
 JOIN organisations o ON o.id=e.organisation_id AND o.tenant_id=e.tenant_id
 JOIN tenants t ON t.id=e.tenant_id AND t.code=$2
 LEFT JOIN organisation_units u ON u.id=e.unite_suggeree_id AND u.organisation_id=e.organisation_id
 WHERE e.organisation_id=$1 AND e.source='DEMO_SYNTHETIQUE'
 ORDER BY e.created_at DESC,e.id DESC LIMIT 501`,[ORG,TENANT]);
 if(r.rows.length>500)throw Error('CAPACITE_RECETTE_DEPASSEE'); // ne jamais masquer silencieusement des courriers
 return r.rows;
}
function decorer(m,rules){
 const decision=core.orienterVirtuellement(m,rules);
 // Corps absent des listes, accessible seulement par /messages/:id et contrôle de file.
 const {texte,...metadata}=m;
 return {...metadata,decisionFile:decision};
}
function counts(rows){
 const result={secretariat:0,assistant:0,bureau:0};
 for(const r of rows){
  if(r.decisionFile.file===core.FILES.SECRETARIAT)result.secretariat++;
  else if(r.decisionFile.file===core.FILES.ASSISTANT)result.assistant++;
  else if(r.decisionFile.file===core.FILES.BUREAU)result.bureau++;
 }
 return result;
}
async function secretaryAllowed(req,message,query){
 if(vice(req))return true;
 const rules=await getRules(query);
 return core.pourSecretariat(message,rules);
}
function installTriageRoutes(router,{query,clientFactory}={}){
 if(typeof query!=='function')throw Error('TRIAGE_QUERY_REQUISE');
 const client=clientFactory||obtenirClientDatabase;
 router.get('/triage/access',(req,res)=>res.json({statut:'TRIAGE_RECETTE_AUTORISE',profil:vice(req)?'VICE':'SECRETARIAT',
   peutConfigurer:admin(req),lectureSeuleTraitement:true,source:'DEMO_SYNTHETIQUE',envoiAutorise:false}));
 async function file(req,res,forVice){
  if(forVice&&!vice(req))return deny(res,403,'SUPERVISION_INTERDITE');
  try{
   const rules=await getRules(query),all=(await messages(query)).map(m=>decorer(m,rules));
   const filtered=forVice?all:all.filter(m=>m.decisionFile.file===core.FILES.SECRETARIAT);
   const offset=Number(req.query.offset??0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return deny(res,400,'PAGINATION_INVALIDE');
   return res.json({statut:'TRIAGE_SYNTHETIQUE',profil:forVice?'VICE':'SECRETARIAT',
     messages:filtered.slice(offset,offset+50),pagination:{total:filtered.length,offset,limit:50,aSuivre:offset+50<filtered.length},
     nombres:counts(all),totalCourriers:all.length,simulation:true,
     avertissement:'Aucun e-mail envoyé, aucun dossier créé, aucun courrier transmis. Les files sont des propositions non exécutées.'});
  }catch(e){console.error('P335BX_TRIAGE_LIST_FAIL',e.message);return deny(res,503,'TRIAGE_INDISPONIBLE');}
 }
 router.get('/triage/secretariat',(req,res)=>file(req,res,false));
 router.get('/triage/vice',(req,res)=>file(req,res,true));
 router.get('/triage/regles',async(req,res)=>{
  if(!vice(req))return deny(res,403,'CONFIGURATION_INTERDITE');
  try{return res.json({statut:'REGLES_DE_RECETTE',regles:await getRules(query),
    peutConfigurer:admin(req),executionAutomatique:false});}
  catch(e){console.error('P335BX_RULES_FAIL',e.message);return deny(res,503,'REGLES_INDISPONIBLES');}
 });
 router.get('/triage/audit',async(req,res)=>{
  if(!admin(req))return deny(res,403,'AUDIT_INTERDIT');
  try{
   const q=await query(`SELECT a.category_key AS "categorie",a.acteur_personne_id AS "acteurId",a.ancien,a.nouveau,a.modifie_le AS "date"
    FROM pilot_email_triage_demo_audit a
    WHERE a.organisation_id=$1 AND a.tenant_code=$2 ORDER BY a.modifie_le DESC,a.id DESC LIMIT 50`,[ORG,TENANT]);
   return res.json({statut:'JOURNAL_REGLES_DE_RECETTE',evenements:q.rows});
  }catch(e){console.error('P335BX_AUDIT_FAIL',e.message);return deny(res,503,'AUDIT_INDISPONIBLE');}
 });
 router.get('/triage/bureaux',async(req,res)=>{
  if(!vice(req))return deny(res,403,'CONFIGURATION_INTERDITE');
  try{
   const q=await query(`SELECT u.id,u.nom FROM organisation_units u
     JOIN organisations o ON o.id=u.organisation_id
     JOIN tenants t ON t.id=o.tenant_id
     WHERE u.organisation_id=$1 AND t.code=$2 AND u.actif=TRUE
     AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
       WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='RECEIVE_INCOMING')
     AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
       WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='VIEW_INBOX') ORDER BY u.nom`,[ORG,TENANT]);
   return res.json({statut:'BUREAUX_HABILITES',bureaux:q.rows});
  }catch(e){console.error('P335BX_UNITS_FAIL',e.message);return deny(res,503,'BUREAUX_INDISPONIBLES');}
 });
 router.put('/triage/regles/:categorie',async(req,res)=>{
  if(!admin(req))return deny(res,403,'CONFIGURATION_INTERDITE');
  if(!sameOrigin(req))return deny(res,403,'ORIGINE_NON_AUTORISEE');
  const categorie=req.params.categorie,mode=req.body?.mode,destination=req.body?.destinationUnitId;
  if(!core.CATEGORIES.includes(categorie)||!core.MODES.includes(mode))return deny(res,400,'REGLE_INVALIDE');
  const unit=mode==='MANUEL'?null:validId(destination);
  if(mode==='PROPOSITION'&&!unit)return deny(res,400,'BUREAU_REQUIS_POUR_PROPOSITION');
  if(mode==='MANUEL' && destination!=null)return deny(res,400,'BUREAU_NON_ATTENDU');
  let c,started=false;
  try {
   c=await client();await c.query('BEGIN');started=true;
   await c.query("SET LOCAL lock_timeout = '4s'");
   if(unit){
    const ok=await c.query(`SELECT u.id FROM organisation_units u JOIN organisations o ON o.id=u.organisation_id
      JOIN tenants t ON t.id=o.tenant_id WHERE u.id=$1 AND u.organisation_id=$2 AND t.code=$3 AND u.actif=TRUE
      AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities cap ON cap.id=uc.capability_id
        WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND cap.actif=TRUE AND cap.code='RECEIVE_INCOMING')
      AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities cap ON cap.id=uc.capability_id
        WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND cap.actif=TRUE AND cap.code='VIEW_INBOX') FOR UPDATE OF u`,[unit,ORG,TENANT]);
    if(ok.rowCount!==1){await c.query('ROLLBACK');started=false;return deny(res,409,'BUREAU_NON_HABILITE');}
   }
   const before=await c.query('SELECT category_key,mode,destination_unit_id FROM pilot_email_triage_demo_rules WHERE organisation_id=$1 AND tenant_code=$2 AND category_key=$3 FOR UPDATE',[ORG,TENANT,categorie]);
   const after=await c.query(`INSERT INTO pilot_email_triage_demo_rules
     (organisation_id,tenant_code,category_key,mode,destination_unit_id,created_by,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$6)
     ON CONFLICT (organisation_id,tenant_code,category_key)
     DO UPDATE SET mode=EXCLUDED.mode,destination_unit_id=EXCLUDED.destination_unit_id,updated_by=EXCLUDED.updated_by,updated_at=now(),actif=TRUE
     RETURNING category_key,mode,destination_unit_id`,[ORG,TENANT,categorie,mode,unit,req.auth.personneId]);
   await c.query(`INSERT INTO pilot_email_triage_demo_audit
     (organisation_id,tenant_code,category_key,acteur_personne_id,ancien,nouveau)
     VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[ORG,TENANT,categorie,req.auth.personneId,
       JSON.stringify(before.rows[0]||null),JSON.stringify(after.rows[0])]);
   await c.query('COMMIT');started=false;
   return res.json({statut:'REGLE_DE_RECETTE_ENREGISTREE',regle:after.rows[0],
     executionAutomatique:false,aucunEnvoi:true});
  }catch(e){console.error('P335BX_RULE_WRITE_FAIL',e.message);return deny(res,503,'CONFIGURATION_INDISPONIBLE');}
  finally{if(c){if(started)await c.query('ROLLBACK').catch(()=>{});c.release();}}
 });
}
module.exports=Object.freeze({installTriageRoutes,getRules,secretaryAllowed,decorer,counts,vice,admin});
