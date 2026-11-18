'use strict';
/** Extraction conservatrice : les chaînes OCR ne constituent jamais des mesures vérifiées. */
const FIELDS=Object.freeze(['MARQUE','MODELE','PUISSANCE_W','TENSION_V']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function sanitize(line){return String(line||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);}
function normalizeValue(field,value){
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const v=String(value).normalize('NFKC').trim().replace(/\s+/g,' ');
 if(!v||v.length>80||/[\u0000-\u001f\u007f<>]/.test(v))return null;
 if(field==='MARQUE'||field==='MODELE'){
  if(!/^[\p{L}\p{N}][\p{L}\p{N} ._+\/-]{0,59}$/u.test(v))return null;
  return v;
 }
 if(field==='PUISSANCE_W'||field==='TENSION_V'){
  if(!/^\d{1,8}(?:[.,]\d{1,3})?$/.test(v))return null;
  const n=Number(v.replace(',','.'));
  if(!Number.isFinite(n)||n<=0||n>(field==='PUISSANCE_W'?100000000:1000))return null;
  return String(n);
 }
 return null;
}
function candidatesFromLines(raw){
 if(!Array.isArray(raw)||raw.length>100)return {};
 const lines=raw.map(sanitize).filter(Boolean).slice(0,60);
 const result={};
 const named=[['MARQUE',/\b(?:marque|brand|fabricant|manufacturer)\s*[:#-]\s*(.+)$/i],
  ['MODELE',/\b(?:mod[eè]le|model(?:\s*(?:no|number))?|ref(?:erence|[ée]rence)?|type)\s*[:#-]\s*(.+)$/i]];
 for(const line of lines){
  for(const [field,regex] of named){if(result[field])continue;const m=line.match(regex);
   if(m){const value=normalizeValue(field,m[1].split(/\s{2,}|\s+[|;]\s+/)[0]);if(value)result[field]=value;}
  }
  // Require units physically printed; do not turn consumption kWh/year into nominal W.
  if(!result.PUISSANCE_W){
   const m=line.match(/(?:^|\b)(?:power|puissance|rated\s*power|input|p\.?\s*nom)?\s*[:=]?\s*(\d{1,7}(?:[.,]\d{1,3})?)\s*(kW|W|watts?)\b/i);
   if(m&&!/\b(?:kWh|Wh|annual|annuel|year|an\b|energy|conso)/i.test(line)){
    const n=Number(m[1].replace(',','.'))*(m[2].toLowerCase()==='kw'?1000:1);
    const v=normalizeValue('PUISSANCE_W',String(n));if(v)result.PUISSANCE_W=v;
   }
  }
  if(!result.TENSION_V){
   // Refuse ranges 220-240 V rather than silently choosing one limit.
   const m=line.match(/(?:\bvoltage\b|\btension\b|\brated\s*voltage\b)?\s*[:=]?\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:V|volts?)\b/i);
   if(m&&!/\d\s*[-–]\s*\d+\s*V\b/i.test(line)){const v=normalizeValue('TENSION_V',m[1]);if(v)result.TENSION_V=v;}
  }
 }
 return result;
}
function validateFields(fields){
 if(!Array.isArray(fields)||fields.length<1||fields.length>4)return null;
 const seen=new Set(),out=[];
 for(const item of fields){
  if(!item||typeof item!=='object'||Object.keys(item).sort().join(',')!=='champ,valeur')return null;
  if(!FIELDS.includes(item.champ)||seen.has(item.champ))return null;
  const v=normalizeValue(item.champ,item.valeur);if(v===null)return null;
  seen.add(item.champ);out.push({champ:item.champ,valeur:v});
 }
 return out;
}
module.exports={FIELDS,UUID,normalizeValue,candidatesFromLines,validateFields};
