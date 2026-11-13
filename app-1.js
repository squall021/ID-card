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

  function cloneModel(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  const state = {
    zoom:1,
    fitMode:true,
    mmWidth:90,
    mmHeight:54,
    selectedId:null,
    currentSide:"front",
    previewSide:"front",
    sides:{
      front: cloneModel(defaultFront),
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
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const cardPixelsPerMm = 10;
  const libraryPaths = {
    XLSX: "vendor/xlsx-0.20.3.full.min.js",
    html2canvas: "vendor/html2canvas-1.4.1.min.js",
    jspdf: "vendor/jspdf-4.2.1.umd.min.js",
    JSZip: "vendor/jszip-3.10.1.min.js"
  };
  const libraryLoads = new Map();

  function loadLibrary(name) {
    if (window[name]) return Promise.resolve(window[name]);
    if (libraryLoads.has(name)) return libraryLoads.get(name);
    const load = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const failed = () => {
        script.remove();
        reject(new Error(`${name} 載入失敗，請確認網站檔案完整後再試。`));
      };
      script.src = libraryPaths[name];
      script.onload = () => window[name] ? resolve(window[name]) : failed();
      script.onerror = failed;
      document.head.appendChild(script);
    }).catch(error => {
      libraryLoads.delete(name);
      throw error;
    });
    libraryLoads.set(name, load);
    return load;
  }

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
    a.hidden = true;
    document.body.appendChild(a);
    try { a.click(); }
    finally {
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }
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
    badge.style.width=`${state.mmWidth*cardPixelsPerMm}px`;
    badge.style.height=`${state.mmHeight*cardPixelsPerMm}px`;
    $("#cardWidth").value=state.mmWidth;
    $("#cardHeight").value=state.mmHeight;
    refreshAllAutoShrink();
    if(refit && state.fitMode) requestAnimationFrame(fitToScreen);
    else applyZoom();
  }

  function applyZoom(){
    finishPointerGesture?.();
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

  function applyDragSnapping(l,t,w,h,zoom,cardW,cardH){
    const thresholdPx = 8;
    const thresholdX = thresholdPx / zoom / cardW * 100;
    const thresholdY = thresholdPx / zoom / cardH * 100;

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

  let finishPointerGesture = null;

  function trackPointer(event, handle, update) {
    finishPointerGesture?.();
    const { pointerId } = event;
    let frame = 0, pending = null, changed = false;

    function applyPending() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!pending) return;
      update(pending);
      pending = null;
      changed = true;
    }

    function move(next) {
      if (next.pointerId !== pointerId) return;
      pending = next;
      if (!frame) frame = requestAnimationFrame(applyPending);
    }

    function finish(next) {
      if (next?.pointerId != null && next.pointerId !== pointerId) return;
      finishPointerGesture = null;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      window.removeEventListener("blur", finish);
      applyPending();
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      hideAlignmentGuides();
      if (changed) { markDirty(); pushHistory(); }
    }

    finishPointerGesture = finish;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    window.addEventListener("blur", finish);
    try { handle.setPointerCapture?.(pointerId); }
    catch { /* The document listeners also cover browsers that cannot capture this pointer. */ }
  }

  function resizeAxis(offset, size, delta, near, far, minimum) {
    if (near) {
      const edge = Math.min(100, offset + size);
      const next = Math.max(0, Math.min(edge - minimum, offset + delta));
      return [next, edge - next];
    }
    return [offset, far ? Math.min(100 - offset, Math.max(minimum, size + delta)) : size];
  }

  function updateGeometryFields(el) {
    const width=badge.clientWidth,height=badge.clientHeight;
    $("#propX").value = pct(el.style.left,width).toFixed(1);
    $("#propY").value = pct(el.style.top,height).toFixed(1);
    $("#propW").value = pct(el.style.width,width).toFixed(1);
    $("#propH").value = pct(el.style.height,height).toFixed(1);
  }

  function beginResize(e,el,pos){
    if(isLocked(el) || e.button !== 0 || e.isPrimary === false) return;
    hideAlignmentGuides();
    e.preventDefault(); e.stopPropagation();
    const {clientX:startX, clientY:startY} = e;
    const cardW = badge.clientWidth, cardH = badge.clientHeight, zoom = state.zoom;
    const start = {
      l:pct(el.style.left,cardW), t:pct(el.style.top,cardH),
      w:pct(el.style.width,cardW), h:pct(el.style.height,cardH)
    };
    const minW = Math.max(2.5, 2400/cardW), minH = Math.max(2.5, 1800/cardH);
    trackPointer(e, e.currentTarget, ev => {
      const dx = (ev.clientX-startX)/zoom/cardW*100;
      const dy = (ev.clientY-startY)/zoom/cardH*100;
      const [l,w] = resizeAxis(start.l,start.w,dx,pos.includes("w"),pos.includes("e"),minW);
      const [t,h] = resizeAxis(start.t,start.h,dy,pos.includes("n"),pos.includes("s"),minH);
      el.style.left=`${l}%`; el.style.top=`${t}%`;
      el.style.width=`${w}%`; el.style.height=`${h}%`;
      if(el.dataset.type==="qr") renderQr(el);
      if(el.dataset.type==="text") {
        autoShrink(el);
        $("#propFontSize").value = parseFloat(el.style.fontSize) || 16;
      }
      updateGeometryFields(el);
    });
  }

  function makeInteractive(el){
    el.addEventListener("pointerdown",e=>{
      if(e.target.classList.contains("resize-handle") || e.button!==0 || e.isPrimary===false) return;
      selectObject(el);
      if(isLocked(el)) return;
      e.preventDefault();
      const {clientX:startX, clientY:startY} = e;
      const cardW = badge.clientWidth, cardH = badge.clientHeight, zoom = state.zoom;
      const startL = pct(el.style.left,cardW), startT = pct(el.style.top,cardH);
      const w = Math.max(pct(el.style.width,cardW), 2400/cardW);
      const h = Math.max(pct(el.style.height,cardH), 1800/cardH);
      hideAlignmentGuides();
      trackPointer(e, el, ev => {
        const dx=(ev.clientX-startX)/zoom/cardW*100;
        const dy=(ev.clientY-startY)/zoom/cardH*100;
        const l=Math.max(0,Math.min(100-w,startL+dx));
        const t=Math.max(0,Math.min(100-h,startT+dy));
        const snapped=applyDragSnapping(l,t,w,h,zoom,cardW,cardH);
        el.style.left=`${Math.max(0,Math.min(100-w,snapped.l))}%`;
        el.style.top=`${Math.max(0,Math.min(100-h,snapped.t))}%`;
        $("#propX").value = parseFloat(el.style.left).toFixed(1);
        $("#propY").value = parseFloat(el.style.top).toFixed(1);
      });
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
    return $$(".design-object",badge).map(el=>{
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
  }

  function syncCurrentSideFromDom(){
    state.sides[state.currentSide]={
      backgroundImage:badge.style.backgroundImage||"",
      objects:serializeDomObjects()
    };
  }

  const layerStyleNames = ["left", "top", "width", "height", "font-size", "text-align",
    "justify-content", "letter-spacing", "line-height", "font-weight", "font-family",
    "color", "opacity", "z-index"];
  const imageFits = ["contain", "cover", "fill"];

  function imageDataUrl(value) {
    return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]*$/i.test(value)
      ? value : "";
  }

  function setBadgeBackground(root, value) {
    const url = typeof value === "string" && value.match(/^url\(["']?(data:image\/[^"')]+)["']?\)$/i);
    const safe = url && imageDataUrl(url[1]);
    root.style.backgroundImage = safe ? `url("${safe}")` : "";
  }

  function makeImageContent(src, fit="contain") {
    const content = document.createElement("div");
    content.className = "object-content image-content";
    const image = document.createElement("img");
    image.alt = "";
    image.style.objectFit = imageFits.includes(fit) ? fit : "contain";
    if (src) image.src = src;
    content.appendChild(image);
    return content;
  }

  function makeLayerContent(o) {
    const type = o.type || "text";
    // Legacy templates store markup. Parse it in an inert fragment and copy only the known values.
    const fragment = document.createElement("template");
    fragment.innerHTML = typeof o.innerHTML === "string" ? o.innerHTML : "";
    if (type === "image") {
      const img = fragment.content.querySelector("img");
      return makeImageContent(imageDataUrl(img?.getAttribute("src")), img?.style.objectFit);
    }
    const content = document.createElement("div");
    content.className = `object-content ${type}-content`;
    const previous = fragment.content.querySelector(`.${type}-content`);
    if (type === "text") content.textContent = previous?.textContent ?? fragment.content.textContent;
    if (type === "box" && previous) content.style.backgroundColor = previous.style.backgroundColor;
    return content;
  }

  function makeLayerElement(o) {
    const el = document.createElement("div");
    const type = ["text", "image", "box", "qr"].includes(o.type) ? o.type : "text";
    el.className = `design-object ${type}-object`;
    for (const key of ["id", "name", "field", "locked", "hidden", "autoShrink", "maxFont", "minFont", "qrContent", "qrField"]) {
      el.dataset[key] = o[key] ?? "";
    }
    el.dataset.id ||= uid();
    el.dataset.type = type;
    const legacyStyle = document.createElement("div").style;
    legacyStyle.cssText = typeof o.style === "string" ? o.style : "";
    for (const prop of layerStyleNames) el.style.setProperty(prop, legacyStyle.getPropertyValue(prop));
    el.style.visibility = el.dataset.hidden === "1" ? "hidden" : "visible";
    el.classList.toggle("locked", el.dataset.locked === "1");
    el.classList.toggle("dynamic", type === "text" && !!el.dataset.field);
    el.appendChild(makeLayerContent({...o, type}));
    return el;
  }

  function renderSide(side){
    state.currentSide=side;
    state.selectedId=null;
    const model=state.sides[side]||{backgroundImage:"",objects:[]};
    setBadgeBackground(badge, model.backgroundImage);
    $$(".design-object",badge).forEach(o=>o.remove());
    for (const object of model.objects) {
      const el = makeLayerElement(object);
      badge.appendChild(el);
      makeInteractive(el);
    }

    updateSideUi();
    selectObject(null);
    applyCurrentRecord();
  }

  function switchSide(side,{history=false}={}){
    if(side===state.currentSide) return;
    finishPointerGesture?.();
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

