'use strict';
/** E-METER-1A : registres et index déclaratifs, jamais de différence de kWh calculée. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENERGIES=Object.freeze(['ELECTRICITE','GAZ','EAU','CHALEUR','AUTRE']);
const POINTS=Object.freeze(['GENERAL','SECONDAIRE','AUTRE']);
const TECHNOLOGIES=Object.freeze(['MECANIQUE','ELECTRONIQUE','COMMUNICANT','INCONNUE']);
const COMMERCIAL=Object.freeze(['PREPAYE','POSTPAYE','SANS_CONTRAT','INCONNU']);
const UNITES=Object.freeze(['KWH','KVARH','KVAH','M3','L','KG','H','UNITE']);
const SOURCE='SAISIE_MANUELLE';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=(o,fields,required)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>fields.includes(k))&&required.every(k=>own(o,k));
const label=(s,max=120)=>typeof s==='string'&&s.trim().length>=1&&s.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(s);
const optional=(s,max)=>s===null||s===undefined||label(s,max);
function point(o){if(!obj(o,['nom','energie','typePoint'],['nom','energie','typePoint'])||!label(o.nom)||!ENERGIES.includes(o.energie)||!POINTS.includes(o.typePoint))return null;return Object.freeze({nom:o.nom.trim(),energie:o.energie,typePoint:o.typePoint});}
function appareil(o){if(!obj(o,['nom','technologie','modeCommercial','numeroSerie','registreCode','registreUnite'],['nom','technologie','modeCommercial','registreCode','registreUnite'])||!label(o.nom)||!TECHNOLOGIES.includes(o.technologie)||!COMMERCIAL.includes(o.modeCommercial)||!optional(o.numeroSerie,80)||!registreCode(o.registreCode)||!UNITES.includes(o.registreUnite))return null;return Object.freeze({nom:o.nom.trim(),technologie:o.technologie,modeCommercial:o.modeCommercial,numeroSerie:o.numeroSerie?.trim()||null,registreCode:o.registreCode,registreUnite:o.registreUnite});}
function registreCode(s){return typeof s==='string'&&/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(s);}
function registre(o){if(!obj(o,['code','unite'],['code','unite'])||!registreCode(o.code)||!UNITES.includes(o.unite))return null;return Object.freeze({code:o.code,unite:o.unite});}
function indexManuel(o,now=Date.now()){
 if(!obj(o,['valeur','releveLe','observation'],['valeur','releveLe'])||typeof o.valeur!=='string'||!/^\d{1,14}(?:\.\d{1,6})?$/.test(o.valeur)||!/^(?:\d{4})-(?:\d{2})-(?:\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(o.releveLe||''))return null;
 const ts=Date.parse(o.releveLe);if(!Number.isFinite(ts)||ts>now+300000||ts<Date.UTC(2000,0,1))return null;
 // Empêche les dates normalisées automatiquement par Date.parse (ex. 2026-02-30).
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(o.releveLe);
 const day=Number(m[3]),month=Number(m[2]),year=Number(m[1]);
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||Number(m[4])>23||Number(m[5])>59||Number(m[6])>59)return null;
 if(!optional(o.observation,240))return null;
 const normalized=o.valeur.replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
 return Object.freeze({valeur:normalized,releveLe:new Date(ts).toISOString(),observation:o.observation?.trim()||null,source:SOURCE});
}
module.exports={UUID,ENERGIES,POINTS,TECHNOLOGIES,COMMERCIAL,UNITES,point,appareil,registre,indexManuel};
