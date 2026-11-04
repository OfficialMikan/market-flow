
const C=window.MF_CONFIG||{};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const peso=v=>v==null||isNaN(v)?"?":(v<0?"-":"")+"₱"+Math.abs(Math.round(v)).toLocaleString("en-PH");
const num=v=>v==null||v===""?null:(isFinite(+v)?+v:null);
const mins=iso=>iso?Math.max(0,Math.round((Date.now()-new Date(iso))/6e4)):null;
const ago=iso=>{const m=mins(iso);return m==null?"":m<60?m+" min ago":m<1440?Math.floor(m/60)+" h ago":Math.floor(m/1440)+" d ago"};
const safeUrl=u=>/^https:\/\//.test(u||"")?u:"";
const EMO={"Phones":"📱","Tablets & Wearables":"⌚","Laptops":"💻","Desktops & Parts":"🖥️","Monitors":"🖵","Peripherals":"⌨️","Audio":"🎧","Gaming":"🎮","Cameras & Drones":"📷","Networking & Storage":"💾","Smart Home & Power":"🔌","Printers & 3D":"🖨️","Other":"📦"};
const BASIS={buyer:"a buyer is asking",sold:"recent sold prices",asking:"current asking prices",ai:"an AI estimate"},CONF={A:["Buyer found","up"],B:["Sold comps","up"],C:["Market comps",""],D:["Estimate","warn"]};
const IC={flips:'<path d="M4 8h13l-3-3M20 16H7l3 3"/>',buy:'<path d="M3 12V4h8l9 9-8 8-9-9z"/><path d="M7.5 7.5h.01"/>',sell:'<path d="M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.6 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3"/>',profit:'<path d="M4 20V10M10 20V5M16 20v-7M22 20H2"/>',settings:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4"/>',places:'<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'};
const NAV=[["flips","Flips"],["buy","Buy"],["sell","Sell"],["places","Places"],["profit","Profit"],["settings","Settings"]];
let ALL=[],GONE=0,VIEW="flips",cat="All",QS="",SORT="score",F={profit:false,fresh:false,saved:false,drops:false},ST={},TR=[],PRIV={},PASS="",DEMO=/[?&]demo/.test(location.search);
try{ST=JSON.parse(localStorage.getItem("mf-saved")||"{}");TR=JSON.parse(localStorage.getItem("mf-trades")||"[]");PASS=localStorage.getItem("mf-pass")||sessionStorage.getItem("mf-pass-s")||""}catch(e){}
const LV=+(localStorage.getItem("mf-visit")||Date.now()-3*36e5);
let ZONES={near:true,nearby:true,unknown:true,far:false},PLACE="",CFG={near_km:15,far_km:50,haggle_pct:5,fee_pct:3},SETT=null,OF={},MAP=null,UNLOCK_MSG="",TRIED=false;
try{OF=JSON.parse(localStorage.getItem("mf-offers")||"{}")}catch(e){}
document.addEventListener("visibilitychange",()=>{if(document.hidden)try{localStorage.setItem("mf-visit",Date.now())}catch(e){}});
const saveTR=()=>{try{localStorage.setItem("mf-trades",JSON.stringify(TR))}catch(e){}};
const note=t=>{$("msg").innerHTML=t?'<div class="note">'+t+'</div>':""};
const H=()=>({apikey:C.anonKey,Authorization:"Bearer "+C.anonKey}),API=()=>(C.url||"").replace(/\/$/,"");
const sells=()=>ALL.filter(x=>x.intent!=="wanted"),wants=()=>ALL.filter(x=>x.intent==="wanted");
const isNew=x=>+new Date(x.first_seen)>LV;
const svg=(n,c)=>`<svg viewBox="0 0 24 24" class="${c||""}" aria-hidden="true">${IC[n]}</svg>`;
const pin='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const clock='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const arrow='<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function spread(x){
  if(!x.sell_price||!x.price)return"";
  const sell=x.sell_price,fees=Math.round(sell*.08),tr=x.travel_cost||0,tot=Math.max(sell,x.price+fees+tr),p=v=>Math.max(0,v/tot*100).toFixed(1);
  return `<div class="spread" role="img" aria-label="Of ${peso(sell)}, ${peso(x.price)} is your cost, ${peso(fees+tr)} fees and travel, ${peso(sell-x.price-fees-tr)} profit"><i style="width:${p(x.price)}%"></i><u style="width:${p(fees+tr)}%"></u><b style="width:${p(sell-x.price-fees-tr)}%"></b></div>`}
