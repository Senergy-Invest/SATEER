'use strict';
/** OCR d'index : propose uniquement, ne valide ni mesure ni consommation. */
const {UNITES}=require('./energy-meter-domain');
const UNIT_ALIASES=Object.freeze({KWH:['KWH'],KVARH:['KVARH'],KVAH:['KVAH'],M3:['M3','M³'],L:['L'],KG:['KG'],H:['H'],UNITE:['UNITE']});
function candidate(lines,unite){
 if(!Array.isArray(lines)||lines.length>60||!UNITES.includes(unite)||lines.some(v=>typeof v!=='string'||v.length>250))return {statut:'OCR_SORTIE_INVALIDE'};
 const distinct=new Set(),mismatch=[];
 for(let raw of lines){
  const line=raw.normalize('NFKC').trim().replace(/\s+/g,' ');
  // Ne jamais choisir un numéro de série, une date, un tarif ou une valeur entourée d'autres données.
  const m=/^(?:(?:INDEX|RELEVE|RELEVÉ|READING|TOTAL)\s*[:=#-]?\s*)?(\d{1,14}(?:[.,]\d{1,6})?)(?:\s*(KWH|KVARH|KVAH|M3|M³|KG|UNITE|H|L))?$/iu.exec(line);
  if(!m)continue;
  if(m[1].includes(',')&&/\,\d{3}$/.test(m[1]))return {statut:'OCR_AMBIGU_SEPARATEUR'};
  if(m[2]&&!UNIT_ALIASES[unite].includes(m[2].toUpperCase())){mismatch.push(m[2]);continue;}
  const n=m[1].replace(',','.').replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
  distinct.add(n);
 }
 if(mismatch.length)return {statut:'OCR_UNITE_INCOMPATIBLE'};
 if(distinct.size===0)return {statut:'OCR_AUCUN_INDEX_LISIBLE'};
 if(distinct.size>1)return {statut:'OCR_PLUSIEURS_INDEX_POSSIBLES'};
 return {statut:'OCR_INDEX_A_CONFIRMER',valeurProposee:[...distinct][0],unite,verification:'NON_VERIFIEE'};
}
module.exports={candidate};
