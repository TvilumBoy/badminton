// Stævne → disciplin → op til 15 screenshots. Existing storage is preserved.
let batchFiles=[],batchBusy=false,disciplineSection='cleanup',disciplineMenuOpen=false;
state.aiDrafts ||= {};
const draftKey=()=>activeTournament+':'+activeDiscipline;
function eventSwitch(id){state.baselines[activeTournament]=structuredClone(state.profile);activeTournament=id;state.profile=structuredClone(state.baselines[id]||{...state.profile,confirmed:false});save()}
function openEvent(id){if(batchBusy)return toast('Vent til aflæsningen er færdig.');eventSwitch(id);view='event';activeDiscipline='all';batchFiles=[];render()}
function openDiscipline(d){if(batchBusy)return toast('Vent til aflæsningen er færdig.');activeDiscipline=d;view='discipline';batchFiles=[];disciplineSection='cleanup';disciplineMenuOpen=false;render();window.scrollTo(0,0)}
const doubleRoles={self:'Din egen profil',partner:'Din doublemakker',opponent1:'Modstander 1',opponent2:'Modstander 2'};
function doubleFile(role){return batchFiles.find(f=>f.role===role)}
function storedDoubleUpload(role){return scopedUploads().find(u=>u.role===role)}
function doubleRoleAvailable(role){return !!doubleFile(role)||!!storedDoubleUpload(role)}
function doubleReady(){return ['self','partner','opponent1','opponent2'].every(doubleRoleAvailable)&&(batchFiles.some(f=>f.role==='result')||scopedUploads().some(u=>u.role==='result'))}
async function storeBatchFile(file,role){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>12*1024*1024)throw Error('Brug JPG, PNG eller WebP på højst 12 MB pr. billede.');
 const id='batch-'+crypto.randomUUID();
 await imagePut(id,file);
 state.uploads.push({id,name:file.name,date:new Date().toISOString().slice(0,10),tournament:activeTournament,discipline:activeDiscipline,role});
 return {id,file,role};
}
async function setDoubleSlot(role,files){
 try{
  if(role==='result'){
   if(files.length>11)return toast('Vælg højst 11 billeder af kamp og resultat.');
   batchFiles=batchFiles.filter(f=>f.role!=='result');
   for(const file of files)batchFiles.push(await storeBatchFile(file,'result'));
  }else{
   if(!files[0])return;
   batchFiles=batchFiles.filter(f=>f.role!==role);
   batchFiles.push(await storeBatchFile(files[0],role));
  }
  if(batchFiles.length>15){batchFiles=batchFiles.slice(0,15);return toast('Der kan højst bruges 15 billeder i alt.')}
  save();renderFlow();
  $('#batch-status').textContent=doubleReady()?'Alle nødvendige Double-billeder er valgt. Tryk “Start samlet aflæsning med Groq”.':'Billederne er gemt. Vælg de resterende Double-billeder.';
 }catch(e){toast(e.message||'Et billede kunne ikke gemmes.')}
}
function scopedUploads(){return state.uploads.filter(u=>u.tournament===activeTournament&&u.discipline===activeDiscipline)}
async function imageDelete(id){try{const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('images','readwrite');t.objectStore('images').delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error)});d.close()}catch{}try{await cloudImageDelete(id)}catch{}}
function roleLabel(role){return doubleRoles[role]||({result:'Kamp/resultat',general:'Billede'}[role]||'Billede')}
function clearOwnDiscipline(){state.profile[activeDiscipline]='';const countKey=activeDiscipline+'Count';if(countKey in state.profile)state.profile[countKey]='';state.profile.confirmed=false}
function clearOpponentDisciplineByEvidence(ids){
 const idSet=new Set(ids);
 for(const o of state.opponents){
  const had=(o.images||[]).some(im=>idSet.has(im.id));
  if(!had)continue;
  o.images=(o.images||[]).filter(im=>!idSet.has(im.id));
  o[activeDiscipline]='';
  const countKey=activeDiscipline+'Count';if(countKey in o)o[countKey]='';
  if(!o.images.length)o.date='';
 }
 const seeded=new Set(OPPONENT_SEED.map(o=>o.id));
 state.opponents=state.opponents.filter(o=>{
  if(seeded.has(o.id))return true;
  const usedElsewhere=state.matches.some(m=>(m.opponentId===o.id||m.opponentIds?.includes(o.id))&&!(m.tournament===activeTournament&&m.discipline===activeDiscipline));
  return (o.images?.length||0)>0||usedElsewhere||positive(o.single)||positive(o.double)||positive(o.mix);
 });
}
async function deleteEvidenceImage(id){
 const upload=state.uploads.find(u=>u.id===id);
 await imageDelete(id);
 state.uploads=state.uploads.filter(u=>u.id!==id);
 batchFiles=batchFiles.filter(f=>f.id!==id);
 const draft=state.aiDrafts[draftKey()];
 if(draft){draft.results=draft.results.filter(r=>r.id!==id);if(!draft.results.length)delete state.aiDrafts[draftKey()]}
 state.matches=state.matches.filter(m=>!(m.tournament===activeTournament&&m.discipline===activeDiscipline&&m.sourceImage===id));
 clearOpponentDisciplineByEvidence([id]);
 if(upload?.role==='self')clearOwnDiscipline();
 save();render();
}
function removeAiPlayerAt(index){
 const draft=state.aiDrafts[draftKey()],players=combinedPlayers(draft),p=players[index];if(!draft||!p)return;
 for(const r of draft.results)r.data.players=(r.data.players||[]).filter(q=>!samePlayer(q,p));
 if(samePlayer(p,state.profile))clearOwnDiscipline();
 else{
  const o=state.opponents.find(o=>samePlayer(o,p));
  if(o){o[activeDiscipline]='';const ck=activeDiscipline+'Count';if(ck in o)o[ck]='';}
 }
 save();render();
}
function matchSignature(m){return JSON.stringify({discipline:m.discipline,sideA:m.sideA,sideB:m.sideB,sets:m.sets,round:m.round,status:m.status})}
function removeAiMatchAt(index){
 const draft=state.aiDrafts[draftKey()],p=aiProposals[index];if(!draft||!p)return;
 const source=draft.results.find(r=>r.id===p.sourceImage);if(source){
  source.data.matches=(source.data.matches||[]).filter(m=>{
   if(m.discipline!==activeDiscipline)return true;
   const a=m.sideA.some(x=>samePlayer(x,state.profile)),b=m.sideB.some(x=>samePlayer(x,state.profile));if(a===b)return true;
   const other=(a?m.sideB:m.sideA).map(x=>x.name).join(' / ');
   const scores=m.sets.map(s=>a?`${s.a}-${s.b}`:`${s.b}-${s.a}`).join(', ');
   return !(other===p.opponent&&m.round===p.round&&scores===p.scores);
  });
 }
 state.matches=state.matches.filter(m=>!(m.tournament===activeTournament&&m.discipline===activeDiscipline&&m.sourceImage===p.sourceImage&&norm(m.opponent)===norm(p.opponent)&&m.round===p.round));
 save();render();
}
async function resetActiveDiscipline(){
 const t=state.tournaments.find(t=>t.id===activeTournament);const title=(t?.name||'stævnet')+' · '+(labels[activeDiscipline]||activeDiscipline);
 if(!confirm('Slet ALT i '+title+'?\n\nDet sletter uploadede billeder, AI-aflæsninger, gemte '+(labels[activeDiscipline]||'')+'-kampe og de profilpoint, der er knyttet til disse billeder. Andre discipliner bevares.'))return;
 const ids=scopedUploads().map(u=>u.id);
 for(const id of ids)await imageDelete(id);
 state.uploads=state.uploads.filter(u=>!(u.tournament===activeTournament&&u.discipline===activeDiscipline));
 delete state.aiDrafts[draftKey()];
 state.matches=state.matches.filter(m=>!(m.tournament===activeTournament&&m.discipline===activeDiscipline));
 clearOpponentDisciplineByEvidence(ids);
 clearOwnDiscipline();
 batchFiles=[];
 save();render();
 $('#batch-status').textContent='Alt i denne disciplin er slettet. Du kan nu starte forfra med nye billeder.';
 toast('Disciplinen er nulstillet. Du kan starte forfra.');
}

