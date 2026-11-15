"use strict";
/** SATEER Diaspora D2A — workflow editorial transverse, sans nouvelle table.
 * La validation des droits et du type d'organisation revient exclusivement
 * à la route HTTP. Ce service persiste les transitions et leur audit atomiquement.
 */
function creerServiceBureauDiaspora({executerRequete, obtenirClientDatabase, notifierAbonnesDiaspora = null}) {
  if (typeof executerRequete !== "function" || typeof obtenirClientDatabase !== "function")
    throw new TypeError("DEPENDANCES_DB_REQUISES");
  const listSource = async (orgId, tenant) => {
    const r = await executerRequete(`
      SELECT p.id, p.titre, p.categorie, p.audience_type, p.statut,
             p.statut_diffusion_diaspora, p.date_publication,
             CASE WHEN jsonb_typeof(p.medias)='array' THEN jsonb_array_length(p.medias) ELSE 999 END AS media_count
      FROM publications p JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
      JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
      WHERE p.organisation_id=$1 AND t.code=$2 AND p.statut='PUBLIEE'
      ORDER BY p.date_publication DESC, p.id DESC LIMIT 100`,[orgId,tenant]);
    return r.rows;
  };
  const listQueue = async tenant => {
    const r = await executerRequete(`
      SELECT p.id, p.titre, p.contenu, p.categorie, p.audience_type,
             p.statut_diffusion_diaspora, p.date_soumission_diaspora,
             o.id AS organisation_id, o.nom AS organisation, o.type AS organisation_type
      FROM publications p JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
      JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
      WHERE t.code=$1 AND p.statut='PUBLIEE' AND p.statut_diffusion_diaspora='SOUMISE'
      ORDER BY p.date_soumission_diaspora ASC, p.id ASC LIMIT 100`,[tenant]);
    return r.rows;
  };
  async function transition({mode, publicationId, sourceOrgId=null, tenant, acteurId, motif=null}) {
    if (!['SUBMIT','APPROVE','REJECT'].includes(mode)) throw new TypeError('MODE_INVALIDE');
    const client = await obtenirClientDatabase();
    let begun = false;
    try {
      await client.query('BEGIN'); begun = true;
      const r = await client.query(`
        SELECT p.id,p.organisation_id,p.tenant_id,p.statut,p.statut_diffusion_diaspora,
               p.audience_type,p.medias
        FROM publications p JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
        JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
        WHERE p.id=$1 AND t.code=$2 AND ($3::integer IS NULL OR p.organisation_id=$3)
        FOR UPDATE OF p`,[publicationId,tenant,sourceOrgId]);
      if (r.rowCount!==1) {await client.query('ROLLBACK');begun=false;return {ok:false,code:'PUBLICATION_INTROUVABLE'};}
      const p=r.rows[0];
      const current=p.statut_diffusion_diaspora;
      if (p.statut!=='PUBLIEE' || (mode==='SUBMIT'?current!=='NON_DEMANDEE':current!=='SOUMISE')) {
        await client.query('ROLLBACK');begun=false;return {ok:false,code:'TRANSITION_INTERDITE'};
      }
      // D2A reste strictement textuel et general. Tout autre ciblage necessite
      // la politique d'audience du futur MVP D2B.
      if (mode!=='REJECT' && (p.audience_type!=='TOUS' || !Array.isArray(p.medias) || p.medias.length!==0)) {
        await client.query('ROLLBACK');begun=false;return {ok:false,code:'AUDIENCE_OU_MEDIAS_HORS_PERIMETRE_D2A'};
      }
      const next = mode==='SUBMIT'?'SOUMISE':mode==='APPROVE'?'DIFFUSEE':'REJETEE';
      const update=await client.query(`
        UPDATE publications SET statut_diffusion_diaspora=$1,
          date_soumission_diaspora=CASE WHEN $2::text='SUBMIT' THEN NOW() ELSE date_soumission_diaspora END,
          date_diffusion_diaspora=CASE WHEN $2::text='APPROVE' THEN NOW() ELSE NULL END,
          validee_par_sateer=CASE WHEN $2::text='APPROVE' THEN $3::integer ELSE NULL END,
          rejetee_par_sateer=CASE WHEN $2::text='REJECT' THEN $3::integer ELSE NULL END,
          motif_rejet_diaspora=CASE WHEN $2::text='REJECT' THEN $4::text ELSE NULL END,
          date_rejet_diaspora=CASE WHEN $2::text='REJECT' THEN NOW() ELSE NULL END
        WHERE id=$5::integer AND tenant_id=$6::integer RETURNING id,statut_diffusion_diaspora`,
        [next,mode,acteurId,motif,publicationId,p.tenant_id]);
      if(update.rowCount!==1)throw new Error('UPDATE_PUBLICATION_INCOHERENT');
      // D2B-A : notification opt-in atomique avec l'approbation, jamais à la soumission.
      // Injection explicite afin que le moteur de revue reste testable et isolable.
      const notificationsEnvoyees = mode==='APPROVE' && notifierAbonnesDiaspora
        ? await notifierAbonnesDiaspora(client,Number(publicationId)) : 0;
      await client.query(`
        INSERT INTO audit_trail (tenant_id,organisation_id,personne_id,action,entity_type,entity_id,details)
        VALUES ($1,$2,$3,$4,'publications',$5,$6::jsonb)`,
        [p.tenant_id,p.organisation_id,acteurId,'DIASPORA_'+mode,String(publicationId),
          JSON.stringify({avant:current,apres:next,motif:mode==='REJECT'?motif:null,sourceOrganisationId:p.organisation_id,notificationsEnvoyees})]);
      await client.query('COMMIT'); begun=false;
      return {ok:true,id:Number(update.rows[0].id),statut:next};
    } catch(e) {if(begun)await client.query('ROLLBACK').catch(()=>{});throw e;}
    finally {client.release();}
  }
  return Object.freeze({listSource,listQueue,transition});
}
module.exports={creerServiceBureauDiaspora};