function netTag(x){return x.net_profit==null?"":`<span class="net${x.net_profit<=0?" neg":""}" title="Expected profit after fees and travel">${x.net_profit>0?"+":""}${peso(x.net_profit)}</span>`}
function zoneOf(x){return x.distance_km==null?"unknown":x.distance_km<=CFG.near_km?"near":x.distance_km<=CFG.far_km?"nearby":"far"}
function where(x){const a=x.place||x.area||x.location_text||"",ap=x.geo_precision==="guess"||x.geo_precision==="geocoded"?" (approx.)":"";return (a?`<span>${pin}${esc(a)}${ap}</span>`:"")+(x.distance_km!=null?`<span>${x.distance_km} km away</span>`:"")+`<span>${clock}${esc(ago(x.posted_at||x.first_seen))}</span>`}
function tags(x){let t="";if(isNew(x))t+='<span class="chip warn">New</span>';if(x.price_drop_pct>0)t+=`<span class="chip up">Down ${x.price_drop_pct}%</span>`;const c=CONF[x.confidence];if(c)t+=`<span class="chip ${c[1]}">${c[0]}</span>`;if(x.kind==="post")t+='<span class="chip">Group post</span>';const z=zoneOf(x);if(z==="far")t+='<span class="chip bad">Far</span>';if(z==="unknown")t+='<span class="chip">Location unknown</span>';if(x.price_note)t+='<span class="chip warn">Price corrected</span>';if(x.mismatch)t+='<span class="chip bad">Photos differ</span>';return t}
function pic(x,i){const im=safeUrl(x.image_url);return `<div class="pic">${EMO[x.category]||"📦"}${im?`<img src="${esc(im)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-rm="">`:""}${i!=null?`<span class="rank">#${i+1}</span>`:""}</div>`}
function card(x,i){
  const w=x.intent==="wanted",buyers=(x.matches||[]).length;
  return `<article class="card" data-open="${esc(x.hash)}"><div>${pic(x,i)}</div><div><div class="ttl"><button class="lk" data-open="${esc(x.hash)}">${esc(x.title)}</button></div><div class="meta">${where(x)}</div><div>${tags(x)}</div></div>
${w?`<div class="strip"><div><small>Buyer's budget</small><b class="pr">${x.price?peso(x.price):"not stated"}</b></div>${netTag(x)}</div>`:`<div class="strip"><div><small>Buy at</small><b class="pr">${peso(x.price)}</b></div>${x.sell_price?arrow+`<div><small>Sell at</small><b class="pr">${peso(x.sell_price)}</b></div>`:""}${netTag(x)}</div>${spread(x)}`}
<div class="foot"><span>${w?(buyers?buyers+" seller"+(buyers>1?"s":"")+" can fill this":"No seller found yet"):(buyers?buyers+" buyer"+(buyers>1?"s":"")+" asking":"No buyer asking yet")}${!w&&x.sell_days?" · sells in ~"+Math.round(x.sell_days)+" d":""}</span><button class="btn" data-act="save" data-h="${esc(x.hash)}">${ST[x.hash]?"Saved":"Save"}</button></div></article>`}
const cats=rows=>["All",...[...new Set(rows.map(x=>x.category||"Other"))]];
function zoneRow(rows){const z={near:0,nearby:0,far:0,unknown:0};rows.forEach(x=>z[zoneOf(x)]++);return `<div class="row" data-role="zones" aria-label="Distance filter">${[["near","Near"],["nearby","Nearby"],["unknown","Location unknown"],["far","Far"]].map(([k,l])=>`<button class="btn" data-z="${k}" aria-pressed="${ZONES[k]}">${l} (${z[k]})</button>`).join("")}${PLACE?`<button class="btn" data-place="">${PLACE==="__none"?"No place":esc(PLACE)} ✕</button>`:""}</div>`}
const chipRow=rows=>`<div class="row" data-role="cats">${cats(rows).map(c=>`<button class="btn" data-cat="${esc(c)}" aria-pressed="${c==cat}">${esc(c)}</button>`).join("")}</div>`+zoneRow(rows);
function filtered(rows){return rows.filter(x=>(cat=="All"||(x.category||"Other")==cat)&&(x.title||"").toLowerCase().includes(QS)&&ZONES[zoneOf(x)]&&(!PLACE||(PLACE==="__none"?!x.place:x.place===PLACE))&&(!F.profit||x.net_profit>0)&&(!F.fresh||isNew(x))&&(!F.saved||ST[x.hash])&&(!F.drops||x.price_drop_pct>0))}
const SORTS={score:x=>-x.score,net:x=>-(x.net_profit??-1e9),margin:x=>-(x.margin_pct??-1e9),demand:x=>-x.demand,dist:x=>x.distance_km==null?1e9:x.distance_km,new:x=>mins(x.first_seen),drop:x=>-(x.price_drop_pct||0)};
function products(){
  const g={};sells().filter(x=>ZONES[zoneOf(x)]).forEach(x=>{const k=x.name||x.title;(g[k]??={name:k,cat:x.category,rows:[],asks:0}).rows.push(x)});
  wants().forEach(w=>{if(g[w.name])g[w.name].asks++});
  return Object.values(g).map(p=>{const pos=p.rows.filter(r=>r.net_profit>0),avg=a=>a.reduce((s,r)=>s+(r.net_profit||0),0)/(a.length||1),dem=p.rows.reduce((s,r)=>s+r.demand,0)/p.rows.length;
    return {...p,count:p.rows.length,flips:pos.length,avgNet:avg(pos),best:Math.max(0,...p.rows.map(r=>r.net_profit||0)),demand:Math.round(dem),days:(p.rows.find(r=>r.sell_days)||{}).sell_days,score:avg(pos)*(.5+dem/100)+p.asks*100}}).filter(p=>p.flips>0).sort((a,b)=>b.score-a.score)}
const prodRow=p=>`<div class="fl"><b>${esc(p.name)}</b><div><div class="bar"><i style="width:${p.demand}%"></i></div><small>demand ${p.demand}${p.days?" · sells in ~"+Math.round(p.days)+" d":""}${p.asks?" · "+p.asks+" buyer"+(p.asks>1?"s":"")+" asking":""}</small></div><small>${p.flips} flip${p.flips>1?"s":""} · avg ${peso(p.avgNet)}</small></div>`;

function vFlips(){
  const fl=sells().filter(x=>x.net_profit>0),best=fl.filter(x=>ZONES[zoneOf(x)]).reduce((m,x)=>Math.max(m,x.net_profit),0),L=filtered(fl).sort((a,b)=>SORTS.score(a)-SORTS.score(b)),pr=products().slice(0,5);
  return `<div class="tiles"><div class="tile"><span class="num">${best?peso(best):"-"}</span><small>best profit on one flip</small></div><div class="tile"><span class="num">${fl.filter(x=>ZONES[zoneOf(x)]).length}</span><small>flips worth doing</small></div><div class="tile"><span class="num">${wants().length}</span><small>buyers asking</small></div><div class="tile"><span class="num">${GONE}</span><small>sold or removed (48 h)</small></div></div>
<h2>Top products to flip</h2><p class="hint">Ranked by profit per item, demand and open buyer requests.</p>${pr.length?`<div class="panel">${pr.map(prodRow).join("")}</div>`:'<div class="empty">Nothing profitable yet. Run a scan, or open this page with ?demo to preview.</div>'}
<h2>Best flips right now</h2><p class="hint">Buy from the seller, sell to the buyer or at the market price. Profit is after 8% fees and travel.</p>${chipRow(fl)}<div class="list">${L.length?L.slice(0,40).map(card).join(""):'<div class="empty">No flips match.</div>'}</div>`}
function vBuy(){
  const L=filtered(sells()).sort((a,b)=>SORTS[SORT](a)-SORTS[SORT](b));
  return `<h2>Buy</h2><p class="hint">Every listing and group post for sale near you.</p>${chipRow(sells())}
<div class="tools"><input id="q" type="search" placeholder="Search items" aria-label="Search items" value="${esc(QS)}"><select id="sort" aria-label="Sort by">${[["score","Best flip"],["net","Most profit"],["margin","Best return"],["demand","Highest demand"],["dist","Nearest"],["new","Newest"],["drop","Biggest price drop"]].map(o=>`<option value="${o[0]}"${o[0]==SORT?" selected":""}>${o[1]}</option>`).join("")}</select></div>
<div class="row">${[["profit","Profitable only"],["fresh","New since last visit ("+sells().filter(isNew).length+")"],["drops","Price drops"],["saved","Saved"]].map(o=>`<button class="btn" data-f="${o[0]}" aria-pressed="${F[o[0]]}">${o[1]}</button>`).join("")}</div>
<div class="list">${L.length?L.slice(0,100).map((x,i)=>card(x,i)).join(""):'<div class="empty">'+(ALL.length?"No items match these filters.":"Connected, but no listings are saved yet. Run the scanner, then refresh.")+'</div>'}</div>`}
const sim=(a,b)=>{const A=new Set(String(a).toLowerCase().split(/\W+/).filter(Boolean)),B=new Set(String(b).toLowerCase().split(/\W+/).filter(Boolean));const i=[...A].filter(t=>B.has(t)).length;return i/(A.size+B.size-i||1)};
const med=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):null};
function vSell(){
  const W=filtered(wants()).sort((a,b)=>b.score-a.score),stock=TR.filter(t=>t.sell==null),pr=products();
  const stockRows=stock.map(t=>{const m=sells().filter(x=>sim(t.item,x.name||x.title)>=.4).map(x=>x.sell_price||x.price),md=med(m);return `<div class="ag"><div><b>${esc(t.item)}</b><span>${md?`Market about ${peso(md)} from ${m.length} listing${m.length>1?"s":""}. List at ${peso(Math.round(md*.97/50)*50)}. You paid ${peso(t.buy)}.`:"No comparable listings yet. You paid "+peso(t.buy)+"."}</span></div></div>`}).join("");
  return `<h2>Sell</h2><p class="hint">Who wants to buy, what is in demand, and what to list your own stock at.</p>
<h3>Buyers asking near you</h3>${chipRow(wants())}<div class="list">${W.length?W.slice(0,40).map(card).join(""):'<div class="empty">No "wanted" posts yet. Add public Facebook groups in Settings.</div>'}</div>
<h3>In demand</h3>${pr.length?`<div class="panel">${pr.slice(0,12).map(prodRow).join("")}</div>`:'<div class="empty">No data yet.</div>'}
<h3>Your stock</h3>${stockRows||'<div class="empty">Items you log in Profit and have not sold show up here with a suggested price.</div>'}`}
function vProfit(){
  const sold=TR.filter(t=>t.sell!=null),stock=TR.filter(t=>t.sell==null),profit=sold.reduce((s,t)=>s+t.sell-t.buy,0),cost=sold.reduce((s,t)=>s+t.buy,0),byC={};
  sold.forEach(t=>{const c=t.cat||"Other";(byC[c]??=[0,0]);byC[c][0]+=t.sell-t.buy;byC[c][1]++});
  return `<h2>Profit tracker</h2><div class="tiles" id="pSum">${[[peso(profit),"profit"],[cost?Math.round(profit/cost*100)+"%":"-","return"],[stock.length,"in stock"],[peso(stock.reduce((s,t)=>s+t.buy,0)),"money tied up"]].map(a=>`<div class="tile"><span class="num">${esc(a[0])}</span><small>${a[1]}</small></div>`).join("")}</div>
<div class="form"><input id="tItem" placeholder="Item you bought" aria-label="Item you bought"><input id="tBuy" type="number" inputmode="decimal" placeholder="Paid (₱)" aria-label="Paid"><select id="tCat" aria-label="Category">${Object.keys(EMO).map(c=>`<option>${esc(c)}</option>`).join("")}</select><button class="btn pri" id="tAdd">Add item</button></div>
<div id="pList">${TR.length?TR.slice().reverse().map(t=>`<div class="ag"><div><b>${esc(t.item)}</b><span>${esc(t.cat||"Other")}, paid ${peso(t.buy)}${t.sell!=null?", sold "+peso(t.sell)+", "+(t.sell>=t.buy?"+":"")+peso(t.sell-t.buy):""}</span></div><div>${t.sell==null?`<button class="btn" data-sold="${t.id}">Sold</button> `:""}<button class="btn" data-del="${t.id}">Delete</button></div></div>`).join(""):'<div class="empty">Nothing yet. Add what you buy, or tap Bought in a listing preview.</div>'}</div>
<h3>Profit by category</h3><div class="panel" id="pCat">${Object.entries(byC).map(([c,v])=>`<div class="fl"><b>${esc(c)}</b><span></span><small>${v[1]} sold, ${peso(v[0])}</small></div>`).join("")||'<div class="empty">Mark items as sold to see this.</div>'}</div>
${offersHtml()}<div class="row" style="margin-top:12px"><button class="btn" id="tCsv">Export CSV</button></div><p class="hint">Saved on this device only. Clearing browser data erases it, so export now and then.</p>`}
const CATLIST=Object.keys(EMO).filter(c=>c!=="Other");
const GST={active:["On","up"],candidate:["Waiting for check",""],muted:["Muted","warn"],rejected:["Rejected","bad"]};
function lockHtml(){return `<h2>Settings</h2><p class="hint">Enter your passcode to view or change settings.</p><div class="sett"><label for="uPass">Passcode</label><input id="uPass" type="password" autocomplete="current-password"><label class="inl"><input type="checkbox" id="uRem"> Remember on this device</label><div class="row" style="margin-top:12px"><button class="btn pri" id="uGo">Unlock</button></div>${UNLOCK_MSG?`<div class="note">${esc(UNLOCK_MSG)}</div>`:""}</div>`}
function vSettings(){
  if(!SETT)return lockHtml();
  const s=SETT.settings||{},h=SETT.home||{};
  return `<h2>Settings</h2><p class="hint">Applied on the next scan. Leave a box empty for no limit.</p><div class="sett">
<div class="row"><button class="btn" id="lockNow">Lock settings</button></div>
<h3>What to scan</h3><label>Categories</label><div class="checks" id="sCats">${CATLIST.map(c=>`<label><input type="checkbox" value="${esc(c)}"${(s.categories||[]).includes(c)?" checked":""}> ${esc(c)}</label>`).join("")}</div>
<label for="sWatch">Your own searches, run every scan (separate with commas)</label><textarea id="sWatch" rows="2">${esc((s.watch||[]).join(", "))}</textarea>
<h3>Facebook groups</h3><p class="hint">Public groups near you are found and checked automatically. Turn them on or off here, or add your own below.</p>
<div id="gList">${(SETT.groups||[]).length?SETT.groups.map(g=>{const st=GST[g.status]||["",""];return `<div class="ag"><div><b>${esc(String(g.url).replace("https://www.facebook.com/groups/",""))}</b><span><span class="chip ${st[1]}">${st[0]}</span>${g.score!=null?` score ${g.score}, ${g.posts_seen||0} posts, ${Math.round((g.sell_ratio||0)*100)}% for sale, ${Math.round((g.local_ratio||0)*100)}% local`:""}${g.reason?", "+esc(g.reason):""}</span></div><div class="acts">${["active","muted","rejected"].filter(k=>k!==g.status).map(k=>`<button class="btn" data-grp="${esc(g.url)}" data-st="${k}">${{active:"Turn on",muted:"Mute",rejected:"Reject"}[k]}</button>`).join("")}</div></div>`}).join(""):'<div class="empty">No groups found yet. The finder runs during a scan.</div>'}</div>
<label for="sGroups">Add public groups yourself (one link per line)</label><textarea id="sGroups" rows="3" placeholder="https://www.facebook.com/groups/...">${esc((s.groups||[]).join("\n"))}</textarea>
<h3>Location and distance</h3><p class="hint">Near and nearby listings show first. Far ones are kept: show them with the Far button.</p>
<div class="two"><div><label for="sNear">Near means within (km)</label><input id="sNear" type="number" inputmode="decimal" value="${s.near_km??15}"></div><div><label for="sFar">Nearby means within (km)</label><input id="sFar" type="number" inputmode="decimal" value="${s.far_km??50}"></div></div>
<label>Your location (distances are measured from here)</label><div class="two"><input id="hLat" type="number" step="any" placeholder="Latitude" aria-label="Latitude" value="${h.lat??""}"><input id="hLng" type="number" step="any" placeholder="Longitude" aria-label="Longitude" value="${h.lng??""}"></div>
<input id="hName" placeholder="Place name, for example Magalang" aria-label="Place name" value="${esc(h.name||"")}" style="margin-top:8px"><div class="row" style="margin-top:8px"><button class="btn" id="useLoc">Use my current location</button><button class="btn" id="saveHome">Save location</button></div>
<h3>Profit math</h3><p class="hint">Haggling is the discount buyers usually ask for before they agree. Platform and payment fees cover e-wallet or bank charges, packaging, boosts and small costs. Facebook Marketplace and Carousell charge nothing for local meet-ups, so 3% is a safe allowance. Change both to match your real experience.</p>
<div class="two"><div><label for="sHaggle">Haggling (%)</label><input id="sHaggle" type="number" inputmode="decimal" value="${s.haggle_pct??5}"></div><div><label for="sFee">Platform and payment fees (%)</label><input id="sFee" type="number" inputmode="decimal" value="${s.fee_pct??3}"></div></div>
<h3>Alerts</h3><div class="two"><div><label for="sMargin">Return at least (%)</label><input id="sMargin" type="number" inputmode="decimal" value="${s.min_margin||""}"></div><div><label for="sNet">Profit at least (₱)</label><input id="sNet" type="number" inputmode="decimal" value="${s.min_net??""}"></div><div><label for="sPrice">Price at most (₱)</label><input id="sPrice" type="number" inputmode="decimal" value="${s.max_price??""}"></div><div><label for="sKm">Within (km)</label><input id="sKm" type="number" inputmode="decimal" value="${s.max_km??""}"></div></div>
<div class="row" style="margin-top:16px"><button class="btn pri" id="sSave">Save settings</button></div>
<h3>Change passcode</h3><label for="nPass">New passcode (12 characters or more)</label><input id="nPass" type="password" autocomplete="new-password"><div class="row" style="margin-top:8px"><button class="btn" id="chPass">Change passcode</button></div></div>`}
function vPlaces(){
  const rows=ALL.filter(x=>ZONES[zoneOf(x)]),g={};
  rows.forEach(x=>{const k=x.place||"Unknown place",p=g[k]??={name:k,km:null,n:0,cats:{},w:0};p.n++;if(x.intent==="wanted")p.w++;if(x.distance_km!=null)p.km=p.km==null?x.distance_km:Math.min(p.km,x.distance_km);const c=x.category||"Other";p.cats[c]=(p.cats[c]||0)+1});
  const P=Object.values(g).sort((a,b)=>(a.km??1e9)-(b.km??1e9));
  return `<h2>Places</h2><p class="hint">Where listings are, nearest first. Tap a place to see what is for sale there.</p>${zoneRow(ALL)}
<div class="tiles"><div class="tile"><span class="num">${P.length}</span><small>places</small></div><div class="tile"><span class="num">${P[0]?esc(P[0].name):"-"}</span><small>nearest place</small></div><div class="tile"><span class="num">${rows.filter(x=>x.lat!=null).length}</span><small>listings on the map</small></div></div>
<div class="map" id="map" role="region" aria-label="Map of listings"></div>
<div class="panel">${P.map(p=>`<div class="fl place" data-goplace="${esc(p.name==="Unknown place"?"__none":p.name)}" role="button" tabindex="0"><b>${esc(p.name)}</b><div>${Object.entries(p.cats).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<span class="chip">${esc(c)} ${n}</span>`).join("")}</div><small>${p.km==null?"distance unknown":p.km+" km"}, ${p.n} listing${p.n>1?"s":""}${p.w?`, ${p.w} wanted`:""}</small></div>`).join("")||'<div class="empty">No listings in these zones.</div>'}</div>`}
function initMap(rows){
  if(MAP){MAP.remove();MAP=null}
  const el=$("map");if(!el)return;
  if(!window.L){el.innerHTML='<div class="empty">The map could not load. The list below still works.</div>';return}
  const pts=rows.filter(x=>x.lat!=null&&x.lng!=null);
  if(!pts.length){el.innerHTML='<div class="empty">No mapped listings yet.</div>';return}
  MAP=L.map(el,{scrollWheelZoom:false}).setView([med(pts.map(p=>p.lat)),med(pts.map(p=>p.lng))],10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"© OpenStreetMap contributors"}).addTo(MAP);
  const col={near:"#0b8a5f",nearby:"#2540d9",far:"#c4351f",unknown:"#566782"},bounds=[];
  pts.forEach(p=>{const m=L.circleMarker([p.lat,p.lng],{radius:7,color:"#fff",weight:2,fillColor:col[zoneOf(p)],fillOpacity:.9}).addTo(MAP);m.bindTooltip(esc(String(p.title).slice(0,50))+" "+peso(p.price));m.on("click",()=>openSheet(p.hash));bounds.push([p.lat,p.lng])});
  if(bounds.length>1)MAP.fitBounds(bounds,{padding:[24,24],maxZoom:13});
}
function render(){
  const lm=ALL.reduce((m,x)=>Math.max(m,+new Date(x.last_seen)),0),m=lm?Math.round((Date.now()-lm)/6e4):null;
  $("upd").textContent=DEMO?"Demo data, not your real listings":m==null?(C.url?"No listings yet":"Not connected"):"Last scan "+(m<60?m+" min":Math.floor(m/60)+" h")+" ago";
  if(!DEMO&&m!=null&&m>180)note("The scanner has not saved anything for over 3 hours. Check the Actions tab on GitHub.");
  try{const nb=sells().filter(isNew).length;navigator.setAppBadge&&navigator.setAppBadge(nb)}catch(e){}
  $("nav").innerHTML=NAV.map(n=>`<button data-v="${n[0]}"${n[0]==VIEW?' aria-current="page"':""}>${svg(n[0])}<span>${n[1]}</span></button>`).join("");
  $("main").innerHTML={flips:vFlips,buy:vBuy,sell:vSell,places:vPlaces,profit:vProfit,settings:vSettings}[VIEW]();
  if(VIEW=="places")initMap(ALL.filter(x=>ZONES[zoneOf(x)]));
  if(VIEW=="settings"&&!SETT&&PASS&&!TRIED){TRIED=true;unlock(PASS,false,true)}
}
// ---------- preview sheet ----------
let CUR=null,LASTF=null;
async function rpc(name,body){const r=await fetch(API()+"/rest/v1/rpc/"+name,{method:"POST",headers:{...H(),"content-type":"application/json"},body:JSON.stringify(body||{})});if(!r.ok)throw new Error("HTTP "+r.status+(r.status==404?" (run migration-4.sql in Supabase)":""));return r.json()}
const DEMO_PRIV=h=>({seller_name:h.startsWith("w")?"Demo Buyer":"Demo Seller",seller_url:"",seller_rating:4.8,seller_reviews:23,seller_tenure:3,seller_score:88,meetup:"SM Clark entrance",description:h.startsWith("w")?"WTB Nintendo Switch OLED, budget 14k, Mabalacat area. Cash ready, can meet today.":"Barely used, complete with box and charger. Selling because I upgraded. Meetup only."});
async function getPrivateMany(hs){
  if(DEMO){hs.forEach(h=>PRIV[h]=PRIV[h]||DEMO_PRIV(h));return PRIV}
  if(!PASS)return {none:"Unlock Settings with your passcode to see seller and buyer details."};
  const need=hs.filter(h=>!(h in PRIV));
  if(need.length){try{const r=await rpc("mf_get_private",{p_pass:PASS,p_hashes:need});if(!r.ok)return {none:r.error||"Passcode not accepted."};need.forEach(h=>PRIV[h]=null);(r.rows||[]).forEach(p=>PRIV[p.hash]=p)}catch(e){return {none:"Details unavailable: "+e.message}}}
  return PRIV}
