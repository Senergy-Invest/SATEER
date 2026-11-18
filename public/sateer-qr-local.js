'use strict';
/** QR standard ISO/IEC 18004 : Version 5, niveau L, mode octet UTF-8.
 * Implémentation locale sans service tiers ni donnée personnelle dans le QR.
 * Limite 106 octets de charge utile, suffisante pour l'URL de recette.
 * Tests : décodage indépendant par OpenCV dans le paquet de livraison.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SATEER_QR=api;})
(typeof window!=='undefined'?window:null,function(){
 const SIZE=37,DATA_CW=108,ECC_CW=26;
 function mul(a,b){let v=0;for(let i=7;i>=0;i--){v=(v<<1)^((v&0x80)?0x11d:0);v^=((b>>>i)&1)?a:0;}return v;}
 function ecc(data){
  let divisor=[1],root=1;
  for(let i=0;i<ECC_CW;i++){
   const next=Array(divisor.length+1).fill(0);
   divisor.forEach((c,j)=>{next[j]^=c;next[j+1]^=mul(c,root);});
   divisor=next;root=mul(root,2);
  }
  const rem=Array(ECC_CW).fill(0);
  for(const b of data){const f=b^rem.shift();rem.push(0);for(let j=0;j<ECC_CW;j++)rem[j]^=mul(divisor[j+1],f);}
  return rem;
 }
 function encode(value){
  if(typeof value!=='string'||!/^[\x20-\x7e]+$/.test(value))throw new Error('QR_ADRESSE_INVALIDE');
  const bytes=Array.from(new TextEncoder().encode(value));
  if(bytes.length>106)throw new Error('QR_ADRESSE_TROP_LONGUE');
  const bits=[];function put(num,count){for(let i=count-1;i>=0;i--)bits.push((num>>>i)&1);}
  put(0b0100,4);put(bytes.length,8);bytes.forEach(b=>put(b,8));
  const limit=DATA_CW*8;put(0,Math.min(4,limit-bits.length));
  while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];data.push(b);}
  for(let i=0;data.length<DATA_CW;i++)data.push(i%2?0x11:0xEC);
  const all=data.concat(ecc(data));
  const modules=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
  const reserved=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
  function set(x,y,dark){if(x<0||y<0||x>=SIZE||y>=SIZE)return;modules[y][x]=!!dark;reserved[y][x]=true;}
  function finder(cx,cy){for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   const d=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,d!==2&&d!==4);
  }}
  finder(3,3);finder(SIZE-4,3);finder(3,SIZE-4);
  for(let i=8;i<SIZE-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  // Unique alignement interne de la version 5, centre (30,30).
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(30+dx,30+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
  // Réserver les modules de format en dessinant les bits définitifs (L, masque 0).
  const fmtData=(1<<3)|0;let rem=fmtData;
  for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
  const fmt=((fmtData<<10)|rem)^0x5412;const bit=i=>((fmt>>>i)&1)!==0;
  for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
  for(let i=9;i<15;i++)set(14-i,8,bit(i));
  for(let i=0;i<8;i++)set(SIZE-1-i,8,bit(i));
  for(let i=8;i<15;i++)set(8,SIZE-15+i,bit(i));
  set(8,SIZE-8,true);
  // Dessin colonne double, en zigzag, bits de code puis bits de remplissage.
  let index=0;
  for(let right=SIZE-1;right>=1;right-=2){
   if(right===6)right=5;
   for(let v=0;v<SIZE;v++){
    const upward=(((right+1)&2)===0),y=upward?SIZE-1-v:v;
    for(let offset=0;offset<2;offset++){
     const x=right-offset;if(reserved[y][x])continue;
     let b=0;
     if(index<all.length*8)b=(all[Math.floor(index/8)]>>>(7-index%8))&1;
     modules[y][x]=Boolean(b^(((x+y)%2===0)?1:0));index++;
    }
   }
  }
  if(index<all.length*8)throw new Error('QR_PLACEMENT_INCOMPLET');
  return modules;
 }
 function svgElement(value,document){
  const data=encode(value),svgNS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('xmlns',svgNS);
  svg.setAttribute('viewBox','0 0 45 45');svg.setAttribute('role','img');svg.setAttribute('aria-label','Code QR privé SATEER');
  svg.setAttribute('shape-rendering','crispEdges');
  const bg=document.createElementNS(svgNS,'rect');bg.setAttribute('width','45');bg.setAttribute('height','45');bg.setAttribute('fill','#fff');svg.appendChild(bg);
  const path=document.createElementNS(svgNS,'path');const segments=[];
  for(let y=0;y<37;y++)for(let x=0;x<37;x++)if(data[y][x])segments.push(`M${x+4},${y+4}h1v1h-1z`);
  path.setAttribute('d',segments.join(''));path.setAttribute('fill','#143b32');svg.appendChild(path);return svg;
 }
 return {encode,svgElement};
});
