'use strict';
const KEY='sehested-badminton-v2';
const seed={version:2,profile:{name:'Bendix Sehested',id:'130731-03',club:'Ry',age:'U15',date:'2026-09-27',single:1640,double:1544,mix:1387,singleCount:55,doubleCount:44,mixCount:4,confirmed:false},tournaments:[{id:'hobro',name:'Hobro',date:'2026-09-27',number:'S017839',level:'U15 B'},{id:'hammel',name:'Hammel',date:'2026-11-07',number:'S017585',level:'U15 A'}],matches:[{id:'thor',tournament:'hobro',discipline:'single',opponent:'Thor Udby Erichsen',club:'Hobro',scores:'17-15, 11-15, 11-15',result:'loss',points:'',partnerPoints:'',opponentPartnerPoints:'',round:'Pulje 1',confirmed:false,status:'normal'},{id:'sebastian',tournament:'hobro',discipline:'single',opponent:'Sebastian Borg',club:'BNB Nibe',scores:'5-15, 4-15',result:'loss',points:'',partnerPoints:'',opponentPartnerPoints:'',round:'Pulje 1',confirmed:false,status:'normal'},{id:'sigurd',tournament:'hobro',discipline:'single',opponent:'Sigurd H. Thomsen',club:'Aarhus AB',scores:'11-15, 9-15',result:'loss',points:'',partnerPoints:'',opponentPartnerPoints:'',round:'Pulje 1',confirmed:false,status:'normal'}],uploads:[]};
let state;try{state=JSON.parse(localStorage.getItem(KEY))||structuredClone(seed)}catch{state=structuredClone(seed)}
let activeTournament=state.selectedTournament||state.tournaments[0]?.id||'',view='overview',activeDiscipline='all',uploadImage=null,ocrBusy=false;
state.baselines ||= {};
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PLAYER_FIELDS=['name','id','club','age','date','single','double','mix','singleCount','doubleCount','mixCount','confirmed'];
function playerKeyFromProfile(p){const id=String(p?.id||'').replace(/\D/g,'');return id?'player-'+id:'player-'+crypto.randomUUID()}
function playerSnapshot(p){const out={};for(const k of PLAYER_FIELDS)out[k]=p?.[k]??(k==='confirmed'?false:'');return out}
function migratePlayers(){
 state.players ||= [];
 for(const p of state.players){if(!p.key)p.key=playerKeyFromProfile(p);if(p.confirmed==null)p.confirmed=false}
 const legacy=playerSnapshot(state.profile||seed.profile);
 let fallback=state.players.find(p=>p.id&&legacy.id&&p.id===legacy.id);
 if(!fallback){fallback={key:playerKeyFromProfile(legacy),...legacy};state.players.push(fallback)}
 for(const t of state.tournaments||[]){
  if(!t.playerKey){
   const b=state.baselines?.[t.id];
   const owner=b?.id?state.players.find(p=>p.id===b.id):null;
   t.playerKey=(owner||fallback||state.players[0]).key;
  }
 }
 state.selectedManagedPlayerKey ||= fallback?.key||state.players[0]?.key||'';
}
function playerForTournament(tournamentOrId){
 const t=typeof tournamentOrId==='string'?state.tournaments.find(x=>x.id===tournamentOrId):tournamentOrId;
 return state.players.find(p=>p.key===t?.playerKey)||state.players[0]||null;
}
function profileForTournament(id){
 const baseline=state.baselines?.[id];
 if(baseline)return structuredClone(baseline);
 const p=playerForTournament(id);
 return {...playerSnapshot(p||state.profile||seed.profile),confirmed:false};
}
function syncActiveProfileToPlayer(){
 const t=state.tournaments.find(t=>t.id===activeTournament),p=playerForTournament(t);
 if(!t||!p||!state.profile)return;
 for(const k of ['name','id','club','age'])if(state.profile[k]!==undefined&&state.profile[k]!=='')p[k]=state.profile[k];
 const currentDate=String(state.profile.date||''),savedDate=String(p.date||'');
 if(!savedDate||!currentDate||currentDate>=savedDate){
  for(const k of ['date','single','double','mix','singleCount','doubleCount','mixCount','confirmed'])p[k]=state.profile[k]??'';
 }
}
migratePlayers();
state.profile=profileForTournament(activeTournament);
let managedPlayerKey=state.selectedManagedPlayerKey||playerForTournament(activeTournament)?.key||state.players[0]?.key||'';

const OPPONENT_SEED=[
{id:'130522-02',name:'Thor Udby Erichsen',club:'Hobro',single:1513,double:1469,mix:1322,singleCount:36,doubleCount:28,mixCount:10,image:'seed-3',date:'2026-09-27',match:'thor'},
{id:'121215-04',name:'Sebastian Borg',club:'BNB Nibe',single:1524,double:1315,mix:1175,singleCount:56,doubleCount:34,mixCount:0,image:'seed-4',date:'2026-09-27',match:'sebastian'},
{id:'130607-01',name:'Sigurd H. Thomsen',club:'Aarhus AB',single:1649,double:1571,mix:1298,singleCount:62,doubleCount:43,mixCount:3,image:'seed-5',date:'2026-09-27',match:'sigurd'}];
function ensureOpponentKeys(){state.opponents ||= [];for(const o of state.opponents){o.images ||= [];o._key ||= 'opponent-'+crypto.randomUUID()}}
function opponentByKey(key){return state.opponents.find(o=>o._key===key)||null}
function migrateOpponents(){migratePlayers();state.opponents ||= [];state.uploads ||= [];state.baselines ||= {};for(const o of OPPONENT_SEED){let existing=state.opponents.find(x=>x.id===o.id);if(!existing){existing={...o,images:[{id:o.image,date:o.date,label:'Spillerprofil · 27.09.2026'}]};state.opponents.push(existing)}for(const m of state.matches){m.notes ||= '';if(m.id===o.match&&m.tournament==='hobro'){m.opponentId ||= o.id;if(!positive(m.points))m.points=o.single}}}ensureOpponentKeys()}
let opponentQuery='',selectedOpponent='';

