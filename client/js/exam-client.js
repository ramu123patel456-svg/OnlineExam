(() => {
"use strict";
const student=JSON.parse(sessionStorage.getItem("student")||"null");
const studentToken=sessionStorage.getItem("studentToken");
if(!student||!studentToken){sessionStorage.removeItem("student");sessionStorage.removeItem("studentToken");location.href="student-login.html";return}
const $=id=>document.getElementById(id);
const form=$("examForm"),card=$("questionCard"),timerEl=$("timer"),messageEl=$("message");
let exam=null, current=0, answers={}, startedAt=new Date().toISOString(), deadline=0, serverClockOffset=0, submitted=false, timerHandle=null, saveHandle=null, statusPollHandle=null;
const attemptId=crypto.randomUUID?crypto.randomUUID():`attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const antiCheat={tabSwitches:0,fullscreenExits:0,shortcutAttempts:0,copyAttempts:0,violationCount:0};
const labels={mcq1:"MCQ — Select one",mcq2:"MCQ — Select two",mcq3:"MCQ — Select three",fill_blank:"Fill in the blanks",true_false:"True / False",match:"Match the following",short_answer:"Short answer",long_answer:"Long answer",programming:"Programming",href_page:"HTML HREF / Page Link"};
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function norm(v){return String(v??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().toLowerCase()}
function registerViolation(type){antiCheat[type]=(antiCheat[type]||0)+1;antiCheat.violationCount++;$("violationCount").textContent=`${antiCheat.violationCount} warning${antiCheat.violationCount===1?"":"s"}`;messageEl.innerHTML=`<div class="error">Integrity warning: ${type.replace(/([A-Z])/g," $1")} detected. Please stay in the exam window.</div>`}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&!submitted)registerViolation("tabSwitches")});
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&!submitted)registerViolation("fullscreenExits")});
document.addEventListener("copy",e=>{e.preventDefault();if(!submitted)registerViolation("copyAttempts")});
document.addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&["c","v","x","u","s","p"].includes(e.key.toLowerCase())){e.preventDefault();registerViolation("shortcutAttempts")}if(e.key==="F12"){e.preventDefault();registerViolation("shortcutAttempts")}});
function draftKey(){return `examDraft_${exam?.id}_${student.studentId}`}
function collectCurrent(){if(!exam)return;const q=exam.questions[current];if(!q)return;let v;if(["mcq1","true_false"].includes(q.type)){const x=document.querySelector(`input[name="q-${q.id}"]:checked`);v=x?Number(x.value):null}else if(["mcq2","mcq3"].includes(q.type)){v=[...document.querySelectorAll(`input[name="q-${q.id}"]:checked`)].map(x=>Number(x.value))}else if(q.type==="href_page"){v={pageTitle:document.querySelector(`[data-id="${q.id}-title"]`)?.value||"",href:document.querySelector(`[data-id="${q.id}-href"]`)?.value||""}}else if(q.type==="match"){v={};document.querySelectorAll(`[data-match-id="${q.id}"]`).forEach(x=>v[x.dataset.key]=x.value)}else{v=document.querySelector(`[data-id="${q.id}"]`)?.value||""}answers[q.id]=v;saveDraft();updateStatus()}
function saveDraft(){if(!exam||submitted)return;localStorage.setItem(draftKey(),JSON.stringify({answers,deadline,startedAt,attemptId,savedAt:Date.now()}))}
function restoreDraft(){try{const d=JSON.parse(localStorage.getItem(draftKey())||"null");if(!d)return;if(d.answers)answers={...d.answers};if(d.deadline&&d.deadline>Date.now())deadline=d.deadline;else if(d.deadline)deadline=0}catch{}}
function hasAnswer(q){const v=answers[q.id];if(v===null||v===undefined)return false;if(Array.isArray(v))return v.length>0;if(typeof v==='object')return Object.values(v).some(x=>String(x||"").trim());return String(v).trim()!==""}
function uniqueQuestions(list){const seen=new Set();return list.filter(q=>{const k=`${q.type}::${norm(q.question)}`;if(seen.has(k))return false;seen.add(k);return true})}
function sectionGroups(){
 const map=new Map();
 (exam?.questions||[]).forEach((q,i)=>{
   const n=Number(q.sectionNumber)||9999;
   if(!map.has(n))map.set(n,{number:n,title:q.sectionTitle||labels[q.type]||q.type,indices:[]});
   map.get(n).indices.push(i);
 });
 return [...map.values()].sort((a,b)=>a.number-b.number);
}
function sectionLabel(g){
 if(g.number===8)return 'Q8 — Programming';
 return `Q${g.number} — ${String(g.title||'').replace(/^Q\d+\s*[—-]\s*/,'')}`;
}
function subLabel(q,index){
 const n=Number(q.sectionNumber)||0;
 if(n===8){
   const sid=String(q.sectionId||'').toLowerCase();
   if(sid.includes('q8a'))return 'Q8(A)';
   if(sid.includes('q8b'))return 'Q8(B)';
 }
 return `Q${n}.${Number(q.subNumber)||index+1}`;
}
function renderSections(){
 const groups=sectionGroups();
 $("sectionTabs").innerHTML=groups.map(g=>`<button type="button" data-section="${g.indices[0]}" class="${g.indices.includes(current)?'active':''}">${esc(sectionLabel(g))}</button>`).join('');
 document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{
   collectCurrent();
   current=Number(b.dataset.section);
   renderQuestion();
 });
}
function renderQuestionTabs(){
 const q=exam.questions[current];
 const group=sectionGroups().find(g=>g.indices.includes(current));
 if(!group){$("questionTabs").innerHTML='';return}
 $("questionTabs").innerHTML=group.indices.map(i=>{
   const item=exam.questions[i];
   return `<button type="button" data-qtab="${i}" class="${i===current?'current':hasAnswer(item)?'answered':'pending'}">${esc(subLabel(item,i))}</button>`;
 }).join('');
 document.querySelectorAll('[data-qtab]').forEach(b=>b.onclick=()=>{
   collectCurrent();
   current=Number(b.dataset.qtab);
   renderQuestion();
 });
 renderSections();
}
function renderBody(q){
 if(["mcq1","mcq2","mcq3","true_false"].includes(q.type))return (q.options||[]).map((o,j)=>`<label class="option"><input type="${q.type==='mcq1'||q.type==='true_false'?'radio':'checkbox'}" name="q-${q.id}" value="${j}"> <span>${esc(o)}</span></label>`).join("");
 if(q.type==="programming")return `<div class="type-label">Language: ${esc(q.codeLanguage||"html")} · Maximum 400 lines · Teacher checked · <b>5 Marks</b></div><textarea class="code-answer" data-id="${q.id}" placeholder="Write your HTML / program here..."></textarea>`;
 if(q.type==="href_page")return `<div class="href-grid"><input class="text-answer" data-id="${q.id}-title" placeholder="Page title"><input class="text-answer" data-id="${q.id}-href" placeholder="about.html or https://example.com"></div>`;
 if(q.type==="match"){
   const pairs=Array.isArray(q.pairs)?q.pairs:[]; if(pairs.length)return `<table class="answer-table"><thead><tr><th>Column A</th><th>Your Answer</th></tr></thead><tbody>${pairs.map((p,i)=>`<tr><td>${esc(p.left||p.question||p[0]||"")}</td><td><select class="match-select" data-match-id="${q.id}" data-key="${i}"><option value="">Select</option>${(p.options||q.options||[]).map((x,j)=>`<option value="${j}">${esc(x)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>`;
 }
 return `<textarea class="text-answer" data-id="${q.id}" placeholder="Enter your answer here..."></textarea>`;
}
function restoreCurrent(q){const v=answers[q.id];if(v===undefined||v===null)return;if(["mcq1","true_false"].includes(q.type)){const x=document.querySelector(`input[name="q-${q.id}"][value="${v}"]`);if(x)x.checked=true}else if(["mcq2","mcq3"].includes(q.type)){(Array.isArray(v)?v:[]).forEach(n=>{const x=document.querySelector(`input[name="q-${q.id}"][value="${n}"]`);if(x)x.checked=true})}else if(q.type==="href_page"){const a=document.querySelector(`[data-id="${q.id}-title"]`),b=document.querySelector(`[data-id="${q.id}-href"]`);if(a)a.value=v.pageTitle||"";if(b)b.value=v.href||""}else if(q.type==="match"){Object.entries(v||{}).forEach(([k,val])=>{const x=document.querySelector(`[data-match-id="${q.id}"][data-key="${k}"]`);if(x)x.value=val})}else{const x=document.querySelector(`[data-id="${q.id}"]`);if(x)x.value=v}}
function renderQuestion(){
 const q=exam.questions[current];if(!q)return;const answered=hasAnswer(q);
 $("examTitle").textContent=exam.title||"Online Examination";$("paperKicker").textContent=labels[q.type]||q.type;
 const qLabel=q.sectionNumber&&q.subNumber?`Q${q.sectionNumber}.${q.subNumber}`:`Q${current+1}`; const sectionNote=q.sectionTitle?`<div class="section-title">${esc(q.sectionTitle)}</div>`:""; card.innerHTML=`<div class="q-card-head"><div class="q-number">${qLabel}</div><div class="q-text">${sectionNote}${esc(q.question)}</div><div class="marks">${q.type==='programming'?5:Number(q.marks)||1} Marks</div></div><div class="q-body"><div class="type-label">${esc(labels[q.type]||q.type)} · ${answered?"Answer saved":"Not answered"}${q.choiceGroup?` · ${esc(q.choiceMax)} to answer`:""}</div>${renderBody(q)}</div>`;
 restoreCurrent(q);renderQuestionTabs();updateProgress();
 $("prevBtn").disabled=current===0;$("nextBtn").textContent=current===exam.questions.length-1?"Review & Finish →":"Next →";
}
function updateProgress(){
 const total=exam.questions.length;
 const done=exam.questions.filter(hasAnswer).length;
 $("progressText").textContent=`${current+1} / ${total} · ${done} answered`;
 $("progressBar").style.width=`${total?Math.round(done/total*100):0}%`;
 document.querySelectorAll('[data-qtab]').forEach(b=>{
   const i=Number(b.dataset.qtab);
   b.classList.toggle('current',i===current);
   b.classList.toggle('answered',hasAnswer(exam.questions[i]));
   b.classList.toggle('pending',!hasAnswer(exam.questions[i]));
 });
 document.querySelectorAll('[data-section]').forEach(b=>{
   const first=Number(b.dataset.section);
   const group=sectionGroups().find(g=>g.indices.includes(first));
   b.classList.toggle('active',!!group&&group.indices.includes(current));
 });
 const groups=sectionGroups();
 $("statusGrid").innerHTML=groups.map(g=>{
   const active=g.indices.includes(current);
   const dots=g.indices.map(i=>{
     const q=exam.questions[i];
     const state=i===current?'current':hasAnswer(q)?'done':'pending';
     return `<button type="button" class="status-dot ${state}" data-status="${i}" title="${esc(subLabel(q,i))}" aria-label="${esc(subLabel(q,i))}"></button>`;
   }).join('');
   return `<div class="status-section ${active?'active':''}">
     <button type="button" class="status-section-title" data-section="${g.indices[0]}">Q${g.number}</button>
     <div class="status-subgrid">${dots}</div>
   </div>`;
 }).join('');
 document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{
   collectCurrent();
   current=Number(b.dataset.status);
   renderQuestion();
 });
 document.querySelectorAll('.status-section-title').forEach(b=>b.onclick=()=>{
   collectCurrent();
   current=Number(b.dataset.section);
   renderQuestion();
 });
}
function updateStatus(){updateProgress()}
function startClock(){const tick=()=>{const d=new Date(Date.now()+serverClockOffset);$("currentTime").textContent=d.toLocaleTimeString([], {hour12:false});if(!deadline)deadline=Date.now()+serverClockOffset+Number(exam.durationMinutes||60)*60000;const r=Math.max(0,Math.ceil((deadline-(Date.now()+serverClockOffset))/1000));const h=Math.floor(r/3600),m=Math.floor(r%3600/60),s=r%60;timerEl.textContent=`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;saveDraft();if(r<=0){clearInterval(timerHandle);submitExam(true)}};tick();timerHandle=setInterval(tick,1000);saveHandle=setInterval(saveDraft,5000);statusPollHandle=setInterval(async()=>{if(submitted)return;try{const r=await fetch(`/api/exam/status?id=${encodeURIComponent(exam.id)}`,{headers:{Authorization:`Bearer ${studentToken}`}});if(!r.ok)return;const st=await r.json();serverClockOffset=Number(st.serverNow||Date.now())-Date.now();if(st.status==="Ended"&&st.endsAt){const end=Date.parse(st.endsAt);if(Number.isFinite(end)&&end<deadline)deadline=end;}}catch{}},3000)}
async function submitExam(auto=false){if(submitted)return;collectCurrent();if(!auto&&!confirm("Submit exam now?"))return;submitted=true;clearInterval(timerHandle);clearInterval(saveHandle);clearInterval(statusPollHandle);const tooLong=exam.questions.some(q=>q.type==="programming"&&String(answers[q.id]||"").split(/\r?\n/).length>400);if(tooLong&&!auto){submitted=false;alert("Programming answer cannot exceed 400 lines.");return}try{const r=await fetch("/api/exam/submit",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${studentToken}`},body:JSON.stringify({answers,startedAt,examId:exam.id,autoSubmitted:auto,antiCheat,attemptId})});const d=await r.json();if(!r.ok)throw Error(d.message||"Unable to submit exam.");localStorage.removeItem(draftKey());sessionStorage.setItem("lastResult",JSON.stringify(d.result));location.href=`result.html?id=${encodeURIComponent(d.result.id)}${auto?"&auto=1":""}`}catch(e){submitted=false;messageEl.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
function wire(){$("prevBtn").onclick=()=>{collectCurrent();if(current>0){current--;renderQuestion()}};$("nextBtn").onclick=()=>{collectCurrent();if(current<exam.questions.length-1){current++;renderQuestion()}else{if(confirm("You reached the last question. Submit the exam?"))submitExam(false)}};$("saveBtn").onclick=()=>{collectCurrent();messageEl.innerHTML='<div class="success">Answer saved locally and will be submitted with the exam.</div>'};$("finishTop").onclick=()=>submitExam(false);$("finishSide").onclick=()=>submitExam(false);$("firstUnanswered").onclick=()=>{collectCurrent();const i=exam.questions.findIndex(q=>!hasAnswer(q));if(i>=0){current=i;renderQuestion()}else alert("All questions have an answer.")};form.addEventListener("input",e=>{if(e.target.classList.contains("code-answer")){const lines=String(e.target.value||"").split(/\r?\n/);if(lines.length>400)e.target.value=lines.slice(0,400).join("\n")}collectCurrent()});form.addEventListener("change",collectCurrent)}
async function loadExam(){try{const r=await fetch(`/api/exam${location.search}`,{headers:{Authorization:`Bearer ${studentToken}`}});const d=await r.json();if(!r.ok)throw Error(d.message||"Unable to load exam.");exam=d.exam;if(exam.status!=="Live"||!exam.endsAt)throw Error("The exam has not started yet or has already ended. Please wait for your teacher.");exam.questions=uniqueQuestions(exam.questions||[]);if(!exam.questions.length)throw Error("No questions available for this exam.");restoreDraft();serverClockOffset=Number(exam.serverNow||Date.now())-Date.now();deadline=Date.parse(exam.endsAt);if(!Number.isFinite(deadline))throw Error("The official exam deadline is unavailable. Please contact your teacher.");startedAt=exam.startedAt||startedAt;$("studentId").textContent=student.studentId||"—";$("student").textContent=student.name||"—";$("rollNo").textContent=student.rollNumber||"—";$("examId").textContent=exam.id||"—";$("className").textContent=exam.className||exam.class||"—";$("subject").textContent=exam.subject||"Information Technology";wire();renderSections();renderQuestion();startClock();try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{}}catch(e){messageEl.innerHTML=`<div class="error">${esc(e.message)}</div>`}}
loadExam();
})();
