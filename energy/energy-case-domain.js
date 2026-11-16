"use strict";
// Métier SUNU Courant : aucune dépendance à Express, PostgreSQL ni au Core.
const PROFILS = Object.freeze(['PARTICULIER','PRO','ORGANISATION']);
const SITES = Object.freeze(['LOGEMENT','COMMERCE','PME','BATIMENT_PUBLIC','INDUSTRIE','EXPLOITATION_AGRICOLE','AUTRE']);
const ALIMENTATIONS = Object.freeze(['RESEAU_PREPAIEMENT','RESEAU_POSTPAIEMENT','SOLAIRE_AUTONOME','GROUPE','MINIRESEAU','HYBRIDE','SANS_ALIMENTATION','INCONNUE']);
const BESOINS = Object.freeze(['FACTURE','COUPURES','CONFORT','FROID','POMPAGE','EFFICACITE','NOUVELLE_INSTALLATION','SOLAIRE','AUTRE']);
const CHAMPS = new Set(['tenantCode','profil','typeSite','nomSite','pays','alimentation','compteur','besoins','description','consentement']);
const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function nonVide(s, limite){return typeof s==='string' && s.trim().length>0 && s.trim().length<=limite;}
function validerSaisie(body, tenant) {
  if(!body || typeof body!=='object' || Array.isArray(body) ||
     Object.keys(body).some(k=>!CHAMPS.has(k)) || !TENANT.test(tenant||'') || body.tenantCode!==tenant ||
     !PROFILS.includes(body.profil) || !SITES.includes(body.typeSite) ||
     !nonVide(body.nomSite,120) || typeof body.pays!=='string' || !/^[A-Z]{2}$/.test(body.pays) ||
     !ALIMENTATIONS.includes(body.alimentation) || !['OUI','NON','INCONNU'].includes(body.compteur) ||
     !Array.isArray(body.besoins) || body.besoins.length<1 || body.besoins.length>6 ||
     new Set(body.besoins).size!==body.besoins.length || body.besoins.some(x=>!BESOINS.includes(x)) ||
     typeof body.description!=='string' || body.description.length>1200 || body.consentement!==true) return null;
  return Object.freeze({profil:body.profil,typeSite:body.typeSite,nomSite:body.nomSite.trim(),pays:body.pays,
    alimentation:body.alimentation,compteur:body.compteur,besoins:[...body.besoins].sort(),description:body.description.trim()});
}
module.exports={PROFILS,SITES,ALIMENTATIONS,BESOINS,TENANT,UUID,validerSaisie};