const oldRender=render;
render=function(){oldRender();renderFlow()};
const oldOpenMatch=openMatch;
openMatch=function(id=null,proposal=null){oldOpenMatch(id,proposal);if(!id&&!proposal&&['single','double','mix'].includes(activeDiscipline)){$('#m-discipline').value=activeDiscipline;$('#double-fields').hidden=activeDiscipline==='single'}};
function setDisciplineSection(section){
 if(!['cleanup','review','points','notes'].includes(section))return;
 disciplineSection=section;disciplineMenuOpen=false;renderDisciplineMenu();
 const nav=$('.discipline-nav');if(nav)nav.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDisciplineMenu(){
 const labelsMap={cleanup:'1. Billeder og oprydning',review:'2. Kontrollér aflæsningen',points:'3. Kampe og forventede point',notes:'4. Resultat og noter'};
 const menu=$('#discipline-menu'),button=$('#discipline-menu-button'),label=$('#discipline-menu-label');
 if(!menu||!button||!label)return;
 label.textContent=labelsMap[disciplineSection]||labelsMap.cleanup;
 menu.hidden=!disciplineMenuOpen;button.setAttribute('aria-expanded',disciplineMenuOpen?'true':'false');
 ['cleanup','review','points','notes'].forEach(s=>{const pane=$('#discipline-pane-'+s);if(pane)pane.hidden=s!==disciplineSection;const b=menu.querySelector('[data-discipline-section="'+s+'"]');if(b)b.setAttribute('aria-current',s===disciplineSection?'true':'false')});
}
function simpleMatchNames(m){
 const own=(m.ownPlayers||[]).map(p=>p.name).filter(Boolean);
 const opp=(m.opponentPlayers||[]).map(p=>p.name).filter(Boolean);
 return {own:own.length?own.join(' / '):(state.profile.name||'Dit hold'),opp:opp.length?opp.join(' / '):(m.opponent||'Modstander')};
}
function renderDisciplineNotes(){
 const box=$('#discipline-notes-list');if(!box)return;
 const ms=selectedMatches().filter(m=>m.discipline===activeDiscipline);
 box.innerHTML=ms.map(m=>{const n=simpleMatchNames(m);return `<article class="simple-note-card"><div class="simple-note-names">${esc(n.own)}</div><div class="simple-note-vs">mod ${esc(n.opp)}</div><div class="simple-result-row"><label class="field"><span>Resultat</span><input data-note-score="${esc(m.id)}" value="${esc(m.scores||'')}" placeholder="Fx 15-11, 15-9" maxlength="80"></label><label class="field"><span>Noter</span><textarea data-note-text="${esc(m.id)}" maxlength="10000" placeholder="Skriv dine noter til kampen …">${esc(m.notes||'')}</textarea></label></div><button class="secondary" data-save-simple-note="${esc(m.id)}">Gem resultat og noter</button></article>`}).join('')||'<p class="muted">Ingen kampe i denne disciplin endnu.</p>';
}
function saveSimpleResultAndNote(id){
 const m=state.matches.find(m=>m.id===id);if(!m)return;
 const score=document.querySelector('[data-note-score="'+CSS.escape(id)+'"]')?.value.trim()||'';
 const notes=document.querySelector('[data-note-text="'+CSS.escape(id)+'"]')?.value.trim()||'';
 m.scores=score;m.notes=notes;
 const inferred=resultFromScores(score);if(inferred)m.result=inferred;
 save();render();disciplineSection='notes';renderDisciplineMenu();toast('Resultat og noter er gemt.');
}
function renderFlow(){
 state.aiDrafts ||= {};
 $('#home-list').innerHTML=state.tournaments.map(t=>`<button class="event-card secondary" data-event="${esc(t.id)}"><strong>${esc(t.name)}</strong><small>${esc(t.date)} · ${esc(t.level)}</small><span>Åbn stævne →</span></button>`).join('');
 const t=state.tournaments.find(t=>t.id===activeTournament);
 $('#event-title').textContent=t?.name||'Stævne';$('#event-date').textContent=t?.date||'';
 $('#discipline-choices').innerHTML=Object.entries(labels).map(([d,n])=>`<button class="discipline-card secondary" data-discipline="${d}"><strong>${n}</strong><small>${selectedMatches().filter(m=>m.discipline===d).length} kampe</small><span>Upload billeder →</span></button>`).join('');
 $('#discipline-title').textContent=(t?.name||'Stævne')+' · '+(labels[activeDiscipline]||'');
 $('#discipline-help').textContent=activeDiscipline==='single'?'Upload egen spillerprofil, modstanderprofiler og kampprogram eller resultater.':activeDiscipline==='double'?'Upload de fire spillerprofiler fra i dag og derefter billeder af kampen/resultatet. Til sidst starter du én samlet aflæsning.':'Upload egen profil, din makkers profil, begge modstanderes profiler og kampprogram eller resultater.';
 const isDouble=activeDiscipline==='double';
 const uploads=scopedUploads();
 const uploadPanel=$('#ai-upload-panel'),uploadTarget=(uploads.length&&!(view==='discipline'&&batchFiles.length))?$('#upload-panel-more'):$('#upload-panel-main');
 if(uploadPanel&&uploadTarget&&uploadPanel.parentElement!==uploadTarget)uploadTarget.appendChild(uploadPanel);
 $('#discipline-cleanup').hidden=!uploads.length;
 $('#standard-batch-upload').hidden=isDouble;
 $('#double-batch-upload').hidden=!isDouble;
 $('#batch-heading').textContent=isDouble?(uploads.length?'Upload flere profiler eller kamp/resultat':'1. Upload profiler og kamp/resultat'):(uploads.length?'Upload flere billeder':'1. Upload op til 15 billeder');
 $('#batch-list').innerHTML=batchFiles.map(f=>`<li>${esc(f.file.name)}</li>`).join('');
 $('#batch-count').textContent=batchFiles.length?`${batchFiles.length} nye billeder valgt`:'Ingen nye billeder valgt';
 if(isDouble){
  for(const role of Object.keys(doubleRoles)){const f=doubleFile(role),u=storedDoubleUpload(role);$('#double-'+role+'-name').textContent=f?f.file.name:u?u.name:'Intet billede valgt.'}
  const results=batchFiles.filter(f=>f.role==='result'),storedResults=scopedUploads().filter(u=>u.role==='result');$('#double-result-name').textContent=results.length?results.map(f=>f.file.name).join(', '):storedResults.length?storedResults.map(u=>u.name).join(', '):'Ingen kampbilleder valgt.';
  $('#double-batch-count').textContent=`${batchFiles.length} nye billeder valgt · ${doubleReady()?'de nødvendige profiler/resultat findes':'mangler et eller flere nødvendige billeder'}`;
 }
 $('#batch-analyze').textContent=isDouble?'Start samlet aflæsning med Groq':'Aflæs billeder med Groq';
 $('#batch-analyze').disabled=batchBusy||!batchFiles.length||(isDouble&&!doubleReady());
 $('#batch-input').disabled=batchBusy;
 ['self','partner','opponent1','opponent2','result'].forEach(role=>{const el=$('#double-'+role+'-input');if(el)el.disabled=batchBusy});
 $('#reset-discipline').textContent='Slet alt i '+(t?.name||'stævnet')+' · '+(labels[activeDiscipline]||'');
 $('#uploads-title').textContent=(t?.name||'Stævne')+' · '+(labels[activeDiscipline]||'')+' · Uploadede billeder';
 $('#players-title').textContent=(t?.name||'Stævne')+' · Spillerprofiler til dette stævne';
 $('#discipline-upload-list').innerHTML=uploads.map(u=>`<article class="review-player"><strong>${esc(u.name)}</strong><small>${esc(roleLabel(u.role))} · ${esc(u.date||'')}</small><div class="actions"><button class="link-btn" data-image="${esc(u.id)}">Se billede</button><button class="danger" data-delete-upload="${esc(u.id)}">Slet billede + aflæsning</button></div></article>`).join('')||'<p class="muted">Ingen uploadede billeder i denne disciplin.</p>';
 $('#discipline-matches').innerHTML=selectedMatches().filter(m=>m.discipline===activeDiscipline).map(m=>{const c=calculation(m);const teams=m.ownPlayers?.length&&m.opponentPlayers?.length?matchupHtml(m):'';const outcome=activeDiscipline==='single'?`<div class="versus-score">${esc(m.scores||'Afventer resultat')}</div><p>${c.delta===undefined?esc(c.reason):signed(c.delta)+' point'}</p>`:matchOutcomeHtml(m,c);return `<article class="match-card"><div class="between"><h3>${esc(m.round||'Kamp')}</h3><b>${m.result==='win'?'Sejr':m.result==='loss'?'Nederlag':'Planlagt'}</b></div>${teams}${outcome}${m.notes?`<p class="match-note">${esc(m.notes)}</p>`:''}<div class="actions"><button class="danger" data-delete-saved-match="${esc(m.id)}">Slet kamp</button></div></article>`}).join('')||'<p class="muted">Ingen kampe endnu. Upload billeder eller tilføj en kamp.</p>';
 if(labels[activeDiscipline]){const a=totals(activeDiscipline),el=$('#discipline-total');if(a.count&&a.ready===a.count){const expected=Number(state.profile[activeDiscipline])+a.sum;el.innerHTML=`<strong class="${a.sum>=0?'good':'bad'}">${esc(signed(a.sum))} point</strong><span>Forventet ${esc(fmt(expected))} point</span>`}else el.innerHTML='<span>Point vises, når startpoint og kampoplysninger er godkendt.</span>'}
 renderDraft();
 renderDisciplineNotes();
 renderDisciplineMenu();
}
const norm=s=>String(s||'').normalize('NFC').trim().toLocaleLowerCase('da-DK');
function samePlayer(a,b){return a.id&&b.id?a.id===b.id:!!a.name&&norm(a.name)===norm(b.name)}
function nameKey(s){return norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function levenshtein(a,b){a=nameKey(a);b=nameKey(b);const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const row=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){let prev=row[0];row[0]=i;for(let j=1;j<=n;j++){const tmp=row[j],cost=a[i-1]===b[j-1]?0:1;row[j]=Math.min(row[j]+1,row[j-1]+1,prev+cost);prev=tmp}}return row[n]}
function samePlayerLoose(a,b){if(!(a&&b))return false;if(a.id&&b.id&&a.id===b.id)return true;if(a.name&&b.name&&norm(a.name)===norm(b.name))return true;if(!a.name||!b.name)return false;const aa=nameKey(a.name).split(' ').filter(Boolean),bb=nameKey(b.name).split(' ').filter(Boolean);if(!aa.length||!bb.length)return false;const sameEnds=aa[0]===bb[0]&&aa[aa.length-1]===bb[bb.length-1];const sameClub=!a.club||!b.club||nameKey(a.club)===nameKey(b.club);return sameEnds&&sameClub&&levenshtein(a.name,b.name)<=2}
function tournamentDate(){return state.tournaments.find(t=>t.id===activeTournament)?.date||''}
function combinedPlayers(draft){const map=[];const eventDate=tournamentDate();for(const image of draft?.results||[])for(const raw of image.data.players){const p={...raw,date:raw.date||eventDate};let q=map.find(x=>samePlayer(x,p));if(!q){q={...p,images:[],conflicts:[]};map.push(q)}else{if(!q.id&&p.id)q.id=p.id;if(!q.name&&p.name)q.name=p.name;if(!q.club&&p.club)q.club=p.club;if(!q.date&&p.date)q.date=p.date}for(const d of ['single','double','mix'])if(p[d]!=null){if(q[d]!=null&&q[d]!==p[d])q.conflicts.push(d);else q[d]=p[d]}q.images.push(image.id)}return map}
function proposalMatches(draft){const players=combinedPlayers(draft),out=[];const rating=p=>{let hits=players.filter(q=>samePlayerLoose(p,q));if(hits.length!==1&&p?.name)hits=players.filter(q=>q.name&&norm(q.name)===norm(p.name));if(hits.length===1&&!hits[0].conflicts.includes(activeDiscipline)&&positive(hits[0][activeDiscipline]))return hits[0][activeDiscipline];if(samePlayerLoose(p,state.profile))return state.profile[activeDiscipline]??'';return ''};const detail=p=>({id:p.id||'',name:p.name||'',club:p.club||'',points:rating(p)});
 for(const image of draft?.results||[])for(const m of image.data.matches){const expectedCount=activeDiscipline==='single'?1:2;const inferredSelected=m.discipline==='unknown'&&m.sideA?.length===expectedCount&&m.sideB?.length===expectedCount;if(m.discipline!==activeDiscipline&&!inferredSelected)continue;const a=m.sideA.some(p=>samePlayerLoose(p,state.profile)),b=m.sideB.some(p=>samePlayerLoose(p,state.profile));if(a===b)continue;const own=a?m.sideA:m.sideB,other=a?m.sideB:m.sideA;const n=activeDiscipline==='single'?1:2;if(own.length!==n||other.length!==n)continue;const scores=m.sets.map(s=>a?`${s.a}-${s.b}`:`${s.b}-${s.a}`).join(', ');const partner=own.find(p=>!samePlayerLoose(p,state.profile));const p={id:'',tournament:activeTournament,discipline:activeDiscipline,opponent:other.map(p=>p.name).join(' / '),club:other.map(p=>p.club).filter(Boolean).join(' / '),opponentId:activeDiscipline==='single'&&state.opponents.some(o=>o.id===other[0].id)?other[0].id:'',scores,result:resultFromScores(scores)||'pending',round:m.round,points:rating(other[0]),partnerPoints:partner?rating(partner):'',opponentPartnerPoints:other[1]?rating(other[1]):'',status:m.status==='normal'?'normal':'special',confirmed:false,notes:'',sourceImage:image.id,opponentIds:other.map(p=>p.id).filter(Boolean),partnerName:partner?.name||'',ownPlayers:own.map(detail),opponentPlayers:other.map(detail)};
 if(!out.some(x=>x.opponent===p.opponent&&x.round===p.round&&x.scores===p.scores))out.push(p)}return out}
function playerLineHtml(p){const pts=positive(p?.points)?fmt(Number(p.points))+' point':'point mangler';return `<div class="player-line"><div><strong>${esc(p?.name||'Navn mangler')}</strong><small>${esc(p?.club||'Klub mangler')}${p?.id?' · '+esc(p.id):''}</small></div><span class="player-points">${esc(pts)}</span></div>`}
function pairAverage(players){const nums=(players||[]).map(p=>Number(p.points)).filter(n=>Number.isFinite(n)&&n>0);if(nums.length!==(players||[]).length||!nums.length)return null;return nums.reduce((a,b)=>a+b,0)/nums.length}
function pairAverageHtml(players){const a=pairAverage(players);return a==null?'':`<div class="pair-average">Parrets gennemsnit: ${esc(fmt(a))} point</div>`}
function matchupHtml(p){const ownPlayers=p.ownPlayers||[],oppPlayers=p.opponentPlayers||[],own=ownPlayers.map(playerLineHtml).join(''),opp=oppPlayers.map(playerLineHtml).join('');return `<div class="versus-side"><small>Dit hold</small>${own}${pairAverageHtml(ownPlayers)}</div><div class="versus-side"><small>Modstandere</small>${opp}${pairAverageHtml(oppPlayers)}</div>`}
function pointDifferenceHtml(ours,theirs){if(!Number.isFinite(Number(ours))||!Number.isFinite(Number(theirs)))return '';const diff=Number(ours)-Number(theirs),shown=(diff>0?'+':'')+fmt(diff);return `<div class="point-difference">Pointforskel: ${esc(fmt(Number(ours)))} − ${esc(fmt(Number(theirs)))} = ${esc(shown)} point</div>`}
function matchOutcomeHtml(m,c){const resultText=m.result==='win'?'Sejr':m.result==='loss'?'Nederlag':'Afventer resultat';const points=c.delta===undefined?esc(c.reason):esc(signed(c.delta)+' point');const difference=activeDiscipline==='single'?'':pointDifferenceHtml(c.ours,c.theirs);return `<div class="match-outcome"><div class="versus-score">${esc(m.scores||'Resultat mangler')}</div><div class="match-outcome-result">${resultText}</div>${difference}<div class="match-outcome-points">${points}</div></div>`}
function proposalPointPreview(p){if(p.status!=='normal'||!['win','loss'].includes(p.result))return '';const ours=pairAverage(p.ownPlayers||[]),theirs=pairAverage(p.opponentPlayers||[]);if(ours==null||theirs==null)return '';return `${pointDifferenceHtml(ours,theirs)}<div class="match-outcome-points">${esc(signed(pointChange(ours,theirs,p.result))+' point')}</div>`}
let aiPlayerEditIndex=null;
function openAiPlayerEditor(index){
 const p=combinedPlayers(state.aiDrafts[draftKey()])[index];if(!p)return;
 aiPlayerEditIndex=index;
 $('#ai-player-index').value=String(index);
 $('#ai-edit-name').value=p.name||'';
 $('#ai-edit-id').value=p.id||'';
 $('#ai-edit-club').value=p.club||'';
 $('#ai-edit-date').value=p.date||tournamentDate();
 $('#ai-edit-points-label').textContent=(labels[activeDiscipline]||'')+'-point';
 $('#ai-edit-points').value=p[activeDiscipline]??'';
 $('#ai-player-dialog').showModal();
}
function syncEditedPlayerIntoMatches(old,updated){
 const newPoint=updated[activeDiscipline];
 for(const m of state.matches){
  if(m.tournament!==activeTournament||m.discipline!==activeDiscipline)continue;
  for(const key of ['ownPlayers','opponentPlayers']){
   for(const p of m[key]||[]){
    if(samePlayerLoose(p,old)){
     p.name=updated.name;p.id=updated.id;p.club=updated.club;
     if(newPoint!=null)p.points=newPoint;
    }
   }
  }
  if(m.ownPlayers?.length){
   const partner=m.ownPlayers.find(p=>!samePlayerLoose(p,state.profile));
   if(partner&&positive(partner.points))m.partnerPoints=Number(partner.points);
  }
  if(m.opponentPlayers?.length){
   if(positive(m.opponentPlayers[0]?.points))m.points=Number(m.opponentPlayers[0].points);
   if(m.opponentPlayers[1]&&positive(m.opponentPlayers[1].points))m.opponentPartnerPoints=Number(m.opponentPlayers[1].points);
   m.opponent=m.opponentPlayers.map(p=>p.name).filter(Boolean).join(' / ');
   m.club=m.opponentPlayers.map(p=>p.club).filter(Boolean).join(' / ');
  }
 }
}
function applyAiPlayerEdit(){
 const draft=state.aiDrafts[draftKey()],players=combinedPlayers(draft),old=players[Number($('#ai-player-index').value)];if(!draft||!old)return;
 const updated={name:$('#ai-edit-name').value.trim(),id:$('#ai-edit-id').value.trim(),club:$('#ai-edit-club').value.trim(),date:$('#ai-edit-date').value,[activeDiscipline]:$('#ai-edit-points').value===''?null:Number($('#ai-edit-points').value)};
 for(const r of draft.results){
  for(const p of r.data.players||[]){if(samePlayerLoose(p,old)){p.name=updated.name;p.id=updated.id;p.club=updated.club;p.date=updated.date;p[activeDiscipline]=updated[activeDiscipline]}}
  for(const m of r.data.matches||[])for(const side of [m.sideA,m.sideB])for(const p of side||[]){if(samePlayerLoose(p,old)){p.name=updated.name;p.id=updated.id;p.club=updated.club}}
 }
 const saved=state.opponents.find(o=>samePlayerLoose(o,old));if(saved){saved.name=updated.name;saved.id=updated.id;saved.club=updated.club;saved.date=updated.date;if(updated[activeDiscipline]!=null)saved[activeDiscipline]=updated[activeDiscipline]}
 syncEditedPlayerIntoMatches(old,updated);
 save();render();$('#ai-player-dialog').close();toast('Spillerprofilen er rettet, og fundne kampe er opdateret.');
}
let aiProposals=[];
function renderDraft(){const draft=state.aiDrafts[draftKey()],ps=combinedPlayers(draft);aiProposals=proposalMatches(draft);if(!draft){$('#ai-warnings').innerHTML='';$('#ai-matches').innerHTML='<p class="muted">Ingen aflæsning endnu. Upload og aflæs billeder under “Billeder og oprydning”.</p>';return}
 $('#ai-warnings').innerHTML=[...new Set(draft.results.flatMap(r=>r.data.warnings))].map(w=>`<li>${esc(w)}</li>`).join('');
 $('#ai-players').innerHTML=ps.map((p,i)=>{const shownDate=p.date?p.date.split('-').reverse().join('.'):'Dato mangler';return `<article class="review-player"><strong>${esc(p.name)}</strong><small>${esc(p.id||'ID mangler')} · ${esc(p.club)} · ${esc(shownDate)}</small><p>${labels[activeDiscipline]}: ${p.conflicts.includes(activeDiscipline)?'Modstridende point — kontrollér billederne':esc(p[activeDiscipline]??'Point mangler')}</p><div class="actions"><button class="secondary" data-edit-ai-player="${i}">Rediger profil</button><button class="secondary" data-ai-player="${i}">${samePlayer(p,state.profile)?'Kontrollér mine startpoint':'Gem profil og billeder'}</button></div><button class="link-btn" data-image="${esc(p.images[0])}">Se kildebillede</button><button class="danger" data-delete-ai-player="${i}">Fjern aflæst profil</button></article>`}).join('')||'<p>Ingen spillerprofiler aflæst endnu.</p>';
 $('#ai-matches').innerHTML=aiProposals.map((p,i)=>`<article class="versus-card"><div class="between"><strong>${esc(p.round||'Kamp')}</strong><span class="${p.result==='win'?'good':p.result==='loss'?'bad':'muted'}">${p.result==='win'?'Sejr':p.result==='loss'?'Nederlag':'Afventer'}</span></div>${matchupHtml(p)}<div class="versus-score">${esc(p.scores||'Planlagt')}</div>${proposalPointPreview(p)}<div class="actions"><button class="secondary" data-ai-match="${i}">Kontrollér og gem kamp</button><button class="link-btn" data-image="${esc(p.sourceImage)}">Se resultatbillede</button><button class="danger" data-delete-ai-match="${i}">Fjern aflæst kamp</button></div></article>`).join('')||'<p>Ingen entydige kampe fundet for din spiller og denne disciplin. Kontrollér spillerprofilerne, eller tilføj kampen manuelt.</p>';
}
function rebuildAiMatchesFromDraft(){
 const ids=new Set(scopedUploads().map(u=>u.id));
 state.matches=state.matches.filter(m=>!(m.tournament===activeTournament&&m.discipline===activeDiscipline&&m.sourceImage&&ids.has(m.sourceImage)));
 const proposals=proposalMatches(state.aiDrafts[draftKey()]);
 for(const p of proposals)state.matches.push({...structuredClone(p),id:'ai-'+crypto.randomUUID(),confirmed:false});
}
async function recalculateActiveDiscipline(){
 if(batchBusy)return;
 const uploads=scopedUploads();
 if(!uploads.length)return toast('Der er ingen billeder at genberegne.');
 const code=$('#recalc-ai-code').value||$('#ai-code').value;
 if(!code)return toast('Indtast adgangskoden til AI-aflæsning.');
 $('#ai-code').value=code;
 batchBusy=true;$('#recalculate-discipline').disabled=true;
 const key=draftKey();state.aiDrafts[key]={results:[]};batchFiles=[];
 try{
  for(let i=0;i<uploads.length;i++){
   const u=uploads[i],file=await imageGet(u.id);
   if(!file)throw Error('Billedet '+u.name+' findes ikke længere i denne browser.');
   batchFiles.push({id:u.id,file,role:u.role||'general'});
   $('#recalculate-status').textContent=`Genberegner billede ${i+1} af ${uploads.length}: ${u.name} …`;
   const data=await requestImage(file,u.role||'general',wait=>{$('#recalculate-status').textContent=`Groq holder en kort pause pga. gratisgrænsen. Fortsætter om ca. ${wait} sekunder …`});
   for(const p of data.players||[])if(!p.date)p.date=tournamentDate();
   state.aiDrafts[key].results.push({id:u.id,role:u.role||'general',data});
   save();
  }
  rebuildAiMatchesFromDraft();
  save();render();
  $('#recalculate-status').textContent='Genberegningen er færdig. Spillerprofiler, modstandere og resultater er læst på ny.';
  toast('Genberegningen er færdig.');
 }catch(e){
  $('#recalculate-status').textContent=e.message||'Genberegningen mislykkedes.';
 }finally{batchBusy=false;$('#recalculate-discipline').disabled=false}
}
async function imageData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function requestImage(file,role='general',onWait=null){let data=await imageData(file);if(data.length>3500000)throw Error(file.name+': Billedet fylder for meget til AI-aflæsning. Brug et screenshot på højst ca. 2,5 MB.');for(let attempt=0;attempt<8;attempt++){const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json','x-app-code':$('#ai-code').value},body:JSON.stringify({image:data,discipline:activeDiscipline,role})});let body;try{body=await r.json()}catch{throw Error('AI-serveren er ikke tilgængelig på denne adresse. Appen skal køre på Vercel med AI aktiveret.')}if(r.status===429&&attempt<7){const wait=Math.max(5,Number(body.retryAfterSeconds||20));if(wait>90)throw Error(body.error||'Den gratis dagskvote er nået. Prøv igen senere.');if(onWait)onWait(wait);await sleep((wait+1)*1000);continue}if(!r.ok)throw Error(body.error||'Aflæsning mislykkedes.');return body}throw Error('Groq kunne ikke fortsætte efter flere automatiske forsøg.')}
function initFlow(){
 const oldChange=changeView;changeView=function(v){if(batchBusy)return toast('Vent til aflæsningen er færdig.');oldChange(v)};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>changeView(b.dataset.view));
 $('#home-add').onclick=()=>$('#tournament-dialog').showModal();
 $('#discipline-menu-button').onclick=e=>{e.stopPropagation();disciplineMenuOpen=!disciplineMenuOpen;renderDisciplineMenu()};
 $('#discipline-menu').onclick=e=>{const manual=e.target.closest('[data-discipline-action="manual"]');if(manual){disciplineMenuOpen=false;renderDisciplineMenu();openMatch();return}const b=e.target.closest('[data-discipline-section]');if(!b)return;setDisciplineSection(b.dataset.disciplineSection)};
 $('#cloud-connect').onclick=()=>cloudConnect($('#cloud-code').value,true);
 $('#cloud-disconnect').onclick=cloudDisconnect;
 $('#event-back').onclick=()=>changeView('home');$('#discipline-back').onclick=()=>openEvent(activeTournament);$('#reset-discipline').onclick=resetActiveDiscipline;
 $('#open-discipline-uploads').onclick=()=>changeView('discipline-uploads');$('#uploads-back').onclick=()=>changeView('discipline');$('#recalculate-discipline').onclick=recalculateActiveDiscipline;
 $('#open-discipline-players').onclick=()=>changeView('discipline-players');$('#players-back').onclick=()=>changeView('discipline');
 $('#ai-player-form').onsubmit=e=>{e.preventDefault();applyAiPlayerEdit()};
 $('#tournament-select').onchange=e=>openEvent(e.target.value);
 const oldSubmit=$('#tournament-form').onsubmit;$('#tournament-form').onsubmit=e=>{oldSubmit(e);view='event';activeDiscipline='all';render()};
 $('#batch-input').onchange=async e=>{const files=[...e.target.files];e.target.value='';if(files.length>15)return toast('Vælg højst 15 billeder ad gangen.');if(files.some(f=>!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>12*1024*1024))return toast('Brug JPG, PNG eller WebP på højst 12 MB pr. billede.');batchFiles=[];for(const file of files){try{batchFiles.push(await storeBatchFile(file,'general'))}catch{toast('Et billede kunne ikke gemmes.')}}save();renderFlow();$('#batch-status').textContent='Billederne er gemt. AI-aflæsning sender de valgte billeder til Groq Cloud.'};
 $('#double-self-input').onchange=e=>{const files=[...e.target.files];e.target.value='';setDoubleSlot('self',files)};
 $('#double-partner-input').onchange=e=>{const files=[...e.target.files];e.target.value='';setDoubleSlot('partner',files)};
 $('#double-opponent1-input').onchange=e=>{const files=[...e.target.files];e.target.value='';setDoubleSlot('opponent1',files)};
 $('#double-opponent2-input').onchange=e=>{const files=[...e.target.files];e.target.value='';setDoubleSlot('opponent2',files)};
 $('#double-result-input').onchange=e=>{const files=[...e.target.files];e.target.value='';setDoubleSlot('result',files)};
 $('#batch-analyze').onclick=async()=>{if(batchBusy||!batchFiles.length)return;if(activeDiscipline==='double'&&!doubleReady())return toast('Vælg først din profil, din makkers profil, begge modstanderes profiler og mindst ét kamp/resultat-billede.');if(!$('#ai-code').value)return toast('Indtast adgangskoden til AI-aflæsning.');batchBusy=true;renderFlow();const key=draftKey();state.aiDrafts[key] ||= {results:[]};let failed=0;for(let i=0;i<batchFiles.length;i++){const f=batchFiles[i];if(state.aiDrafts[key].results.some(r=>r.id===f.id))continue;const roleText=f.role&&doubleRoles[f.role]?doubleRoles[f.role]:f.role==='result'?'Kamp/resultat':'';$('#batch-status').textContent=`Aflæser billede ${i+1} af ${batchFiles.length}${roleText?' · '+roleText:''} …`;try{const data=await requestImage(f.file,f.role||'general',wait=>{$('#batch-status').textContent=`Groqs gratis hastighedsgrænse er nået. Venter ${wait} sekunder og fortsætter automatisk med billede ${i+1} af ${batchFiles.length} …`});for(const p of data.players||[])if(!p.date)p.date=tournamentDate();state.aiDrafts[key].results.push({id:f.id,role:f.role,data});save();renderDraft()}catch(e){failed++;$('#batch-status').textContent=e.message;break}}batchBusy=false;if(!failed){rebuildAiMatchesFromDraft();save();batchFiles=[]}renderFlow();if(!failed)$('#batch-status').textContent='Den samlede aflæsning er klar. Nye uploads finder du nu under “Se dine uploadede billeder”. AI kan tage fejl.'};
 document.addEventListener('click',e=>{if(disciplineMenuOpen&&!e.target.closest('.discipline-nav')){disciplineMenuOpen=false;renderDisciplineMenu()}const b=e.target.closest('button');if(!b)return;if(b.dataset.saveSimpleNote){saveSimpleResultAndNote(b.dataset.saveSimpleNote);return}if(b.dataset.editAiPlayer!==undefined){openAiPlayerEditor(Number(b.dataset.editAiPlayer));return}if(b.dataset.deleteUpload){if(confirm('Slet dette billede og den aflæsning, der kommer fra det?'))deleteEvidenceImage(b.dataset.deleteUpload);return}if(b.dataset.deleteAiPlayer!==undefined){if(confirm('Fjern denne aflæste spillerprofil? Billedet bevares.'))removeAiPlayerAt(Number(b.dataset.deleteAiPlayer));return}if(b.dataset.deleteAiMatch!==undefined){if(confirm('Fjern dette aflæste kampresultat? Billedet bevares.'))removeAiMatchAt(Number(b.dataset.deleteAiMatch));return}if(b.dataset.deleteSavedMatch){if(confirm('Slet denne gemte kamp?')){state.matches=state.matches.filter(m=>m.id!==b.dataset.deleteSavedMatch);save();render()}return}if(b.dataset.event)openEvent(b.dataset.event);if(b.dataset.discipline)openDiscipline(b.dataset.discipline);if(b.dataset.aiMatch!==undefined){const p=aiProposals[Number(b.dataset.aiMatch)];const existing=state.matches.filter(m=>m.tournament===activeTournament&&m.discipline===activeDiscipline&&norm(m.opponent)===norm(p.opponent)&&m.round===p.round);if(existing.length===1){const m=existing[0];openMatch(m.id,{...m,...p,id:m.id,notes:m.notes,points:p.points||m.points,partnerPoints:p.partnerPoints||m.partnerPoints,opponentPartnerPoints:p.opponentPartnerPoints||m.opponentPartnerPoints})}else openMatch(null,p)}
 if(b.dataset.aiPlayer!==undefined){const p=combinedPlayers(state.aiDrafts[draftKey()])[Number(b.dataset.aiPlayer)];if(samePlayer(p,state.profile)){if(p.conflicts.includes(activeDiscipline))return toast('Billederne viser forskellige point. Indtast de rigtige startpoint i Min profil.');state.profile[activeDiscipline]=p[activeDiscipline]??'';state.profile.confirmed=false;if(p.date)state.profile.date=p.date;save();changeView('profile');return}if(!p.id)return toast('Spiller-ID mangler. Opret profilen manuelt under Modstandere.');let o=state.opponents.find(o=>o.id===p.id);if(!o){o={id:p.id,name:p.name,club:p.club,images:[],aiCreated:true};state.opponents.push(o)}for(const d of Object.keys(labels))if(p[d]!=null&&!p.conflicts.includes(d))o[d]=p[d];o.date=p.date;o.aiSource={tournament:activeTournament,discipline:activeDiscipline,images:[...p.images]};for(const id of p.images)if(!o.images.some(im=>im.id===id))o.images.push({id,date:p.date,label:'Aflæst spillerprofil'});save();renderDraft();toast('Profil og billeder er gemt. Kontrollér pointene på hver kamp.')}});
 view='home';render();
 if(cloudCode)cloudConnect(cloudCode,false);
}
initFlow();
// Track both opponents in doubles/mix, including after editing notes.
let editingEvidence=null;
const flowOpenMatch=openMatch;
openMatch=function(id=null,proposal=null){editingEvidence=proposal||state.matches.find(m=>m.id===id)||null;flowOpenMatch(id,proposal)};
const legacyMatchSubmit=$('#match-form').onsubmit;
$('#match-form').onsubmit=function(e){legacyMatchSubmit(e);if(!$('#match-dialog').open&&editingEvidence){const m=state.matches.find(m=>m.id===editingEvidence.id)||state.matches.at(-1);if(m){for(const k of ['opponentIds','partnerName','sourceImage','ownPlayers','opponentPlayers'])if(editingEvidence[k])m[k]=structuredClone(editingEvidence[k]);save();render()}}};
const oldOpponentMatches=opponentMatches;
opponentMatches=function(id){return state.matches.filter(m=>m.opponentId===id||m.opponentIds?.includes(id)).sort((a,b)=>(state.tournaments.find(t=>t.id===b.tournament)?.date||'').localeCompare(state.tournaments.find(t=>t.id===a.tournament)?.date||''))};