async function getHistory(h){
  if(DEMO)return [3100,3000,2900,2700];
  try{const r=await fetch(API()+"/rest/v1/price_history?select=price,seen_at&order=seen_at.asc&hash=eq."+encodeURIComponent(h),{headers:H()});return r.ok?(await r.json()).map(p=>+p.price):[]}catch(e){return[]}}
const offerText=x=>`Hi! Is the ${(x.name||x.title).slice(0,60)} still available?${x.issues&&x.issues.length?" I noticed "+x.issues[0]+", so":""} Would you accept ${peso(x.offer_price||x.price)}? I can meet ${x.place||x.area||x.location_text?"around "+(x.place||x.area||x.location_text):"anywhere convenient"} and pay cash. Salamat po!`;
function spark(a){if(a.length<2)return"";const mn=Math.min(...a),mx=Math.max(...a),w=300,h=46,pts=a.map((v,i)=>`${(i/(a.length-1)*w).toFixed(1)},${(h-4-(mx==mn?.5:(v-mn)/(mx-mn))*(h-8)).toFixed(1)}`).join(" ");return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Price history from ${peso(a[0])} to ${peso(a[a.length-1])}"><polyline points="${pts}"/></svg>`}
const kv=rows=>{const r=rows.filter(a=>a[1]!=null&&a[1]!==""&&a[1]!==false);return r.length?`<div class="kv">${r.map(a=>`<span>${esc(a[0])}</span><b>${esc(a[1])}</b>`).join("")}</div>`:""};
const PREC={exact:"Exact coordinates from the listing",town:"Town centre",guess:"Approximate: town name matched",geocoded:"Looked up from the place name",none:"Unknown"};
const OFFER_STATES=["Not contacted","Messaged","Replied","Negotiating","Bought","Dropped"];
function setOffer(h,patch){OF[h]={status:"Not contacted",...(OF[h]||{}),...patch,at:new Date().toISOString()};try{localStorage.setItem("mf-offers",JSON.stringify(OF))}catch(e){}}
function sellerHtml(p){const trust=p.seller_score!=null?` <span class="trust chip ${p.seller_score>=75?"up":p.seller_score>=50?"warn":"bad"}">Trust ${p.seller_score}</span>`:"";
  const nm=safeUrl(p.seller_url)?`<a href="${esc(safeUrl(p.seller_url))}" target="_blank" rel="noopener noreferrer">${esc(p.seller_name||"Profile")}</a>`:esc(p.seller_name||"Unknown");
  return `<div><b>${nm}</b>${trust}</div>`+kv([["Rating",p.seller_rating!=null?p.seller_rating+" ("+(p.seller_reviews||0)+" reviews)":""],["On the platform",p.seller_tenure!=null?p.seller_tenure+" years":""],["Meet-up spot",p.meetup]])}
function sheetHtml(x){
  const w=x.intent==="wanted",sell=x.sell_price||0,hg=Math.round(sell*CFG.haggle_pct/100),fe=Math.round(sell*CFG.fee_pct/100),tr=x.travel_cost||0,u=safeUrl(x.url);
  const imgs=[x.image_url,...(x.images||[])].filter((s,i,a)=>safeUrl(s)&&a.indexOf(s)===i),lvl=["","Minor issues","Major issues"][x.issue_level||0],z=zoneOf(x),o=OF[x.hash]||{status:"Not contacted",note:""};
  const photo=(x.defects||[]).length||(x.inclusions||[]).length||x.case_note||x.photo_notes||x.mismatch;
  const buyerRows=(x.matches||[]).map(m=>w?`<div class="ag"><div><b>${esc(m.title)}</b><span>${peso(m.price)}, you would net ${m.net==null?"?":peso(m.net)}</span></div><button class="btn" data-open="${esc(m.hash)}">Preview</button></div>`
    :`<div class="ag"><div><b>${m.budget?"Budget "+peso(m.budget):"Budget not stated"}</b><span>${esc(m.area||"area not stated")}${m.at?", "+esc(ago(m.at)):""}</span>${m.hash?`<span class="bi" data-bh="${esc(m.hash)}"></span>`:""}</div>${safeUrl(m.url)?`<a class="btn" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer">Open post</a>`:""}</div>`).join("");
  return `<button class="btn x" data-act="close">Close</button><h3 style="margin-top:2px">${esc(x.title)}</h3><div>${tags(x)}${x.condition&&x.condition!=="unknown"?`<span class="chip">${esc(x.condition)}</span>`:""}${x.negotiable?'<span class="chip">Negotiable</span>':""}</div>
<div class="gal"><div class="main" id="gmain">${imgs[0]?`<img class="big" src="${esc(imgs[0])}" alt="" referrerpolicy="no-referrer" data-rm="">`:EMO[x.category]||"📦"}</div>${imgs.length>1?`<div class="thumbs">${imgs.map((s,i)=>`<img src="${esc(s)}" alt="Photo ${i+1}" data-big="${esc(s)}" referrerpolicy="no-referrer"${i?"":' aria-current="true"'}>`).join("")}</div>`:""}</div>
${x.price_note?`<div class="note">Price corrected. ${esc(x.price_note)}.</div>`:""}${x.summary?`<p>${esc(x.summary)}</p>`:""}
${w?`<h3>Buyer's request</h3>${kv([["Budget",x.price?peso(x.price):"not stated"],["Area",x.place||x.area||x.location_text||"not stated"],["Posted",ago(x.posted_at||x.first_seen)]])}<div id="privBox" class="hint">Loading…</div>`
:`<h3>Profit breakdown</h3><div class="kv"><span>Expected sale price (${esc(BASIS[x.sell_basis]||"no estimate")})</span><b>${sell?peso(sell):"?"}</b><span>Haggling (${CFG.haggle_pct}%)</span><b>-${peso(hg)}</b><span>Platform and payment fees (${CFG.fee_pct}%)</span><b>-${peso(fe)}</b><span>You buy at</span><b>-${peso(x.price)}</b><span>Travel to meet</span><b>-${peso(tr)}</b><span class="tot">Net profit</span><b class="tot">${x.net_profit==null?"?":peso(x.net_profit)}${x.margin_pct!=null?" ("+x.margin_pct+"%)":""}</b></div><div style="margin-top:8px">${spread(x)}</div>
<details><summary>What are haggling and fees?</summary><p class="hint">Haggling is the discount buyers usually ask for before they agree. Platform and payment fees cover e-wallet or bank charges, packaging, boosts and small costs. Meet-ups on Facebook Marketplace and Carousell cost nothing, so these are allowances, not exact charges. You can change both percentages in Settings.</p></details>`}
<h3>Location</h3>${kv([["Place",x.place||x.area||x.location_text],["Distance",x.distance_km!=null?x.distance_km+" km ("+{near:"near",nearby:"nearby",far:"far",unknown:""}[z]+")":"unknown"],["How accurate",PREC[x.geo_precision]||""]])}<div id="meetBox"></div>
<h3>${w?"Sellers who can fill it":"Buyers asking"}</h3>${buyerRows||`<p class="hint">${w?"No seller found yet.":"No buyer asking yet. The sell price is based on "+esc(BASIS[x.sell_basis]||"nothing yet")+"."}</p>`}
<h3>Photo check</h3>${photo?`<div>${(x.defects||[]).map(s=>`<span class="chip bad">${esc(s)}</span>`).join("")}${(x.inclusions||[]).map(s=>`<span class="chip up">${esc(s)}</span>`).join("")}${x.case_note?`<span class="chip">${esc(x.case_note)}</span>`:""}</div>${x.mismatch?'<div class="note">The photos seem to differ from the description. Ask the seller before paying.</div>':""}${x.photo_notes?`<p class="hint">${esc(x.photo_notes)}</p>`:""}`:`<p class="hint">${x.vision_done?"Nothing notable seen in the photos.":"Photos are checked for a few new listings per scan. This one has not been checked yet."}</p>`}
${(x.specs||[]).length||(x.issues||[]).length?`<h3>Specs and issues</h3><div>${(x.specs||[]).map(s=>`<span class="chip">${esc(s)}</span>`).join("")}${(x.issues||[]).map(s=>`<span class="chip bad">${esc(s)}</span>`).join("")}</div>${lvl?`<p class="hint">${lvl}: the profit estimate already allows for this.</p>`:""}`:""}
<h3>All details</h3>${kv([["Brand",x.brand],["Model",x.model],["Color",x.color],["Year",x.year],["Quantity",x.quantity>1?x.quantity:""],["Warranty",x.warranty],["Receipt or box",x.has_receipt?"Yes":""],["Reason for selling",x.reason],["Delivery",x.delivery&&x.delivery!=="unknown"?x.delivery:""],["Negotiable",x.negotiable===true?"Yes":x.negotiable===false?"No":""],["Category",x.category],["Source",String(x.source||"").replace(/_/g," ")],["Posted",ago(x.posted_at)],["First seen",ago(x.first_seen)],...Object.entries(x.extra||{})])||'<p class="hint">No more details yet.</p>'}
<h3>${w?"Buyer":"Seller"}</h3>${w?"":'<div id="privBox" class="hint">Loading…</div>'}
<h3>Description</h3><div id="descBox" class="hint">Loading…</div>
<h3>Price history</h3><div id="histBox" class="hint">Loading…</div>
${w?`<div class="row" style="margin-top:8px">${u?`<a class="btn pri" href="${esc(u)}" target="_blank" rel="noopener noreferrer">Open post</a>`:""}</div>`
:`<h3>Message the seller</h3><textarea class="msg" id="offerTxt" readonly aria-label="Offer message">${esc(offerText(x))}</textarea><div class="row" style="margin-top:8px"><button class="btn pri" data-act="copyopen" data-h="${esc(x.hash)}">Copy and open listing</button><button class="btn" data-act="copy">Copy message</button>${navigator.share?`<button class="btn" data-act="share" data-h="${esc(x.hash)}">Share</button>`:""}<button class="btn" data-act="bought" data-h="${esc(x.hash)}">Bought</button></div>
<div class="tr"><label for="ofSel" style="margin:0">Where this deal stands</label><select id="ofSel" data-of="${esc(x.hash)}">${OFFER_STATES.map(s=>`<option${s==o.status?" selected":""}>${s}</option>`).join("")}</select><input data-ofn="${esc(x.hash)}" placeholder="Notes, for example seller replied, meet Saturday" aria-label="Notes" value="${esc(o.note||"")}"></div>`}`}
function fillPrivate(x,P){
  const box=$("privBox"),db=$("descBox");
  if(P.none){if(box)box.textContent=P.none;if(db)db.textContent=P.none;return}
  const p=P[x.hash];
  if(box)box.innerHTML=p?sellerHtml(p):"No details were saved for this one.";
  if(db)db.innerHTML=p&&p.description?`<p style="white-space:pre-wrap;color:var(--ink)">${esc(p.description)}</p>`:(x.has_details?"This listing has no description.":"Not fetched yet. New listings get their full details a few at a time, best price first, so this one will be filled in on a later scan. Open the listing to read it now.");
  if(p&&p.meetup&&$("meetBox"))$("meetBox").innerHTML=kv([["Meet-up spot",p.meetup]]);
  document.querySelectorAll("[data-bh]").forEach(el=>{const b=P[el.dataset.bh];el.innerHTML=b?`${esc(b.seller_name||"Unknown")}${b.seller_score!=null?`, trust ${b.seller_score}`:""}${b.description?`<details><summary>Their post</summary><p style="white-space:pre-wrap">${esc(b.description)}</p></details>`:""}`:""})}
async function openSheet(h){
  const x=ALL.find(y=>y.hash==h);if(!x)return;LASTF=document.activeElement;CUR=x;
  $("sheet").innerHTML=sheetHtml(x);$("sheet").hidden=false;$("veil").hidden=false;$("sheet").scrollTop=0;document.body.style.overflow="hidden";$("sheet").setAttribute("tabindex","-1");$("sheet").focus();
  const P=await getPrivateMany([x.hash,...(x.intent==="wanted"?[]:(x.matches||[]).map(m=>m.hash).filter(Boolean))]);if(CUR!==x)return;fillPrivate(x,P);
  const hs=await getHistory(h);if(CUR!==x)return;$("histBox").innerHTML=hs.length>1?spark(hs)+`<div class="hint">${peso(hs[0])} to ${peso(hs[hs.length-1])} over ${hs.length} scans</div>`:"No price changes recorded yet."}
function closeSheet(){CUR=null;$("sheet").hidden=true;$("veil").hidden=true;document.body.style.overflow="";if(LASTF&&LASTF.focus&&document.contains(LASTF))LASTF.focus();LASTF=null}
function addTrade(item,cat,buy){TR.push({id:Date.now()+Math.floor(Math.random()*999),item,cat:cat||"Other",buy,boughtAt:new Date().toISOString(),sell:null});saveTR()}
// ---------- events ----------
document.addEventListener("click",async e=>{
  const t=e.target,act=t.closest("[data-act]");
  if(act){const a=act.dataset.act,h=act.dataset.h;
    if(a=="close")closeSheet();
    if(a=="save"){ST[h]=!ST[h];try{localStorage.setItem("mf-saved",JSON.stringify(ST))}catch(x){}render()}
    if(a=="copy"){const tx=$("offerTxt").value;try{await navigator.clipboard.writeText(tx)}catch(x){$("offerTxt").select();document.execCommand&&document.execCommand("copy")}act.textContent="Copied"}
    if(a=="bought"){const x=ALL.find(y=>y.hash==h),n=parseFloat(prompt("How much did you pay (₱)?",x.price));if(n>0){addTrade(x.title,x.category,n);act.textContent="Added to Profit"}}
    return}
  const nb=t.closest("#nav [data-v]");if(nb){VIEW=nb.dataset.v;cat="All";QS="";PLACE="";F={profit:false,fresh:false,saved:false,drops:false};closeSheet();render();scrollTo(0,0);return}
  const big=t.closest("[data-big]");if(big){$("gmain").innerHTML=`<img class="big" src="${esc(big.dataset.big)}" alt="" referrerpolicy="no-referrer">`;document.querySelectorAll(".thumbs img").forEach(i=>i.setAttribute("aria-current",i==big));return}
  const cb=t.closest("[data-cat]");if(cb){cat=cb.dataset.cat;render();return}
  const fb=t.closest("[data-f]");if(fb){F[fb.dataset.f]=!F[fb.dataset.f];render();return}
  const op=t.closest("[data-open]");if(op&&!t.closest("a")){openSheet(op.dataset.open);return}
  if(t.id=="veil"){closeSheet();return}
  const sold=t.dataset.sold,del=t.dataset.del;
  if(sold){const r=TR.find(x=>x.id==sold),p=parseFloat(prompt("Sold for (₱)?"));if(r&&p>=0){r.sell=p;r.soldAt=new Date().toISOString();saveTR();render()}return}
  if(del){if(confirm("Delete this item?")){TR=TR.filter(x=>x.id!=del);saveTR();render()}return}
  if(t.id=="tAdd"){const item=$("tItem").value.trim(),buy=parseFloat($("tBuy").value);if(!item||!(buy>0)){note("Enter the item and what you paid.");return}addTrade(item,$("tCat").value,buy);note("");render();return}
  if(t.id=="tCsv"){const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const rows=[["item","category","paid","sold_for","profit","bought_at","sold_at"],...TR.map(r=>[r.item,r.cat,r.buy,r.sell??"",r.sell==null?"":r.sell-r.buy,r.boughtAt||"",r.soldAt||""])];const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows.map(r=>r.map(q).join(",")).join("\n")],{type:"text/csv"}));a.download="market-flow-profit.csv";a.click();return}
  if(t.id=="sSave"){saveSettings();return}
  if(t.id=="scanBtn"){scanNow(t);return}
});
document.addEventListener("input",e=>{if(e.target.id=="q"){QS=e.target.value.toLowerCase();const p=e.target.selectionStart;render();const q=$("q");q.focus();q.setSelectionRange(p,p)}});
document.addEventListener("change",e=>{if(e.target.id=="sort"){SORT=e.target.value;render()}});
document.addEventListener("keydown",e=>{if(e.key=="Escape")closeSheet()});
// ---------- settings (locked behind the passcode) ----------
const pickCfg=s=>({near_km:+s.near_km||15,far_km:+s.far_km||50,haggle_pct:s.haggle_pct==null?5:+s.haggle_pct,fee_pct:s.fee_pct==null?3:+s.fee_pct});
async function unlock(p,remember,silent){
  if(DEMO){SETT={settings:{categories:["Gaming","Phones"],watch:[],groups:[],near_km:15,far_km:50,haggle_pct:5,fee_pct:3},home:{lat:15.2147,lng:120.6586,name:"Magalang"},groups:DEMO_GROUPS};PASS="demo";render();return}
  try{
    const r=await rpc("mf_get_settings",{p_pass:p});if(!r.ok)throw new Error(r.error||"Locked");
    SETT=r;PASS=p;CFG=pickCfg(r.settings||{});UNLOCK_MSG="";PRIV={};
    try{sessionStorage.setItem("mf-pass-s",p);if(remember)localStorage.setItem("mf-pass",p)}catch(e){}
  }catch(e){SETT=null;PASS="";UNLOCK_MSG=silent?"":e.message;try{sessionStorage.removeItem("mf-pass-s");localStorage.removeItem("mf-pass")}catch(x){}}
  render()}
function lockNow(){SETT=null;PASS="";PRIV={};TRIED=true;try{sessionStorage.removeItem("mf-pass-s");localStorage.removeItem("mf-pass")}catch(e){}render()}
async function saveSettings(){
  const n=id=>{const v=parseFloat($(id).value);return Number.isFinite(v)?v:null},split=(v,re)=>v.split(re).map(s=>s.trim()).filter(Boolean);
  const p={watch:split($("sWatch").value,","),categories:[...document.querySelectorAll("#sCats input:checked")].map(i=>i.value),groups:split($("sGroups").value,/[\n,]/),min_margin:n("sMargin"),min_net:n("sNet"),max_price:n("sPrice"),max_km:n("sKm"),near_km:n("sNear"),far_km:n("sFar"),haggle_pct:n("sHaggle"),fee_pct:n("sFee")};
  if(DEMO){note("Demo mode: nothing is saved.");return}
  try{const r=await rpc("mf_save_settings",{p_pass:PASS,p});if(!r.ok)throw new Error(r.error||"Not saved");SETT.settings={...SETT.settings,...p};CFG=pickCfg(SETT.settings);render();note("Settings saved. They apply on the next scan.")}catch(e){note("Could not save: "+esc(e.message))}}
async function setGroup(url,status){
  if(DEMO){const g=DEMO_GROUPS.find(x=>x.url==url);if(g)g.status=status;render();return}
  try{const r=await rpc("mf_set_group",{p_pass:PASS,p_url:url,p_status:status});if(!r.ok)throw new Error(r.error||"Not saved");await unlock(PASS)}catch(e){note("Could not update the group: "+esc(e.message))}}
async function saveHome(){
  const la=parseFloat($("hLat").value),lo=parseFloat($("hLng").value);
  if(!Number.isFinite(la)||!Number.isFinite(lo)){note("Enter a latitude and longitude, or use your current location.");return}
  if(DEMO){note("Demo mode: nothing is saved.");return}
  try{const r=await rpc("mf_save_home",{p_pass:PASS,p_lat:la,p_lng:lo,p_name:$("hName").value});if(!r.ok)throw new Error(r.error||"Not saved");SETT.home={lat:la,lng:lo,name:$("hName").value};note("Location saved. Distances use it from the next scan.")}catch(e){note("Could not save the location: "+esc(e.message))}}
function useLoc(){
  if(!navigator.geolocation){note("This browser cannot share your location. Type the coordinates instead.");return}
  navigator.geolocation.getCurrentPosition(pos=>{$("hLat").value=pos.coords.latitude.toFixed(5);$("hLng").value=pos.coords.longitude.toFixed(5);saveHome()},err=>note("Could not get your location: "+esc(err.message)),{enableHighAccuracy:true,timeout:15000})}
async function changePass(){
  const np=$("nPass").value;if(np.length<12){note("Use at least 12 characters.");return}
  if(DEMO){note("Demo mode: nothing is saved.");return}
  try{const r=await rpc("mf_change_pass",{p_pass:PASS,p_new:np});if(!r.ok)throw new Error(r.error||"Not changed");PASS=np;try{sessionStorage.setItem("mf-pass-s",np);if(localStorage.getItem("mf-pass"))localStorage.setItem("mf-pass",np)}catch(e){}$("nPass").value="";note("Passcode changed.")}catch(e){note("Could not change it: "+esc(e.message))}}
document.addEventListener("click",async e=>{
  const t=e.target;
  const z=t.closest("[data-z]");if(z){ZONES[z.dataset.z]=!ZONES[z.dataset.z];render();return}
  const gp=t.closest("[data-goplace]");if(gp){PLACE=gp.dataset.goplace||"__none";VIEW="buy";cat="All";render();scrollTo(0,0);return}
  const pl=t.closest("[data-place]");if(pl){PLACE=pl.dataset.place;render();return}
  const act=t.closest("[data-act]");
  if(act&&act.dataset.act=="copyopen"){const x=ALL.find(y=>y.hash==act.dataset.h),tx=$("offerTxt").value;try{await navigator.clipboard.writeText(tx)}catch(err){}
    if(!OF[x.hash]||OF[x.hash].status=="Not contacted")setOffer(x.hash,{status:"Messaged"});const sel=$("ofSel");if(sel)sel.value=OF[x.hash].status;
    const u=safeUrl(x.url);if(u)window.open(u,"_blank","noopener");note("Message copied. Paste it into the chat on the listing page.");return}
  if(act&&act.dataset.act=="share"){const x=ALL.find(y=>y.hash==act.dataset.h);navigator.share({title:x.title,text:$("offerTxt").value,url:safeUrl(x.url)||undefined}).catch(()=>{});return}
  const g=t.closest("[data-grp]");if(g){setGroup(g.dataset.grp,g.dataset.st);return}
  if(t.id=="uGo"){unlock($("uPass").value,$("uRem").checked);return}
  if(t.id=="lockNow"){lockNow();return}
  if(t.id=="useLoc"){useLoc();return}
  if(t.id=="saveHome"){saveHome();return}
  if(t.id=="chPass"){changePass();return}
});
document.addEventListener("change",e=>{const t=e.target;if(t.dataset&&t.dataset.of)setOffer(t.dataset.of,{status:t.value})});
document.addEventListener("input",e=>{const t=e.target;if(t.dataset&&t.dataset.ofn)setOffer(t.dataset.ofn,{note:t.value})});
document.addEventListener("keydown",e=>{const el=e.target.closest&&e.target.closest("[data-goplace]");if(el&&(e.key=="Enter"||e.key==" ")){e.preventDefault();el.click()}if(e.key=="Enter"&&e.target.id=="uPass")$("uGo").click()});
document.addEventListener("error",e=>{const t=e.target;if(t&&t.tagName==="IMG"&&t.hasAttribute("data-rm"))t.remove()},true);
function offersHtml(){const rows=Object.entries(OF).filter(([,o])=>o.status!=="Not contacted");return `<h3>Deals in progress</h3>${rows.length?rows.sort((a,b)=>String(b[1].at).localeCompare(String(a[1].at))).map(([h,o])=>{const x=ALL.find(y=>y.hash==h);return `<div class="ag"><div><b>${esc(x?x.title:"Listing")}</b><span><span class="chip ${o.status=="Bought"?"up":o.status=="Dropped"?"bad":"warn"}">${esc(o.status)}</span> ${esc(o.note||"")}</span></div>${x?`<button class="btn" data-open="${esc(h)}">Open</button>`:""}</div>`}).join(""):'<div class="empty">Messages you copy from a listing show up here, with their status.</div>'}`}
// ---------- scan now ----------
async function scanNow(b){
  const last=+(localStorage.getItem("mf-last-scan")||0);
  if(Date.now()-last<6e5){note("A scan was started less than 10 minutes ago. Please wait for it to finish.");return}
  const seg=location.pathname.split("/").filter(Boolean)[0];
  const repo=C.repo||(location.hostname.endsWith(".github.io")&&seg?location.hostname.replace(/\.github\.io$/,"")+"/"+seg:"");
  if(!repo){note('Scan now needs the repo name. Add repo: "owner/name" to docs/config.js.');return}
  let tk=null;try{tk=localStorage.getItem("mf-gh-token")}catch(x){}
  if(!tk){tk=prompt("Paste a GitHub fine-grained token for this one repo with Actions: Read and write permission. It is stored only in this browser.");if(!tk)return;tk=tk.trim();try{localStorage.setItem("mf-gh-token",tk)}catch(x){}}
  b.disabled=true;b.textContent="Starting…";
  try{
    const r=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/scan.yml/dispatches`,{method:"POST",headers:{Authorization:"Bearer "+tk,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},body:JSON.stringify({ref:"main"})});
    if(r.status!==204)throw Object.assign(new Error("HTTP "+r.status),{status:r.status});
    try{localStorage.setItem("mf-last-scan",String(Date.now()))}catch(x){}
    note("Scan started. New listings should appear in a few minutes. This page refreshes by itself.");
  }catch(err){
    if([401,403,404].includes(err.status)){try{localStorage.removeItem("mf-gh-token")}catch(x){}note("GitHub refused the token ("+esc(err.message)+"). Create a fine-grained token for this repo with Actions: Read and write, then try again.")}
    else note("Could not start the scan: "+esc(err.message));
  }finally{b.disabled=false;b.textContent="Scan now"}}
