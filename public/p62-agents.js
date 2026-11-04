/* SATEER P6.2 - Affecter un agent à un bureau ; aucune permission accordée implicitement. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  if (!$('sx-p62-root')) return;
  const unit=$('sx-p4-team-unit'),search=$('sx-p62-search'),people=$('sx-p62-person'),role=$('sx-p62-role');
  const submit=$('sx-p62-assign'),message=$('sx-p62-status'),list=$('sx-p62-members');
  let organisation=null,tenant=null,generation=0,busy=false,eligible=[],roles=[],members=[];
  const id=x=>/^[1-9]\d*$/.test(String(x))?String(x):null;
  const endpoint=path=>`/api/organisations/${encodeURIComponent(organisation)}${path}?tenant=${encodeURIComponent(tenant)}`;
  const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);return e;};
  function status(value,bad=false){message.textContent=value;message.classList.toggle('sx-p62-bad',bad);}
  async function api(url,method='GET',body){
    const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw Error(data.aide||data.statut||`HTTP ${response.status}`);
    return data;
  }
  function label(p){return `${p.prenom||''} ${p.nom||''}`.trim();}
  function render(){
    const lastPerson=people.value,lastRole=role.value;
    people.replaceChildren();people.append(new Option('Choisir une personne',''));
    const q=search.value.trim().toLocaleLowerCase('fr');
    const assigned=new Set(members.map(m=>String(m.personne_id)));
    const filtered=eligible.filter(p=>label(p).toLocaleLowerCase('fr').includes(q));
    for(const p of filtered){
      const opt=new Option(label(p)+(assigned.has(String(p.id))?' · déjà affecté':''),String(p.id));
      opt.disabled=assigned.has(String(p.id));people.add(opt);
    }
    role.replaceChildren();role.append(new Option('Choisir une responsabilité',''));
    for(const r of roles.filter(r=>r.actif!==false && ['UNIT','BOTH'].includes(r.scope))){
      role.add(new Option(r.nom,String(r.id)));
    }
    if([...people.options].some(o=>o.value===lastPerson&&!o.disabled))people.value=lastPerson;
    if([...role.options].some(o=>o.value===lastRole))role.value=lastRole;
    list.replaceChildren();
    if(!members.length) list.append(text('p','Aucun agent affecté pour le moment.'));
    for(const m of members){
      const row=document.createElement('div');row.className='sx-p62-member';
      const detail=document.createElement('span');detail.append(text('strong',`${m.prenom||''} ${m.nom||''}`.trim()),text('small',m.role_nom||'Responsabilité non définie'));
      const actions=document.createElement('div');actions.className='sx-p62-member-actions';
      const roleSelect=document.createElement('select');
      roleSelect.setAttribute('aria-label','Responsabilité de '+label(m));
      roleSelect.append(new Option('Modifier la responsabilité',''));
      for(const r of roles.filter(r=>r.actif!==false && ['UNIT','BOTH'].includes(r.scope))){
        roleSelect.add(new Option(r.nom,String(r.id)));
      }
      const currentRole=String(m.role_id||'');
      if([...roleSelect.options].some(o=>o.value===currentRole))roleSelect.value=currentRole;
      const modify=text('button','Changer le rôle');modify.type='button';
      modify.addEventListener('click',async()=>{
        const nextRole=id(roleSelect.value);
        if(busy||!id(m.relation_id)||!id(unit.value)||!nextRole)return status('Choisissez une responsabilité valide.',true);
        if(nextRole===currentRole)return status('Cette responsabilité est déjà affectée.');
        const chosen=roleSelect.selectedOptions[0]?.textContent;
        if(!confirm(`Changer la responsabilité de ${label(m)} vers « ${chosen} » ?`))return;
        busy=true;setControls();status('Modification de la responsabilité…');
        try{
          await api(endpoint(`/units/${unit.value}/members/${m.relation_id}`),'PATCH',{tenantCode:tenant,roleId:Number(nextRole)});
          status('Responsabilité mise à jour.');await refresh();
        }catch(e){status('Modification refusée : '+e.message,true);}finally{busy=false;setControls();}
      });
      const remove=text('button','Retirer');remove.type='button';remove.disabled=busy||!id(m.relation_id);
      remove.addEventListener('click',async()=>{
        if(busy||!id(m.relation_id)||!id(unit.value))return;
        if(!confirm(`Retirer ${m.prenom||''} ${m.nom||''} de ce bureau ?`))return;
        busy=true;setControls();status('Retrait en cours…');
        try{
          await api(endpoint(`/units/${unit.value}/members/${m.relation_id}/disable`),'POST',{tenantCode:tenant});
          status('Affectation retirée.');await refresh();
        }catch(e){status('Retrait refusé : '+e.message,true);}finally{busy=false;setControls();}
      });
      actions.append(roleSelect,modify,remove);row.append(detail,actions);list.append(row);
    }
    setControls();
  }
  function setControls(){
    submit.disabled=busy||!id(unit.value)||!id(people.value)||!id(role.value);
    for(const button of list.querySelectorAll('button'))button.disabled=busy;
  }
  async function refresh(){
    const token=++generation,uid=id(unit.value);
    eligible=[];members=[];roles=[];people.replaceChildren();role.replaceChildren();list.replaceChildren();
    if(!uid||!organisation){status('Choisissez un bureau.');return;}
    status('Chargement des agents autorisés…');
    try{
      const [directory,existing,allRoles]=await Promise.all([
        api(endpoint(`/units/${uid}/eligible-agents`)),api(endpoint(`/units/${uid}/members`)),api(endpoint('/roles'))
      ]);
      if(token!==generation||uid!==id(unit.value))return;
      eligible=Array.isArray(directory.personnes)?directory.personnes:[];
      members=Array.isArray(existing.membres)?existing.membres:[];
      roles=Array.isArray(allRoles.roles)?allRoles.roles:[];
      render();status(`${members.length} personne(s) affectée(s). Seuls les agents liés à cette organisation sont proposés.`);
    }catch(e){if(token!==generation)return;eligible=[];members=[];roles=[];render();status('Affectation indisponible : '+e.message,true);}
  }
  search.addEventListener('input',()=>{const current=people.value;render();if([...people.options].some(o=>o.value===current&&!o.disabled))people.value=current;setControls();});
  people.addEventListener('change',setControls);role.addEventListener('change',setControls);
  unit.addEventListener('change',refresh);
  submit.addEventListener('click',async()=>{
    if(busy||!id(unit.value)||!id(people.value)||!id(role.value)||!organisation)return;
    const uid=unit.value,pid=people.value,rid=role.value;
    const pname=people.selectedOptions[0]?.textContent,rname=role.selectedOptions[0]?.textContent;
    if(!confirm(`Affecter ${pname} au bureau sélectionné avec la responsabilité « ${rname} » ?\n\nCe choix ne donne aucun droit non prévu dans le rôle.`))return;
    busy=true;setControls();status('Affectation en cours…');
    try{
      await api(endpoint(`/units/${uid}/members`),'POST',{tenantCode:tenant,personneId:Number(pid),roleId:Number(rid),principal:false});
      status('Agent affecté. Ses droits restent ceux de la responsabilité choisie.');
      await refresh();unit.dispatchEvent(new Event('change')); // refresh read-only members in P5.1
    }catch(e){status('Affectation refusée : '+e.message,true);}finally{busy=false;setControls();}
  });
  (async()=>{
    try{
      const context=await window.SATEER_CONTEXT_READY;
      const selected=await window.SATEER_choisirOrganisation(new URLSearchParams(location.search).get('organisation')||null);
      if(!context?.tenantCode||!selected?.id)throw Error('Contexte institutionnel manquant');
      organisation=id(selected.id);tenant=context.tenantCode;
      if(!organisation)throw Error('Organisation invalide');
      await refresh();
    }catch(e){status('Configuration indisponible : '+e.message,true);}
  })();
})();