const labels={single:'Single',double:'Double',mix:'Mix'};
const fmt=n=>Number(n).toLocaleString('da-DK');
const signed=n=>(n>0?'+':'')+n;
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,5000)}
const CLOUD_CODE_KEY='sehested-badminton-cloud-code';
let cloudCode=localStorage.getItem(CLOUD_CODE_KEY)||'',cloudReady=false,cloudTimer=null,cloudSaving=false;
function cloudAuthHeaders(extra={}){return {...extra,'x-app-code':cloudCode}}
function setCloudStatus(text,ok=false){const s=$('#cloud-status'),b=$('#cloud-badge');if(s)s.textContent=text;if(b){b.textContent=ok?'Sky: forbundet':'Lokal';b.className=ok?'pill good':'pill'}}
async function cloudSaveNow(){
 if(!cloudReady||!cloudCode||cloudSaving)return;
 cloudSaving=true;
 try{
  const r=await fetch('/api/state',{method:'PUT',headers:cloudAuthHeaders({'Content-Type':'application/json'}),body:JSON.stringify({state})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||'Sky-gemning mislykkedes.');
  const label=$('#save-state');if(label)label.textContent='Gemt i skyen og på denne enhed';
  setCloudStatus('Forbundet. Data synkroniseres mellem dine enheder.',true);
 }catch(e){
  const label=$('#save-state');if(label)label.textContent='Lokalt gemt · sky-fejl';
  setCloudStatus(e.message||'Kunne ikke gemme i skyen.');
 }finally{cloudSaving=false}
}
function scheduleCloudSave(){if(!cloudReady||!cloudCode)return;clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudSaveNow,700)}
async function cloudConnect(code,interactive=true){
 cloudCode=String(code||'').trim();
 if(!cloudCode){if(interactive)toast('Indtast adgangskoden.');return false}
 setCloudStatus('Forbinder til skyen …');
 try{
  const r=await fetch('/api/state',{headers:cloudAuthHeaders()});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||'Sky-lagring er ikke klar endnu.');
  cloudReady=true;localStorage.setItem(CLOUD_CODE_KEY,cloudCode);
  if(body.state){
   state=body.state;state.baselines ||= {};state.uploads ||= [];state.opponents ||= [];state.aiDrafts ||= {};
   migratePlayers();
   activeTournament=state.selectedTournament||state.tournaments?.[0]?.id||'';
   state.profile=profileForTournament(activeTournament);
   managedPlayerKey=state.selectedManagedPlayerKey||playerForTournament(activeTournament)?.key||state.players[0]?.key||'';
   try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
   migrateOpponents();render();
  }else{
   await cloudSaveNow();
   await cloudUploadExistingImages();
  }
  const input=$('#cloud-code');if(input)input.value='';
  const connect=$('#cloud-connect'),disconnect=$('#cloud-disconnect');if(connect)connect.hidden=true;if(disconnect)disconnect.hidden=false;
  const field=$('#cloud-code-field');if(field)field.hidden=true;
  setCloudStatus('Forbundet. Dine resultater og billeder gemmes nu online.',true);
  return true;
 }catch(e){
  cloudReady=false;setCloudStatus(e.message||'Kunne ikke forbinde til skyen.');if(interactive)toast(e.message||'Kunne ikke forbinde til skyen.');return false
 }
}
function cloudDisconnect(){
 cloudReady=false;cloudCode='';localStorage.removeItem(CLOUD_CODE_KEY);
 const connect=$('#cloud-connect'),disconnect=$('#cloud-disconnect'),field=$('#cloud-code-field');if(connect)connect.hidden=false;if(disconnect)disconnect.hidden=true;if(field)field.hidden=false;
 setCloudStatus('Denne enhed bruger kun lokal lagring, indtil du forbinder igen.');
}
function save(){state.selectedTournament=activeTournament;if(activeTournament)state.baselines[activeTournament]=structuredClone(state.profile);syncActiveProfileToPlayer();state.selectedManagedPlayerKey=managedPlayerKey;try{localStorage.setItem(KEY,JSON.stringify(state));const label=$('#save-state');if(label)label.textContent=cloudReady?'Gemmer i skyen …':'Gemt i denne browser';scheduleCloudSave()}catch{const label=$('#save-state');if(label)label.textContent='Ikke gemt — hent en sikkerhedskopi';toast('Browseren kunne ikke gemme. Hent en sikkerhedskopi, før du lukker siden.')}}
// Appendiks B, Reglement for Rangliste 2026-09-10: [minDifference, unexpectedLoss, unexpectedWin, youthExpectedLoss, expectedWin].
const POINT_TABLE=[[0,8,14,6,14],[25,10,16,6,13],[50,12,18,5,12],[75,14,20,5,11],[100,16,22,4,10],[150,18,24,4,9],[200,18,26,0,8],[250,18,28,0,7],[300,18,30,0,6],[350,20,32,0,5],[400,20,32,0,4]];
function pointChange(ours,theirs,result){const diff=Math.abs(ours-theirs),row=POINT_TABLE.filter(r=>diff>=r[0]).at(-1);if(result==='win')return ours<theirs?row[2]:row[4];if(result==='loss')return -(ours>theirs?row[1]:row[3])||0;return null}
function positive(n){return n!==''&&n!==null&&Number.isFinite(Number(n))&&Number(n)>0}
function calculation(m){if(m.status!=='normal')return {reason:'Særregel – beregnes ikke automatisk'};if(!m.confirmed)return {reason:'Godkend kampens oplysninger'};if(!state.profile.confirmed)return {reason:'Bekræft startpoint i din profil'};if(!positive(m.points))return {reason:'Mangler modstanderens point'};if(!positive(state.profile[m.discipline]))return {reason:'Mangler egne point'};if(m.result==='pending')return {reason:'Afventer resultat'};let ours=Number(state.profile[m.discipline]),theirs=Number(m.points);if(m.discipline!=='single'){if(!positive(m.partnerPoints)||!positive(m.opponentPartnerPoints))return {reason:'Mangler makkerens eller modstanderparrets point'};ours=(ours+Number(m.partnerPoints))/2;theirs=(theirs+Number(m.opponentPartnerPoints))/2}return {delta:pointChange(ours,theirs,m.result),ours,theirs,diff:Math.abs(ours-theirs)}}
function selectedMatches(){return state.matches.filter(m=>m.tournament===activeTournament)}
function totals(d){const ms=selectedMatches().filter(m=>m.discipline===d&&m.result!=='pending'),cs=ms.map(calculation);return {count:ms.length,ready:cs.filter(c=>c.delta!==undefined).length,sum:cs.reduce((s,c)=>s+(c.delta??0),0)}}
function changeView(v){view=v;render();window.scrollTo({top:0,behavior:'smooth'})}
function render(){migratePlayers();document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='page-'+view);$('#profile-name').textContent=state.profile.name;$('#profile-meta').textContent=state.profile.id+' · '+state.profile.club+' · '+state.profile.age;$('#tournament-select').innerHTML=state.tournaments.map(t=>{const p=playerForTournament(t);return `<option value="${esc(t.id)}" ${t.id===activeTournament?'selected':''}>${esc(t.name)} · ${t.date.split('-').reverse().join('.')} · ${esc(p?.name||'Spiller')}</option>`}).join('');if(state.tournaments.some(t=>t.id===activeTournament)){renderOverview();renderMatches()}else{$('#match-list').innerHTML=''}renderProfile();renderSources();renderOpponents();$('#upload-tournament').innerHTML=state.tournaments.map(t=>`<option value="${esc(t.id)}" ${t.id===activeTournament?'selected':''}>${esc(t.name)} · ${esc(playerForTournament(t)?.name||'Spiller')}</option>`).join('')}
function renderOverview(){const t=state.tournaments.find(t=>t.id===activeTournament),ms=selectedMatches(),complete=ms.filter(m=>m.result!=='pending');$('#tournament-name').textContent=t.name;$('#tournament-meta').textContent=t.date.split('-').reverse().join('.')+' · '+t.level+' · '+t.number;$('#overview-cards').innerHTML=Object.keys(labels).map(d=>{const a=totals(d);const valid=a.count>0&&a.ready===a.count;return `<article class="stat"><span class="eyebrow">${labels[d]}</span><div class="big">${positive(state.profile[d])?fmt(state.profile[d]):'—'}</div><p class="muted">Startpoint · ${state.profile[d+'Count']??'—'} kampe</p><div class="stat-foot">${valid?`<b class="${a.sum>=0?'good':'bad'}">${signed(a.sum)} point</b><span>Forventet: <strong>${fmt(Number(state.profile[d])+a.sum)}</strong></span>`:`<span>${a.count?'Afventer oplysninger':'Ingen resultater i dette stævne'}</span>`}</div></article>`}).join('');const ready=ms.filter(m=>calculation(m).delta!==undefined).length;$('#progress-text').textContent=`${ready} af ${ms.length} kampe klar til beregning`;$('#progress').value=ready;$('#progress').max=Math.max(ms.length,1);$('#wins').textContent=ms.filter(m=>m.result==='win').length;$('#losses').textContent=ms.filter(m=>m.result==='loss').length;$('#pending').textContent=ms.filter(m=>m.result==='pending').length;$('#needs').innerHTML=(!state.profile.confirmed?'<li>Bekræft, at startpointene er fra før kampene og ikke allerede indeholder resultaterne.</li>':'')+(ms.some(m=>!positive(m.points))?'<li>Tilføj modstandernes point fra den relevante rangliste.</li>':'')+(ms.some(m=>!m.confirmed)?'<li>Kontrollér og godkend resultaterne fra billederne.</li>':'')+(!ms.length?'<li>Upload kampprogrammet eller tilføj den første kamp.</li>':'');$('#needs-panel').hidden=!$('#needs').textContent;$('#recent').innerHTML=complete.slice(0,3).map(m=>`<div class="list-row"><span class="result-dot ${m.result}">${m.result==='win'?'V':'T'}</span><div><strong>${esc(m.opponent)}</strong><small>${labels[m.discipline]} · ${esc(m.scores)}</small></div><button class="link-btn" data-edit="${esc(m.id)}">Se kamp →</button></div>`).join('')||'<p class="muted">Resultaterne vises her, når en kamp er spillet.</p>';$('#upcoming-note').hidden=t.id!=='hammel';$('#baseline-label').textContent=state.profile.confirmed?'Startpoint bekræftet':'Startpoint skal bekræftes'}
function renderMatches(){const ms=selectedMatches().filter(m=>activeDiscipline==='all'||m.discipline===activeDiscipline);$('#match-list').innerHTML=ms.map(m=>{const c=calculation(m);return `<article class="match-card"><div class="between"><span class="pill">${labels[m.discipline]} · ${esc(m.round||'Kamp')}</span><span class="${m.result==='win'?'good':m.result==='loss'?'bad':'muted'}">${m.result==='win'?'Sejr':m.result==='loss'?'Nederlag':'Planlagt'}</span></div><h3>${esc(m.opponent)}</h3>${m.opponentId?`<button class="link-btn" data-opponent="${esc(m.opponentId)}">Se tidligere møder →</button>`:''}<p class="muted">${esc(m.club||'Klub ikke angivet')}</p><div class="score">${esc(m.scores||'Resultat mangler')}</div><small>Resultatet er set fra ${esc(state.profile.name)}s side.</small>${m.notes?`<p class="match-note"><b>Mine noter</b><br>${esc(m.notes)}</p>`:''}<div class="match-bottom"><span class="${c.delta!==undefined?(c.delta>=0?'good':'bad'):'muted'}">${c.delta!==undefined?`<b>${signed(c.delta)} point</b><small>Pointforskel: ${c.diff}</small>`:esc(c.reason)}</span><button class="secondary" data-edit="${esc(m.id)}">Ret / godkend</button></div></article>`}).join('')||'<div class="empty"><h3>Ingen kampe endnu</h3><p>Tilføj en kamp eller upload et screenshot af programmet.</p></div>';}
function renderProfile(){
 migratePlayers();
 let p=state.players.find(p=>p.key===managedPlayerKey);
 if(!p){p=playerForTournament(activeTournament)||state.players[0];managedPlayerKey=p?.key||''}
 state.selectedManagedPlayerKey=managedPlayerKey;
 const activeOwner=playerForTournament(activeTournament);
 $('#my-players').innerHTML=state.players.map(x=>`<article class="my-player-card ${x.key===managedPlayerKey?'selected':''}"><div><strong>${esc(x.name||'Spiller')}</strong><small>${esc(x.id||'ID mangler')} · ${esc(x.club||'Klub mangler')} · ${esc(x.age||'')}</small></div><div class="player-card-points"><span>Single <b>${positive(x.single)?esc(fmt(x.single)):'—'}</b></span><span>Double <b>${positive(x.double)?esc(fmt(x.double)):'—'}</b></span><span>Mix <b>${positive(x.mix)?esc(fmt(x.mix)):'—'}</b></span></div><button type="button" class="secondary" data-manage-player="${esc(x.key)}">${x.key===managedPlayerKey?'Valgt':'Rediger spiller'}</button>${activeOwner?.key===x.key?'<small class="current-player-note">Spiller i det valgte stævne</small>':''}</article>`).join('');
 $('#player-editor').hidden=!p;
 if(!p)return;
 $('#player-editor-title').textContent='Rediger '+(p.name||'spiller');
 for(const k of ['name','id','club','age','date','single','double','mix','singleCount','doubleCount','mixCount'])$('#p-'+k).value=p[k]??'';
 $('#p-confirmed').checked=!!p.confirmed;
}
function prepareTournamentDialog(){
 migratePlayers();
 const current=playerForTournament(activeTournament),preferred=current?.key||managedPlayerKey||state.players[0]?.key||'';
 $('#t-player-choices').innerHTML=state.players.map((p,i)=>`<label class="t-player-choice"><input type="radio" name="t-player" value="${esc(p.key)}" ${p.key===preferred||(!preferred&&i===0)?'checked':''} required><span><strong>${esc(p.name||'Spiller')}</strong><small>${esc(p.id||'ID mangler')} · ${esc(p.club||'Klub mangler')} · ${esc(p.age||'')}</small></span></label>`).join('');
 $('#tournament-dialog').showModal();
}
function renderSources(){const originals=SEED_IMAGES.map((src,i)=>`<button class="source" data-image="seed-${i}"><img src="${src}" alt="Screenshot ${i+1}: ${['Hobro program','Hobro resultater','Hammel tilmeldingsside','Thor spillerprofil','Sebastian spillerprofil','Sigurd spillerprofil'][i]}"><span>${['Hobro · turnering','Hobro · 3 resultater','Hammel · kommende','Thor · spillerprofil','Sebastian · spillerprofil','Sigurd · spillerprofil'][i]}</span></button>`).join('');$('#sources').innerHTML=originals+state.uploads.map(u=>`<button class="source uploaded" data-image="${esc(u.id)}"><span>▧</span><strong>${esc(u.name)}</strong><small>${esc(u.date)}</small></button>`).join('')}
function openMatch(id=null,proposal=null){const m=proposal||state.matches.find(m=>m.id===id)||{id:'',tournament:activeTournament,discipline:'single',opponent:'',club:'',round:'',scores:'',points:'',partnerPoints:'',opponentPartnerPoints:'',result:'pending',status:'normal',confirmed:false};$('#match-form').reset();$('#m-opponentId').innerHTML='<option value="">Ikke knyttet til en spiller</option>'+state.opponents.map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${esc(o.id)}</option>`).join('');for(const k of ['id','tournament','discipline','opponent','club','round','scores','points','partnerPoints','opponentPartnerPoints','result','status','notes','opponentId'])$('#m-'+k).value=m[k]??'';$('#m-confirmed').checked=m.confirmed;$('#match-dialog-title').textContent=id?'Ret og godkend kamp':'Tilføj kamp';$('#delete-match').hidden=!id;$('#double-fields').hidden=m.discipline==='single';$('#match-dialog').showModal()}
function resultFromScores(scores){const text=String(scores).trim();if(!/^\d+\s*[-/]\s*\d+(\s*,\s*\d+\s*[-/]\s*\d+){1,2}$/.test(text))return null;let w=0,l=0;for(const set of text.split(',')){if(w===2||l===2)return null;const [a,b]=set.split(/[-/]/).map(Number);if(a===b||Math.max(a,b)<15)return null;a>b?w++:l++}return w===2?'win':l===2?'loss':null}
function proposalsFromText(text){const lines=text.split('\n').map(s=>s.trim()).filter(Boolean),found=[];for(let i=0;i<lines.length;i++){if(!/^\d+\s*[/\-]\s*\d+(\s*,\s*\d+\s*[/\-]\s*\d+){1,2}$/.test(lines[i]))continue;const names=lines.slice(Math.max(0,i-6),i).filter(s=>s.includes(',')&&!/\d|point|kampe/i.test(s)).slice(-2);if(names.length!==2)continue;const own=names.findIndex(n=>n.toLowerCase().includes(state.profile.name.toLowerCase()));if(own===-1)continue;const other=names[1-own].split(','),pairs=lines[i].split(',').map(s=>s.split(/[-/]/).map(Number));const scores=pairs.map(p=>own===0?`${p[0]}-${p[1]}`:`${p[1]}-${p[0]}`).join(', ');found.push({id:'',tournament:$('#upload-tournament').value,discipline:$('#upload-discipline').value,opponent:other[0].trim(),club:other.slice(1).join(',').trim(),round:'Pulje 1',scores,result:resultFromScores(scores)||'pending',status:'normal',confirmed:false,points:'',partnerPoints:'',opponentPartnerPoints:''})}return found}
let proposals=[];
function parseText(){if($('#upload-discipline').value!=='single'){proposals=[];$('#proposals').hidden=false;$('#proposals').textContent='Double- og mixkampe skal indtastes via Tilføj kamp manuelt. Brug den aflæste tekst som støtte.';return}const text=$('#ocr-text').value;proposals=proposalsFromText(text);$('#proposals').innerHTML=proposals.length?proposals.map((m,i)=>`<div class="list-row"><div><strong>${esc(m.opponent)}</strong><small>${esc(m.scores)} · ${m.result==='loss'?'Nederlag':m.result==='win'?'Sejr':'Kontrollér resultat'}</small></div><button class="secondary" data-proposal="${i}">Kontrollér</button></div>`).join(''):'<p>Ingen komplette kampe genkendt. Brug »Tilføj kamp« eller »Mine spillere«, og udfyld oplysningerne fra billedet. Teksten herover kan rettes.</p>';$('#proposals').hidden=false}
async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('badminton-billeder-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function localImagePut(id,file){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('images','readwrite');t.objectStore('images').put(file,id);t.oncomplete=()=>{d.close();resolve()};t.onerror=()=>{d.close();reject(t.error)}})}
async function localImageGet(id){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('images'),r=t.objectStore('images').get(id);r.onsuccess=()=>{d.close();resolve(r.result)};r.onerror=()=>reject(r.error)})}
async function cloudImagePut(id,file){
 if(!cloudReady||!cloudCode)return;
 if(file.size>3000000)throw Error('Billedet er for stort til online-lagring. Brug et screenshot på højst ca. 3 MB.');
 const data=await imageData(file);
 const r=await fetch('/api/image',{method:'POST',headers:cloudAuthHeaders({'Content-Type':'application/json'}),body:JSON.stringify({id,image:data})});
 const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.error||'Billedet kunne ikke gemmes online.');
}
async function cloudImageGet(id){
 if(!cloudReady||!cloudCode)return null;
 const r=await fetch('/api/image?id='+encodeURIComponent(id),{headers:cloudAuthHeaders()});
 if(r.status===404)return null;if(!r.ok)return null;return await r.blob();
}
async function cloudImageDelete(id){
 if(!cloudReady||!cloudCode)return;
 await fetch('/api/image?id='+encodeURIComponent(id),{method:'DELETE',headers:cloudAuthHeaders()}).catch(()=>{});
}
async function cloudUploadExistingImages(){
 if(!cloudReady)return;
 const uploads=state.uploads||[];
 let done=0;
 for(const u of uploads){
  if(String(u.id).startsWith('seed-'))continue;
  const file=await localImageGet(u.id).catch(()=>null);if(!file)continue;
  try{await cloudImagePut(u.id,file);done++}catch{}
 }
 if(done)setCloudStatus('Forbundet. '+done+' eksisterende billeder er også lagt i skyen.',true);
}
async function imagePut(id,file){await localImagePut(id,file);if(cloudReady){try{await cloudImagePut(id,file)}catch(e){toast(e.message||'Billedet blev kun gemt lokalt.')}}}
async function imageGet(id){let file=await localImageGet(id).catch(()=>null);if(file)return file;file=await cloudImageGet(id);if(file){try{await localImagePut(id,file)}catch{}return file}return null}
async function showImage(id){let src;if(id.startsWith('seed-'))src=SEED_IMAGES[Number(id.split('-')[1])];else{const b=await imageGet(id);if(!b){toast('Billedet findes ikke i denne browser.');return}src=URL.createObjectURL(b)}$('#large-image').src=src;$('#image-dialog').showModal()}
async function recognize(){if(!uploadImage){toast('Vælg et billede først.');return}if(ocrBusy)return;ocrBusy=true;$('#read-image').disabled=true;$('#ocr-status').textContent='Starter tekstgenkendelse …';let worker;try{if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.onload=resolve;script.onerror=reject;document.head.append(script);setTimeout(()=>reject(new Error('timeout')),20000)});worker=await Tesseract.createWorker('eng',1,{logger:m=>{$('#ocr-status').textContent=m.status==='recognizing text'?`Aflæser tekst: ${Math.round(m.progress*100)} %`:'Henter tekstlæser …'}});const r=await worker.recognize(uploadImage);$('#ocr-text').value=r.data.text;$('#ocr-status').textContent='Teksten er aflæst. Kontrollér navne, tal og disciplin, før du gemmer.';parseText()}catch{$('#ocr-status').textContent='Tekstlæseren kunne ikke starte. Du kan stadig se billedet og indtaste kampene manuelt. Første opstart kræver internet.'}finally{if(worker)await worker.terminate();ocrBusy=false;$('#read-image').disabled=false}}
function init(){migrateOpponents();render();initOpponents();document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>changeView(b.dataset.view));$('#tournament-select').onchange=e=>{if(activeTournament)state.baselines[activeTournament]=structuredClone(state.profile);activeTournament=e.target.value;state.profile=profileForTournament(activeTournament);managedPlayerKey=playerForTournament(activeTournament)?.key||managedPlayerKey;save();render()};$('#filter').onchange=e=>{activeDiscipline=e.target.value;renderMatches()};$('#new-match').onclick=()=>openMatch();$('#upload-new-match').onclick=()=>openMatch();$('#profile-form').onsubmit=e=>{e.preventDefault();const p=state.players.find(p=>p.key===managedPlayerKey);if(!p)return;for(const k of ['name','id','club','age','date'])p[k]=$('#p-'+k).value.trim();for(const k of ['single','double','mix','singleCount','doubleCount','mixCount'])p[k]=$('#p-'+k).value===''?'':Number($('#p-'+k).value);p.confirmed=$('#p-confirmed').checked;const owner=playerForTournament(activeTournament);if(owner?.key===p.key){state.profile={...state.profile,...playerSnapshot(p)};if(activeTournament)state.baselines[activeTournament]=structuredClone(state.profile)}save();render();toast('Spilleren er gemt.');changeView('profile')};$('#add-player').onclick=()=>{$('#player-add-form').reset();$('#player-add-dialog').showModal()};$('#player-add-form').onsubmit=e=>{e.preventDefault();const id=$('#new-player-id').value.trim();if(state.players.some(p=>p.id===id)){toast('Der findes allerede en spiller med dette BadmintonID.');return}const p={key:'player-'+crypto.randomUUID(),name:$('#new-player-name').value.trim(),id,club:$('#new-player-club').value.trim(),age:$('#new-player-age').value.trim(),date:'',single:'',double:'',mix:'',singleCount:'',doubleCount:'',mixCount:'',confirmed:false};state.players.push(p);managedPlayerKey=p.key;state.selectedManagedPlayerKey=p.key;save();render();$('#player-add-dialog').close();toast('Spilleren er tilføjet. Udfyld pointoplysningerne nedenfor.')};$('#m-discipline').onchange=e=>$('#double-fields').hidden=e.target.value==='single';$('#derive-result').onclick=()=>{const r=resultFromScores($('#m-scores').value);if(r)$('#m-result').value=r;else toast('Skriv mindst to afsluttede sæt med dine point først, fx 15-8, 15-10.');};$('#match-form').onsubmit=e=>{e.preventDefault();const existing=state.matches.find(x=>x.id===$('#m-id').value),m=existing?{...existing}:{};for(const k of ['id','tournament','discipline','opponent','club','round','scores','points','partnerPoints','opponentPartnerPoints','result','status','notes','opponentId'])m[k]=$('#m-'+k).value.trim();m.confirmed=$('#m-confirmed').checked;if((m.discipline==='double'||m.discipline==='single')&&m.scores){m.manualResult=true;if(m.discipline==='single')m.manualScores=m.scores}if(m.opponentId){const o=state.opponents.find(o=>o.id===m.opponentId);if(!o||o.name!==m.opponent){toast('Navnet og den valgte modstander er forskellige. Vælg den rigtige spiller eller fjern tilknytningen.');return}}const inferred=resultFromScores(m.scores);if(m.status==='normal'&&inferred&&m.result!==inferred){toast('Resultatet og sætscoren er uenige. Ret dem før du gemmer.');return}if(!m.id){const duplicate=state.matches.find(x=>x.tournament===m.tournament&&x.discipline===m.discipline&&x.opponent.toLowerCase()===m.opponent.toLowerCase()&&x.round===m.round&&x.scores.replace(/\s/g,'')===m.scores.replace(/\s/g,''));if(duplicate){toast('Denne kamp findes allerede. Ret den eksisterende kamp under Kampe.');return}m.id='match-'+Date.now()}const index=state.matches.findIndex(x=>x.id===m.id);index<0?state.matches.push(m):state.matches[index]=m;save();$('#match-dialog').close();render();toast('Kampen er gemt.');};$('#delete-match').onclick=()=>{if(confirm('Vil du fjerne denne kamp fra testappen?')){state.matches=state.matches.filter(m=>m.id!==$('#m-id').value);save();$('#match-dialog').close();render()}};document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.managePlayer){managedPlayerKey=b.dataset.managePlayer;state.selectedManagedPlayerKey=managedPlayerKey;renderProfile();document.querySelector('#player-editor')?.scrollIntoView({behavior:'smooth',block:'start'});return}if(b.dataset.edit)openMatch(b.dataset.edit);if(b.dataset.opponentKey){selectedOpponent=b.dataset.opponentKey;changeView('opponents')}else if(b.dataset.opponent){const o=state.opponents.find(o=>o.id===b.dataset.opponent);selectedOpponent=o?._key||'';changeView('opponents')}if(b.dataset.image)showImage(b.dataset.image).catch(()=>toast('Billedet kunne ikke åbnes.'));if(b.dataset.proposal!==undefined)openMatch(null,proposals[Number(b.dataset.proposal)]);if(b.dataset.close)$('#'+b.dataset.close).close()});$('#file-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>12*1024*1024){toast('Vælg JPG, PNG eller WebP på højst 12 MB.');return}uploadImage=file;$('#upload-preview').src=URL.createObjectURL(file);$('#upload-preview').hidden=false;$('#read-image').disabled=false;$('#ocr-text').value='';$('#proposals').hidden=true;$('#ocr-status').textContent='Billedet er klar. Tryk Aflæs tekst.';const id='upload-'+Date.now();try{await imagePut(id,file);state.uploads.push({id,name:file.name,date:new Date().toLocaleDateString('da-DK')});const oid=$('#upload-opponent').value;if(oid){const o=state.opponents.find(o=>o.id===oid);o.images.push({id,date:new Date().toISOString().slice(0,10),label:file.name})}save();renderSources()}catch{toast('Billedet kan aflæses nu, men kunne ikke gemmes i browseren.')}};$('#read-image').onclick=recognize;$('#parse-text').onclick=parseText;$('#export').onclick=async()=>{try{const images=[];for(const u of state.uploads){const b=await imageGet(u.id);if(b){const data=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});images.push({id:u.id,data})}}const blob=new Blob([JSON.stringify({app:'Badmintonpoint',version:2,state,images},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='badminton-sikkerhedskopi.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch{toast('Sikkerhedskopien kunne ikke oprettes.')}};$('#import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const data=JSON.parse(await f.text());if(data.app!=='Badmintonpoint'||data.version!==2||!data.state?.profile||!Array.isArray(data.state.matches)||!Array.isArray(data.state.tournaments)||!data.state.tournaments.length)throw Error();if(!confirm('Erstat de aktuelle data med sikkerhedskopien?'))return;for(const im of data.images||[]){if(!/^data:image\/(png|jpeg|webp);base64,/.test(im.data))throw Error();const b=await(await fetch(im.data)).blob();await imagePut(im.id,b)}state=data.state;migrateOpponents();activeTournament=state.selectedTournament||state.tournaments[0]?.id||'';state.profile=profileForTournament(activeTournament);managedPlayerKey=state.selectedManagedPlayerKey||playerForTournament(activeTournament)?.key||state.players[0]?.key||'';save();render();toast('Sikkerhedskopien er indlæst.')}catch{toast('Filen kunne ikke indlæses som en sikkerhedskopi.')}e.target.value=''};$('#new-tournament').onclick=prepareTournamentDialog;$('#tournament-form').onsubmit=e=>{e.preventDefault();const playerKey=document.querySelector('input[name="t-player"]:checked')?.value,player=state.players.find(p=>p.key===playerKey);if(!player){toast('Vælg hvilken spiller stævnet er for.');return}const t={id:'event-'+Date.now(),name:$('#t-name').value.trim(),date:$('#t-date').value,number:$('#t-number').value.trim(),level:$('#t-level').value,playerKey:player.key};if(activeTournament)state.baselines[activeTournament]=structuredClone(state.profile);state.tournaments.push(t);activeTournament=t.id;managedPlayerKey=player.key;state.profile={...playerSnapshot(player),confirmed:false};state.baselines[t.id]=structuredClone(state.profile);save();render();$('#tournament-dialog').close();$('#tournament-form').reset();toast('Stævnet er oprettet for '+player.name+'.')}}

function opponentMatches(id){
 if(!id)return [];
 return state.matches.filter(m=>m.opponentId===id).sort((a,b)=>{const ad=state.tournaments.find(t=>t.id===a.tournament)?.date||'',bd=state.tournaments.find(t=>t.id===b.tournament)?.date||'';return bd.localeCompare(ad)})
}
function renderOpponents(){
 ensureOpponentKeys();
 const q=opponentQuery.toLocaleLowerCase('da'),list=state.opponents.filter(o=>[o.name,o.id,o.club].some(v=>String(v||'').toLocaleLowerCase('da').includes(q)));
 if(!selectedOpponent&&list.length)selectedOpponent=list[0]._key;
 $('#opponent-list').innerHTML=list.map(o=>{
  const ms=opponentMatches(o.id),played=ms.filter(m=>m.result!=='pending'),meta=[o.club,o.id].filter(Boolean).join(' · ');
  return `<button class="opponent-row ${selectedOpponent===o._key?'selected':''}" data-opponent-key="${esc(o._key)}"><strong>${esc(o.name||'Navn mangler')}</strong><small>${esc(meta||'BadmintonID mangler')}</small><small>${played.length} møder · ${played.filter(m=>m.result==='win').length} sejre / ${played.filter(m=>m.result==='loss').length} nederlag</small></button>`
 }).join('')||'<p>Ingen modstandere matcher din søgning.</p>';
 const o=opponentByKey(selectedOpponent);
 $('#opponent-detail').innerHTML=o?opponentDetail(o):'<p>Vælg en modstander for at se historik og billeder.</p>';
 const current=$('#upload-opponent').value;
 $('#upload-opponent').innerHTML='<option value="">Ingen / ikke en modstanderprofil</option>'+state.opponents.filter(o=>o.id).map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${esc(o.id)}</option>`).join('');
 $('#upload-opponent').value=current
}
function opponentDetail(o){
 const ms=opponentMatches(o.id),meta=[o.id,o.club].filter(Boolean).join(' · ');
 return `<div class="between"><div><span class="eyebrow">Modstanderprofil</span><h2>${esc(o.name||'Navn mangler')}</h2><p>${esc(meta||'BadmintonID og klub mangler')}</p></div><div class="actions"><button class="secondary" data-edit-opponent="${esc(o._key)}">Rediger profil</button><button class="secondary" id="add-opponent-image">+ Gem profilbillede</button></div></div><div class="grid3">${Object.keys(labels).map(d=>`<div class="opponent-stat"><small>${labels[d]}</small><strong>${o[d]!==''&&o[d]!=null?fmt(o[d]):'—'}</strong><small>${o[d+'Count']??'—'} kampe</small></div>`).join('')}</div><p class="footnote">Profilpoint aflæst ${esc(o.date||'dato ikke angivet')}. Nye billeder ændrer ikke pointene på tidligere kampe.</p><div class="opponent-profile-actions"><button class="danger" data-delete-opponent="${esc(o._key)}">Slet denne spillerprofil</button></div><h3>Gemte profilbilleder (${o.images.length})</h3><div class="sources">${o.images.map(im=>`<button class="source" data-image="${esc(im.id)}">${im.id.startsWith('seed-')?`<img src="${SEED_IMAGES[Number(im.id.split('-')[1])]}" alt="Profil for ${esc(o.name)}">`:'<span>▧ Åbn billede</span>'}<span>${esc(im.label||'Spillerprofil')}<br>${esc(im.date)}</span></button>`).join('')}</div><h3>Indbyrdes kampe · alle stævner</h3><p class="muted">Historikken viser kun kampe, som er gemt i appen.</p>${ms.map(m=>{const t=state.tournaments.find(t=>t.id===m.tournament);return `<article class="history-row"><div class="between"><strong>${esc(t?.date||'')} · ${esc(t?.name||'Ukendt stævne')}</strong><span class="${m.result==='win'?'good':m.result==='loss'?'bad':'muted'}">${m.result==='win'?'Sejr':m.result==='loss'?'Nederlag':'Planlagt'}</span></div><p>${labels[m.discipline]} · ${esc(m.round)} · ${esc(m.scores||'Intet resultat')}</p><small>Modstanderpoint ved kampen: ${esc(m.points||'ikke angivet')}</small><p class="match-note">${m.notes?esc(m.notes):'Ingen noter til denne kamp endnu.'}</p><button class="secondary" data-edit="${esc(m.id)}">Resultat og noter</button></article>`}).join('')||'<p>Ingen registrerede møder endnu.</p>'}`
}
function openOpponentEditor(key){
 const o=opponentByKey(key);if(!o)return;
 $('#opponent-form').reset();$('#o-key').value=o._key;$('#o-id').value=o.id||'';$('#o-name').value=o.name||'';$('#o-club').value=o.club||'';
 for(const d of ['single','double','mix'])$('#o-'+d).value=o[d]??'';
 $('#opponent-dialog-title').textContent='Rediger modstander';
 $('#save-opponent').textContent='Gem rettelser';
 $('#opponent-dialog').showModal()
}
async function deleteOpponentProfile(key){
 const o=opponentByKey(key);if(!o)return;
 const linked=opponentMatches(o.id);
 const msg=linked.length
  ?`Slet spillerprofilen for ${o.name}? De ${linked.length} gemte kampe bliver bevaret, men bliver ikke længere knyttet til denne profil.`
  :`Slet spillerprofilen for ${o.name}? Dette kan ikke fortrydes.`;
 if(!confirm(msg))return;
 if(o.id){
  for(const m of state.matches){
   if(m.opponentId===o.id)m.opponentId='';
   if(Array.isArray(m.opponentIds))m.opponentIds=m.opponentIds.filter(id=>id!==o.id);
  }
 }
 state.opponents=state.opponents.filter(x=>x._key!==key);
 selectedOpponent=state.opponents[0]?._key||'';
 save();render();toast('Spillerprofilen er slettet.')
}
function initOpponents(){
 $('#opponent-search').oninput=e=>{opponentQuery=e.target.value;renderOpponents()};
 $('#m-opponentId').onchange=e=>{const o=state.opponents.find(o=>o.id===e.target.value);if(o){$('#m-opponent').value=o.name;$('#m-club').value=o.club;if(!$('#m-id').value){$('#m-points').value='';toast('Spilleren er valgt. Angiv point, der gælder for den nye kamp.')}}};
 document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-opponent]');if(edit){openOpponentEditor(edit.dataset.editOpponent);return}
  const del=e.target.closest('[data-delete-opponent]');if(del){deleteOpponentProfile(del.dataset.deleteOpponent);return}
  if(e.target.closest('#add-opponent-image'))$('#opponent-image-input').click()
 });
 $('#opponent-image-input').onchange=async e=>{
  const o=opponentByKey(selectedOpponent);if(!o){e.target.value='';return}
  let saved=0;
  for(const f of e.target.files){
   if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>12*1024*1024){toast('Kun JPG, PNG og WebP på højst 12 MB.');continue}
   const id='op-image-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
   try{await imagePut(id,f);const date=new Date().toISOString().slice(0,10);state.uploads.push({id,name:f.name,date});o.images.push({id,label:f.name,date});saved++}catch{toast('Et billede kunne ikke gemmes.')}
  }
  if(saved){save();renderOpponents();renderSources();toast(`${saved} billeder gemt på ${o.name}.`)}e.target.value=''
 };
 $('#new-opponent').onclick=()=>{$('#opponent-form').reset();$('#o-key').value='';for(const d of ['single','double','mix'])$('#o-'+d).value='';$('#opponent-dialog-title').textContent='Ny modstander';$('#save-opponent').textContent='Gem modstander';$('#opponent-dialog').showModal()};
 $('#opponent-form').onsubmit=e=>{
  e.preventDefault();ensureOpponentKeys();
  const key=$('#o-key').value,id=$('#o-id').value.trim(),name=$('#o-name').value.trim(),club=$('#o-club').value.trim();
  const duplicate=id&&state.opponents.find(o=>o.id===id&&o._key!==key);
  if(duplicate){toast('BadmintonID findes allerede på '+duplicate.name+'. Ret eller slet dubletten i stedet.');return}
  let o=key?opponentByKey(key):null,oldId=o?.id||'';
  if(!o){o={_key:'opponent-'+crypto.randomUUID(),id:'',name:'',club:'',images:[],date:'',single:'',double:'',mix:''};state.opponents.push(o)}
  o.id=id;o.name=name;o.club=club;
  for(const d of ['single','double','mix'])o[d]=$('#o-'+d).value===''?'':Number($('#o-'+d).value);
  if(oldId&&oldId!==id){
   for(const m of state.matches){
    if(m.opponentId===oldId)m.opponentId=id;
    if(Array.isArray(m.opponentIds))m.opponentIds=m.opponentIds.map(x=>x===oldId?id:x);
   }
  }
  selectedOpponent=o._key;save();render();$('#opponent-dialog').close();toast(key?'Modstanderprofilen er rettet.':'Modstanderen er oprettet.')
 }
}

if(typeof document!=='undefined')init();