// ---------- data ----------
const DEMO_GROUPS=[{url:"https://www.facebook.com/groups/pampangabuyandsell",status:"active",score:.78,posts_seen:12,sell_ratio:.8,local_ratio:.7},{url:"https://www.facebook.com/groups/gadgetsph",status:"candidate"},{url:"https://www.facebook.com/groups/manilaelectronics",status:"rejected",score:.2,posts_seen:9,sell_ratio:.3,local_ratio:.1,reason:"mostly not for sale or not local"}];
const DEMO_ROWS=()=>{const t=m=>new Date(Date.now()-m*6e4).toISOString(),b={source:"facebook_marketplace",kind:"listing",intent:"sell",specs:[],issues:[],images:[],matches:[],defects:[],inclusions:[],extra:{},last_seen:t(2),demand:80,issue_level:0,comments:0,geo_precision:"town",has_details:true,vision_done:true};return [
{...b,hash:"d1",category:"Gaming",title:"Nintendo Switch OLED, with dock and 2 games",name:"switch oled",price:10500,sell_price:13200,sell_basis:"buyer",confidence:"A",net_profit:1200,margin_pct:11,travel_cost:60,score:84,demand:92,place:"Angeles",lat:15.15,lng:120.59,distance_km:10.8,geo_precision:"exact",condition:"good",specs:["64GB","OLED screen","Dock and charger","2 games"],issues:["Light scratch on dock"],defects:["Light scratch on dock"],inclusions:["Box","Charger","Dock","Case"],case_note:"Carrying case included",photo_notes:"Console and dock look clean; a small scratch is visible on the dock.",issue_level:1,summary:"Switch OLED in good condition with dock, charger and two games.",brand:"Nintendo",model:"OLED",color:"White",year:2022,has_receipt:true,reason:"Upgrading",delivery:"meetup",negotiable:true,extra:{"Storage":"64GB","Battery":"Good"},offer_price:9500,sell_days:3,price_drop_pct:12,first_seen:t(40),posted_at:t(40),matches:[{hash:"w1",url:"https://www.facebook.com/groups/demo/posts/1",budget:14000,area:"Mabalacat",at:t(120)}]},
{...b,hash:"d2",category:"Desktops & Parts",title:"RTX 3060 12GB, used 1 year",name:"rtx 3060",price:9000,sell_price:11800,sell_basis:"sold",confidence:"B",net_profit:1700,margin_pct:19,travel_cost:40,score:78,demand:85,place:"Magalang",lat:15.21,lng:120.66,distance_km:1.2,condition:"good",specs:["12GB GDDR6","Dual fan"],summary:"RTX 3060 12GB used for a year, never mined.",offer_price:8500,sell_days:2,first_seen:t(300),posted_at:t(300)},
{...b,hash:"d3",category:"Phones",title:"iPhone 11 128GB, battery 82%",name:"iphone 11",price:13000,sell_price:11000,sell_basis:"asking",confidence:"C",net_profit:-3100,margin_pct:-24,travel_cost:200,score:40,demand:95,place:"Clark",lat:15.19,lng:120.55,distance_km:12,condition:"fair",issues:["Battery 82%"],issue_level:1,price_note:"Listed as 13, treated as ₱13,000",listed_price:13,offer_price:8500,mismatch:true,has_details:false,vision_done:false,first_seen:t(900),posted_at:t(900)},
{...b,hash:"d4",category:"Peripherals",title:"Keychron K2 mechanical keyboard",name:"keychron k2",price:2200,sell_price:3000,sell_basis:"ai",confidence:"D",net_profit:340,margin_pct:15,travel_cost:30,score:55,demand:70,place:"San Fernando",lat:15.03,lng:120.69,distance_km:20,geo_precision:"guess",specs:["75% layout","Brown switches"],offer_price:2000,first_seen:t(2000),posted_at:t(2000)},
{...b,hash:"d5",category:"Laptops",title:"MacBook Air M1 8GB 256GB",name:"macbook air m1",price:33000,sell_price:39000,sell_basis:"sold",confidence:"B",net_profit:2200,margin_pct:7,travel_cost:340,score:62,demand:88,place:"Manila",lat:14.6,lng:120.98,distance_km:86,condition:"like new",specs:["M1","8GB RAM","256GB SSD"],offer_price:30500,first_seen:t(700),posted_at:t(700)},
{...b,hash:"d6",category:"Audio",title:"AirPods Pro 2, sealed",name:"airpods pro 2",price:7200,sell_price:9000,sell_basis:"asking",confidence:"C",net_profit:610,margin_pct:8,travel_cost:0,score:50,demand:80,place:"",distance_km:null,geo_precision:"none",offer_price:6500,first_seen:t(1500),posted_at:t(1500)},
{...b,hash:"w1",category:"Gaming",kind:"post",source:"facebook_groups",intent:"wanted",title:"WTB Nintendo Switch OLED, budget 14k",name:"switch oled",price:14000,score:70,demand:80,place:"Mabalacat",lat:15.22,lng:120.57,distance_km:9.4,url:"https://www.facebook.com/groups/demo/posts/1",first_seen:t(120),posted_at:t(120),matches:[{hash:"d1",title:"Nintendo Switch OLED, with dock and 2 games",price:10500,net:1200}]},
{...b,hash:"w2",category:"Desktops & Parts",kind:"post",source:"facebook_groups",intent:"wanted",title:"Looking for RTX 3060, up to 12k",name:"rtx 3060",price:12000,score:62,demand:75,place:"Angeles",lat:15.15,lng:120.59,distance_km:10.8,url:"https://www.facebook.com/groups/demo/posts/2",first_seen:t(500),posted_at:t(500),matches:[{hash:"d2",title:"RTX 3060 12GB, used 1 year",price:9000,net:1900}]}]};
async function loadCfg(){if(DEMO||!C.url||!C.anonKey)return;try{const c=await rpc("mf_public_config",{});if(c&&c.near_km!=null)CFG=pickCfg(c)}catch(e){}}
async function load(){
  if(DEMO){ALL=DEMO_ROWS();GONE=3;render();return}
  if(!C.url||!C.anonKey){note("Setup needed: open <b>docs/config.js</b> and paste your Supabase Project URL and anon key.");render();return}
  try{
    const since=new Date(Date.now()-48*36e5).toISOString();
    const r=await fetch(API()+"/rest/v1/listings?select=*&last_seen=gte."+encodeURIComponent(since)+"&order=score.desc&limit=600",{headers:H()});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const rows=(await r.json()).map(x=>({...x,price:num(x.price),sell_price:num(x.sell_price),net_profit:num(x.net_profit),margin_pct:num(x.margin_pct),distance_km:num(x.distance_km),sell_days:num(x.sell_days),travel_cost:num(x.travel_cost),offer_price:num(x.offer_price),lat:num(x.lat),lng:num(x.lng),price_drop_pct:num(x.price_drop_pct)||0,intent:x.intent||"sell",specs:x.specs||[],issues:x.issues||[],images:x.images||[],matches:x.matches||[],defects:x.defects||[],inclusions:x.inclusions||[],extra:x.extra||{}}));
    GONE=rows.filter(x=>x.removed_at).length;ALL=rows.filter(x=>!x.removed_at);
    if(!CUR&&!document.querySelector("#main input:focus, #main textarea:focus"))note("");render();
  }catch(e){note("Could not load data ("+esc(e.message)+"). Check the URL and anon key, and that schema.sql and the migrations were run.")}}
render();loadCfg().then(load);setInterval(()=>{if(!CUR&&VIEW!="settings"&&VIEW!="profit")load()},60000);
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
