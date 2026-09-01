  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  const defaultFront = {
    backgroundImage: "",
    objects: [
      {
        id:"activity", type:"text", name:"活動名稱", field:"", locked:"0", hidden:"0",
        autoShrink:"1", maxFont:"18", minFont:"10",
        className:"design-object text-object",
        style:"left:10%;top:12%;width:80%;height:12%;font-size:18px;text-align:center;justify-content:center;",
        innerHTML:'<div class="object-content text-content">2026 年研習活動</div>'
      },
      {
        id:"name", type:"text", name:"姓名", field:"姓名", locked:"0", hidden:"0",
        autoShrink:"1", maxFont:"30", minFont:"14",
        className:"design-object text-object dynamic",
        style:"left:15%;top:43%;width:70%;height:16%;font-size:30px;text-align:center;justify-content:center;font-weight:700;",
        innerHTML:'<div class="object-content text-content">王小明</div>'
      },
      {
        id:"title", type:"text", name:"職稱", field:"職稱", locked:"0", hidden:"0",
        autoShrink:"1", maxFont:"16", minFont:"10",
        className:"design-object text-object dynamic",
        style:"left:20%;top:62%;width:60%;height:10%;font-size:16px;text-align:center;justify-content:center;",
        innerHTML:'<div class="object-content text-content">職稱</div>'
      },
      {
        id:"unit", type:"text", name:"單位", field:"單位", locked:"0", hidden:"0",
        autoShrink:"1", maxFont:"14", minFont:"9",
        className:"design-object text-object dynamic",
        style:"left:10%;top:76%;width:80%;height:9%;font-size:14px;text-align:center;justify-content:center;",
        innerHTML:'<div class="object-content text-content">單位</div>'
      }
    ]
  };

  const state = {
    zoom:1,
    fitMode:true,
    mmWidth:90,
    mmHeight:54,
    selectedId:null,
    currentSide:"front",
    previewSide:"front",
    sides:{
      front: structuredClone(defaultFront),
      back:{backgroundImage:"",objects:[]}
    },
    data:[],
    headers:[],
    currentRow:0,
    fields:["姓名","職稱","單位","編號","活動名稱"],
    fieldMap:{},
    objectCounter:0,
    history:[],
    historyIndex:-1,
    restoring:false,
    view:{
      guides:true,
      edgeSnap:true
    },
    print:{
      mode:"template",
      templateCopies:1,
      quantityField:""
    },
    a4:{
      sideMode:"front",
      orientation:"portrait",
      marginTop:10, marginBottom:10, marginLeft:10, marginRight:10,
      gapX:4, gapY:4, cutLine:true
    }
  };

  const badge = $("#badge");
  const scaleBox = $("#badgeScaleBox");
  const workspace = $(".workspace");
  const stageScroll = $("#stageScroll");

  const uid = (prefix="obj") => `${prefix}_${Date.now()}_${++state.objectCounter}`;
  const sideLabel = side => side==="front" ? "正面" : "背面";

  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  const escapeAttr = escapeHtml;
  function safeFileName(s){
    return String(s||"file").replace(/[\\/:*?"<>|]+/g,"_").trim()||"file";
  }
  function rgbToHex(rgb){
    if(!rgb) return "#222222";
    if(rgb.startsWith("#")) return rgb;
    const m=rgb.match(/\d+/g);
    if(!m) return "#222222";
    return "#"+m.slice(0,3).map(n=>Number(n).toString(16).padStart(2,"0")).join("");
  }
  function fileToDataURL(file){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=reject;
      r.readAsDataURL(file);
    });
  }
  function downloadBlob(blob,filename){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function markDirty(){ $("#saveStatus").textContent="尚未儲存"; }
  function objectContent(el){ return $(".object-content",el); }
  function textContentEl(el){ return $(".text-content",el); }
  function isLocked(el){ return el.dataset.locked==="1"; }

  function setupTabs(){
    $$(".ribbon-tab").forEach(btn=>btn.addEventListener("click",()=>{
      $$(".ribbon-tab").forEach(b=>b.classList.remove("active"));
      $$(".ribbon-panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      $(`.ribbon-panel[data-panel="${btn.dataset.tab}"]`).classList.add("active");
    }));
    $$(".panel-tab").forEach(btn=>btn.addEventListener("click",()=>{
      $$(".panel-tab").forEach(b=>b.classList.remove("active"));
      $$(".side-content").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      $(`.side-content[data-side-content="${btn.dataset.side}"]`).classList.add("active");
    }));
  }

  function applyCardSize(refit=true){
    const base=10;
    badge.style.width=`${state.mmWidth*base}px`;
    badge.style.height=`${state.mmHeight*base}px`;
    $("#cardWidth").value=state.mmWidth;
    $("#cardHeight").value=state.mmHeight;
    if(refit && state.fitMode) requestAnimationFrame(fitToScreen);
    else applyZoom();
  }

  function applyZoom(){
    badge.style.transform=`scale(${state.zoom})`;
    scaleBox.style.width=`${badge.offsetWidth*state.zoom}px`;
    scaleBox.style.height=`${badge.offsetHeight*state.zoom}px`;
    $("#zoomLabel").textContent=`${Math.round(state.zoom*100)}%`;
  }

  function setZoom(z,fit=false){
    state.fitMode=fit;
    state.zoom=Math.max(.25,Math.min(2.5,z));
    applyZoom();
  }

  function fitToScreen(){
    const w=stageScroll.clientWidth;
    const h=stageScroll.clientHeight;
    if(!w||!h||!badge.offsetWidth||!badge.offsetHeight) return;
    const pad=52;
    const z=Math.min((w-pad)/badge.offsetWidth,(h-pad)/badge.offsetHeight,1.35);
    setZoom(Math.max(.25,z),true);
  }

  function objectName(el){
    return el.dataset.name || el.dataset.field || ({
      text:"文字",image:"圖片",box:"色塊",qr:"QR Code"
    }[el.dataset.type]||"物件");
  }

  function clearResizeHandles(){
    $$(".resize-handle",badge).forEach(h=>h.remove());
  }
  function ensureResizeHandles(el){
    clearResizeHandles();
    if(isLocked(el)) return;
    ["nw","n","ne","e","se","s","sw","w"].forEach(pos=>{
      const h=document.createElement("span");
      h.className=`resize-handle ${pos}`;
      h.dataset.resize=pos;
      h.addEventListener("pointerdown",e=>beginResize(e,el,pos));
      el.appendChild(h);
    });
  }

  function selectObject(el,scrollLayer=true){
    $$(".design-object",badge).forEach(o=>o.classList.remove("selected"));
    clearResizeHandles();
    if(!el){
      state.selectedId=null;
      $("#propertyEditor").classList.add("hidden");
      $("#noSelection").classList.remove("hidden");
      renderLayers();
      return;
    }
    el.classList.add("selected");
    state.selectedId=el.dataset.id;
    ensureResizeHandles(el);
    $("#propertyEditor").classList.remove("hidden");
    $("#noSelection").classList.add("hidden");
    populateProperties(el);
    renderLayers();
    if(scrollLayer){
      requestAnimationFrame(()=>{
        const row=$(`.layer-item[data-layer-id="${CSS.escape(el.dataset.id)}"]`);
        row?.scrollIntoView({block:"nearest"});
      });
    }
  }
  function selectedObject(){
    return state.selectedId ? $(`.design-object[data-id="${CSS.escape(state.selectedId)}"]`,badge) : null;
  }

  function pct(v,base){
    if((v||"").includes("%")) return parseFloat(v);
    const n=parseFloat(v||0);
    return base ? n/base*100 : n;
  }


  function hideAlignmentGuides(){
    $("#guideV")?.classList.remove("show");
    $("#guideH")?.classList.remove("show");
    ["Top","Right","Bottom","Left"].forEach(s => $("#snapEdge"+s)?.classList.remove("show"));
  }

  function applyDragSnapping(l, t, w, h){
    const thresholdPx = 8;
    const thresholdX = thresholdPx / state.zoom / badge.clientWidth * 100;
    const thresholdY = thresholdPx / state.zoom / badge.clientHeight * 100;

    let snappedV = false, snappedH = false;
    let edgeTop = false, edgeRight = false, edgeBottom = false, edgeLeft = false;

    if(state.view.edgeSnap){
      if(Math.abs(l) <= thresholdX){
        l = 0; edgeLeft = true;
      }else if(Math.abs(100 - (l + w)) <= thresholdX){
        l = 100 - w; edgeRight = true;
      }

      if(Math.abs(t) <= thresholdY){
        t = 0; edgeTop = true;
      }else if(Math.abs(100 - (t + h)) <= thresholdY){
        t = 100 - h; edgeBottom = true;
      }
    }

    if(state.view.guides){
      const cx = l + w / 2;
      const cy = t + h / 2;

      if(Math.abs(cx - 50) <= thresholdX){
        l = 50 - w / 2;
        snappedV = true;
      }
      if(Math.abs(cy - 50) <= thresholdY){
        t = 50 - h / 2;
        snappedH = true;
      }
    }

    $("#guideV")?.classList.toggle("show", snappedV);
    $("#guideH")?.classList.toggle("show", snappedH);
    $("#snapEdgeTop")?.classList.toggle("show", edgeTop);
    $("#snapEdgeRight")?.classList.toggle("show", edgeRight);
    $("#snapEdgeBottom")?.classList.toggle("show", edgeBottom);
    $("#snapEdgeLeft")?.classList.toggle("show", edgeLeft);

    return {l,t};
  }

  function beginResize(e,el,pos){
    if(isLocked(el)) return;
    hideAlignmentGuides();
    e.preventDefault(); e.stopPropagation();
    const startX=e.clientX,startY=e.clientY;
    const start={
      l:pct(el.style.left,badge.clientWidth),
      t:pct(el.style.top,badge.clientHeight),
      w:pct(el.style.width,badge.clientWidth),
      h:pct(el.style.height,badge.clientHeight)
    };
    const minW=2.5,minH=2.5;
    const move=ev=>{
      const dx=(ev.clientX-startX)/state.zoom/badge.clientWidth*100;
      const dy=(ev.clientY-startY)/state.zoom/badge.clientHeight*100;
      let {l,t,w,h}=start;
      if(pos.includes("e")) w=Math.max(minW,start.w+dx);
      if(pos.includes("s")) h=Math.max(minH,start.h+dy);
      if(pos.includes("w")){ w=Math.max(minW,start.w-dx); l=start.l+dx; }
      if(pos.includes("n")){ h=Math.max(minH,start.h-dy); t=start.t+dy; }
      if(l<0){ w+=l; l=0; }
      if(t<0){ h+=t; t=0; }
      if(l+w>100) w=100-l;
      if(t+h>100) h=100-t;
      el.style.left=`${l}%`; el.style.top=`${t}%`;
      el.style.width=`${w}%`; el.style.height=`${h}%`;
      if(el.dataset.type==="qr") renderQr(el);
      if(el.dataset.type==="text") autoShrink(el);
      populateProperties(el);
    };
    const up=()=>{
      document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerup",up);
      hideAlignmentGuides();
      syncCurrentSideFromDom();
      markDirty(); pushHistory();
    };
    document.addEventListener("pointermove",move);
    document.addEventListener("pointerup",up,{once:true});
  }

  function makeInteractive(el){
    el.addEventListener("pointerdown",e=>{
      if(e.target.classList.contains("resize-handle")) return;
      selectObject(el);
      if(isLocked(el)||e.button!==0) return;
      e.preventDefault();
      const startX=e.clientX,startY=e.clientY;
      const startL=pct(el.style.left,badge.clientWidth);
      const startT=pct(el.style.top,badge.clientHeight);
      const w=pct(el.style.width,badge.clientWidth);
      const h=pct(el.style.height,badge.clientHeight);
      hideAlignmentGuides();
      const move=ev=>{
        const dx=(ev.clientX-startX)/state.zoom/badge.clientWidth*100;
        const dy=(ev.clientY-startY)/state.zoom/badge.clientHeight*100;

        let l=Math.max(0,Math.min(100-w,startL+dx));
        let t=Math.max(0,Math.min(100-h,startT+dy));
        const snapped=applyDragSnapping(l,t,w,h);
        l=Math.max(0,Math.min(100-w,snapped.l));
        t=Math.max(0,Math.min(100-h,snapped.t));

        el.style.left=`${l}%`;
        el.style.top=`${t}%`;
        populateProperties(el);
      };
      const up=()=>{
        document.removeEventListener("pointermove",move);
        document.removeEventListener("pointerup",up);
        hideAlignmentGuides();
        syncCurrentSideFromDom();
        markDirty(); pushHistory();
      };
      document.addEventListener("pointermove",move);
      document.addEventListener("pointerup",up,{once:true});
    });

    el.addEventListener("dblclick",()=>{
      if(el.dataset.type!=="text"||isLocked(el)) return;
      const c=textContentEl(el);
      const val=prompt("修改文字內容：",c?.textContent||"");
      if(val!==null){
        el.dataset.field="";
        el.classList.remove("dynamic");
        if(c) c.textContent=val;
        autoShrink(el);
        selectObject(el);
        syncCurrentSideFromDom();
        markDirty(); pushHistory();
      }
    });
  }

  function serializeDomObjects(){
    const selected=state.selectedId;
    clearResizeHandles();
    $$(".design-object",badge).forEach(o=>o.classList.remove("selected"));
    const objects=$$(".design-object",badge).map(el=>{
      const clone=el.cloneNode(true);
      clone.querySelectorAll(".resize-handle").forEach(h=>h.remove());
      if(el.dataset.type==="qr"){
        const q=$(".qr-content",clone);
        if(q) q.innerHTML="";
      }
      return {
        id:el.dataset.id,type:el.dataset.type,name:el.dataset.name||"",
        field:el.dataset.field||"",locked:el.dataset.locked||"0",
        hidden:el.dataset.hidden||"0",autoShrink:el.dataset.autoShrink||"0",
        maxFont:el.dataset.maxFont||"",minFont:el.dataset.minFont||"",
        qrContent:el.dataset.qrContent||"",qrField:el.dataset.qrField||"",
        className:el.className.replace(" selected",""),
        style:el.getAttribute("style")||"",
        innerHTML:clone.innerHTML
      };
    });
    if(selected){
      const el=$(`.design-object[data-id="${CSS.escape(selected)}"]`,badge);
      if(el) selectObject(el,false);
    }
    return objects;
  }

  function syncCurrentSideFromDom(){
    state.sides[state.currentSide]={
      backgroundImage:badge.style.backgroundImage||"",
      objects:serializeDomObjects()
    };
  }

  function renderSide(side){
    state.currentSide=side;
    state.selectedId=null;
    const model=state.sides[side]||{backgroundImage:"",objects:[]};
    badge.style.backgroundImage=model.backgroundImage||"";
    $$(".design-object",badge).forEach(o=>o.remove());

    (model.objects||[]).forEach(o=>{
      const el=document.createElement("div");
      el.className=o.className||"design-object";
      el.dataset.id=o.id||uid();
      el.dataset.type=o.type||"text";
      el.dataset.name=o.name||"";
      el.dataset.field=o.field||"";
      el.dataset.locked=o.locked||"0";
      el.dataset.hidden=o.hidden||"0";
      el.dataset.autoShrink=o.autoShrink||"0";
      el.dataset.maxFont=o.maxFont||"";
      el.dataset.minFont=o.minFont||"";
      el.dataset.qrContent=o.qrContent||"";
      el.dataset.qrField=o.qrField||"";
      el.setAttribute("style",o.style||"");
      el.innerHTML=o.innerHTML||"";
      el.style.visibility=el.dataset.hidden==="1"?"hidden":"visible";
      el.classList.toggle("locked",el.dataset.locked==="1");
      badge.appendChild(el);
      makeInteractive(el);
      if(el.dataset.type==="qr") renderQr(el);
    });

    updateSideUi();
    renderLayers();
    selectObject(null);
    applyCurrentRecord();
  }

  function switchSide(side,{history=false}={}){
    if(side===state.currentSide) return;
    syncCurrentSideFromDom();
    renderSide(side);
    if(history) pushHistory();
  }

  function updateSideUi(){
    $$(".side-btn").forEach(b=>b.classList.toggle("active",b.dataset.cardSide===state.currentSide));
    $("#layerSideLabel").textContent=sideLabel(state.currentSide);
  }

  function renderLayers(){
    const list=$("#layerList");
    list.innerHTML="";
    [...$$(".design-object",badge)].reverse().forEach(el=>{
      const row=document.createElement("div");
      row.className="layer-item"+(state.selectedId===el.dataset.id?" active":"");
      row.dataset.layerId=el.dataset.id;
      const visible=el.dataset.hidden!=="1";
      const locked=isLocked(el);
      row.innerHTML=`
        <div class="layer-left">
          <span>${el.dataset.type==="image"?"🖼":el.dataset.type==="box"?"▰":el.dataset.type==="qr"?"▦":"T"}</span>
          <span class="layer-name">${escapeHtml(objectName(el))}</span>
        </div>
        <div class="layer-actions">
          <button class="icon-btn eye" title="顯示/隱藏">${visible?"👁":"◌"}</button>
          <button class="icon-btn lock" title="鎖定/解鎖">${locked?"🔒":"🔓"}</button>
          <button class="icon-btn select" title="選取">↗</button>
          <button class="icon-btn danger remove" title="刪除">✕</button>
        </div>`;
      row.querySelector(".select").addEventListener("click",e=>{
        e.stopPropagation(); selectObject(el,false);
      });
      row.addEventListener("click",e=>{
        if(e.target.closest("button")) return;
        selectObject(el,false);
      });
      row.querySelector(".eye").addEventListener("click",e=>{
        e.stopPropagation();
        const hidden=el.dataset.hidden==="1";
        el.dataset.hidden=hidden?"0":"1";
        el.style.visibility=hidden?"visible":"hidden";
        syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
      });
      row.querySelector(".lock").addEventListener("click",e=>{
        e.stopPropagation();
        el.dataset.locked=locked?"0":"1";
        el.classList.toggle("locked",!locked);
        if(state.selectedId===el.dataset.id) selectObject(el);
        syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
      });
      row.querySelector(".remove").addEventListener("click",e=>{
        e.stopPropagation(); deleteObject(el);
      });
      list.appendChild(row);
    });
  }

