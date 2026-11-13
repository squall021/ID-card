  function readWorkbookInWorker(buffer) {
    return new Promise(resolve => {
      let worker;
      try { worker = new Worker("app-excel-worker.js"); }
      catch { resolve(null); return; }
      const finish = result => {
        worker.terminate();
        resolve(result);
      };
      worker.onmessage = ({data}) => finish(data);
      worker.onerror = event => { event.preventDefault(); finish(null); };
      worker.onmessageerror = () => finish(null);
      try { worker.postMessage(buffer, [buffer]); }
      catch { finish(null); }
    });
  }

  async function importExcel(file){
    if (!file.size) throw new Error("Excel 檔案是空的，原名單已保留。");
    const useWorker = file.size >= 128 * 1024 && typeof Worker === "function" && location.protocol !== "file:";
    const result = useWorker ? await readWorkbookInWorker(await file.arrayBuffer()) : null;
    if (result?.error) throw new Error(result.error);
    const rows = result?.rows ?? readWorkbook(await loadLibrary("XLSX"), await file.arrayBuffer());
    state.data=rows; state.headers=rows.length?Object.keys(rows[0]):[];
    state.currentRow=0; state.fieldMap=Object.create(null);
    if (!state.headers.includes(state.print.quantityField)) state.print.quantityField = "";
    state.headers.forEach(h=>{if(!state.fields.includes(h)) state.fields.push(h);});
    invalidateDataTable();
    renderFields(); renderDataTable(); applyCurrentRecord();
    updateDataUi();
    $("#dataInfo").textContent=`已匯入 ${rows.length} 筆 / ${state.headers.length} 欄`;
    $("#drawerInfo").textContent=`共 ${rows.length} 筆資料`;
    if(state.headers.length) openFieldMapping();
  }

  function suggestTargetField(h){
    const s=String(h).toLowerCase().replace(/\s+/g,"");
    const pairs=[
      [["姓名","名字","name","fullname"],"姓名"],
      [["職稱","職務","title","position","jobtitle"],"職稱"],
      [["單位","組織","部門","organization","department","unit"],"單位"],
      [["編號","會員編號","id","idno","memberid"],"編號"],
      [["活動名稱","activity","event"],"活動名稱"]
    ];
    for(const [keys,target] of pairs){
      if(keys.some(k=>s.includes(String(k).toLowerCase()))) return target;
    }
    return "";
  }

  function openFieldMapping(){
    if(!state.headers.length) return alert("請先匯入 Excel 名單。");
    const wrap=$("#mappingRows"); wrap.innerHTML="";
    state.headers.forEach(h=>{
      const current=state.fieldMap[h]||suggestTargetField(h)||h;
      const row=document.createElement("div");
      row.className="mapping-row";
      row.innerHTML=`
        <input value="${escapeAttr(h)}" disabled>
        <div class="arrow">→</div>
        <select data-source="${escapeAttr(h)}">
          <option value="">不使用</option>
          ${state.fields.map(f=>`<option value="${escapeAttr(f)}"${f===current?" selected":""}>${escapeHtml(f)}</option>`).join("")}
          <option value="__same__"${current===h?" selected":""}>保留原欄位：${escapeHtml(h)}</option>
        </select>`;
      wrap.appendChild(row);
    });
    $("#mappingModal").classList.remove("hidden");
  }

  function confirmFieldMapping(){
    state.fieldMap=Object.create(null);
    $$("#mappingRows select").forEach(sel=>{
      let target=sel.value;
      if(!target) return;
      if(target==="__same__") target=sel.dataset.source;
      state.fieldMap[sel.dataset.source]=target;
      if(!state.fields.includes(target)) state.fields.push(target);
    });
    renderFields(); applyCurrentRecord();
    $("#mappingModal").classList.add("hidden");
    syncCurrentSideFromDom(); markDirty(); pushHistory();
  }

  function moveRecord(delta){
    if(!state.data.length) return;
    state.currentRow=(state.currentRow+delta+state.data.length)%state.data.length;
    applyCurrentRecord(); renderDataTable(); updatePreviewClone();
  }

  function searchRecord(){
    const q=$("#recordSearch").value.trim().toLowerCase();
    if(!q||!state.data.length) return;
    const idx=state.data.findIndex(row=>Object.values(row).some(v=>String(v).toLowerCase().includes(q)));
    if(idx<0) return alert("找不到符合的資料。");
    state.currentRow=idx; applyCurrentRecord(); renderDataTable(); updatePreviewClone();
  }

  function templateSnapshotObject(){
    syncCurrentSideFromDom();
    return {
      version:4,
      name:$("#templateName").value,
      width:state.mmWidth,height:state.mmHeight,
      currentSide:state.currentSide,
      fields:state.fields,
      fieldMap:state.fieldMap,
      view:state.view,
      print:state.print,
      a4:state.a4,
      sides:cloneModel(state.sides)
    };
  }

  function positiveMm(value, fallback) {
    const n = Number(value == null || value === "" ? fallback : value);
    if (!Number.isFinite(n) || n <= 0) throw new Error("識別證寬高必須為大於 0 的毫米數。");
    return n;
  }

  function nonnegativeMm(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error("邊界和間距必須是大於或等於 0 的毫米數。");
    return n;
  }

  function normalizedA4(value, fallback) {
    const config = {
      sideMode:value?.sideMode ?? fallback.sideMode,
      orientation:value?.orientation ?? fallback.orientation,
      cutLine:typeof value?.cutLine === "boolean" ? value.cutLine : fallback.cutLine
    };
    if (!["front","back","both"].includes(config.sideMode) ||
        !["portrait","landscape"].includes(config.orientation)) throw new Error("A4 輸出面或紙張方向無效。");
    for (const key of ["marginTop","marginBottom","marginLeft","marginRight","gapX","gapY"]) {
      config[key] = nonnegativeMm(value?.[key] ?? fallback[key]);
    }
    return config;
  }

  function normalizeSide(source) {
    if (source != null && (typeof source !== "object" || Array.isArray(source))) throw new Error("版型的正反面資料無效。");
    const objects = source?.objects ?? [];
    if (!Array.isArray(objects)) throw new Error("版型的圖層資料無效。");
    const background = document.createElement("div");
    setBadgeBackground(background, source?.backgroundImage);
    const ids = new Set();
    return {
      backgroundImage:background.style.backgroundImage,
      objects:objects.map(object=>{
        if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("版型的圖層資料無效。");
        const layer = Object.fromEntries(Object.entries(object).filter(([,value])=>["string","number","boolean"].includes(typeof value)));
        const el = makeLayerElement(layer);
        while (ids.has(el.dataset.id)) el.dataset.id = uid("import");
        ids.add(el.dataset.id);
        return {...el.dataset,className:el.className,style:el.getAttribute("style")||"",innerHTML:el.innerHTML};
      })
    };
  }

  function normalizeTemplate(tpl) {
    if (!tpl || typeof tpl !== "object" || Array.isArray(tpl) ||
        (!tpl.sides && !Array.isArray(tpl.objects))) throw new Error("JSON 版型檔格式錯誤。");
    const twoSides = Number(tpl.version) >= 4 && tpl.sides;
    if (twoSides && (typeof tpl.sides !== "object" || Array.isArray(tpl.sides))) throw new Error("版型的正反面資料無效。");
    const print = {
      mode:tpl.print?.mode ?? state.print.mode,
      templateCopies:Math.max(1, normalizedCopyCount(tpl.print?.templateCopies ?? state.print.templateCopies)),
      quantityField:typeof tpl.print?.quantityField === "string" ? tpl.print.quantityField : state.print.quantityField
    };
    if (!["template","rows","quantity"].includes(print.mode)) throw new Error("版型的份數設定無效。");
    const fieldMap = Object.fromEntries(Object.entries(tpl.fieldMap ?? {}).filter(([,target])=>typeof target==="string"));
    return {
      name: typeof tpl.name === "string" && tpl.name ? tpl.name : "未命名版型",
      width:positiveMm(tpl.width,90), height:positiveMm(tpl.height,54),
      fields:Array.isArray(tpl.fields) ? tpl.fields.filter(field=>typeof field==="string") : ["姓名","職稱","單位","編號","活動名稱"],
      fieldMap, view:{
        guides:typeof tpl.view?.guides === "boolean" ? tpl.view.guides : state.view.guides,
        edgeSnap:typeof tpl.view?.edgeSnap === "boolean" ? tpl.view.edgeSnap : state.view.edgeSnap
      }, print, a4:normalizedA4(tpl.a4,state.a4),
      sides:{front:normalizeSide(twoSides ? tpl.sides.front : tpl),back:normalizeSide(twoSides ? tpl.sides.back : null)},
      side:twoSides && tpl.currentSide==="back" ? "back" : "front"
    };
  }

  function restoreTemplate(tpl,fromHistory=false){
    const safe = fromHistory ? null : normalizeTemplate(tpl);
    finishPointerGesture?.();
    state.restoring=true;
    const model = safe || {...tpl, side:tpl.currentSide};
    try {
      $("#templateName").value=model.name;
      state.mmWidth=model.width; state.mmHeight=model.height;
      for (const key of ["fields","fieldMap","view","print","a4","sides"]) state[key]=model[key];
      state.currentSide=model.side;
      applyCardSize(false);
      renderFields();
      $("#toggleGuides").checked = state.view.guides !== false;
      $("#toggleEdgeSnap").checked = state.view.edgeSnap !== false;
      updateDataUi();
      renderSide(state.currentSide);
      requestAnimationFrame(fitToScreen);
    } finally {
      state.restoring=false;
    }
    if(!fromHistory) pushHistory(true);
  }

  function snapshotString(){ return JSON.stringify(templateSnapshotObject()); }
  function pushHistory(force=false){
    if(state.restoring) return;
    const snap=snapshotString();
    if(!force && state.history[state.historyIndex]===snap) return;
    state.history=state.history.slice(0,state.historyIndex+1);
    state.history.push(snap);
    if(state.history.length>60) state.history.shift();
    state.historyIndex=state.history.length-1;
    updateHistoryButtons();
  }
  function updateHistoryButtons(){
    $("#undoBtn").disabled=state.historyIndex<=0;
    $("#redoBtn").disabled=state.historyIndex<0||state.historyIndex>=state.history.length-1;
  }
  function undo(){
    finishPointerGesture?.();
    if(state.historyIndex<=0) return;
    state.historyIndex--;
    restoreTemplate(JSON.parse(state.history[state.historyIndex]),true);
    updateHistoryButtons();
  }
  function redo(){
    finishPointerGesture?.();
    if(state.historyIndex>=state.history.length-1) return;
    state.historyIndex++;
    restoreTemplate(JSON.parse(state.history[state.historyIndex]),true);
    updateHistoryButtons();
  }


  function normalizedCopyCount(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 0;
  }

  function copiesForRow(row, field) {
    return own(row,field) ? normalizedCopyCount(row[field]) : 0;
  }

  function* buildOutputJobs(records=state) {
    const {data, print, currentRow} = records;
    if (print.mode === "template") {
      const copies = Math.max(1,normalizedCopyCount(print.templateCopies));
      for (let i=1; i<=copies; i++) yield {rowIndex:data.length ? currentRow : null, copyIndex:i, copyTotal:copies};
      return;
    }
    for (let rowIndex=0; rowIndex<data.length; rowIndex++) {
      const copies = print.mode === "rows" ? 1 : copiesForRow(data[rowIndex],print.quantityField);
      for (let i=1; i<=copies; i++) yield {rowIndex,copyIndex:i,copyTotal:copies};
    }
  }

  function outputJobBaseName(job, records) {
    const {rowIndex, copyIndex, copyTotal} = job;
    const name = rowIndex == null
      ? records.name
      : getFieldValue("姓名",rowIndex,records) || getFieldValue("職稱",rowIndex,records) || `record_${rowIndex+1}`;
    const id = rowIndex == null ? "" : getFieldValue("編號",rowIndex,records);
    const base = safeFileName((id ? id+"_" : "") + name);
    return copyTotal > 1 ? `${base}_第${String(copyIndex).padStart(String(copyTotal).length,"0")}份` : base;
  }

  function estimateOutputCopies(print=state.print, data=state.data) {
    if (print.mode === "template") return Math.max(1, normalizedCopyCount(print.templateCopies));
    if (print.mode === "rows") return data.length;
    return data.reduce((total,row)=>total+copiesForRow(row,print.quantityField),0);
  }

  function updatePrintSummary() {
    const mode = state.print.mode;
    let text = "";
    if (mode === "template") {
      text = `目前版型 × ${Math.max(1, normalizedCopyCount(state.print.templateCopies || 1))} 份`;
    } else if (mode === "rows") {
      text = `Excel 每筆 1 份，共 ${state.data.length} 份`;
    } else {
      const count = estimateOutputCopies();
      text = `依「${state.print.quantityField || "未選擇"}」欄位，共 ${count} 份`;
    }
    $("#printQtySummary").textContent = text;
  }

  function populateQuantityFieldOptions() {
    const sel = $("#quantityFieldSelect");
    const headers = state.headers || [];
    sel.innerHTML = headers.length
      ? headers.map(h => `<option value="${escapeAttr(h)}">${escapeHtml(h)}</option>`).join("")
      : '<option value="">請先匯入 Excel</option>';

    if (state.print.quantityField && headers.includes(state.print.quantityField)) {
      sel.value = state.print.quantityField;
    } else {
      const suggested = headers.find(h => /份數|數量|quantity|copies|copy/i.test(h));
      if (suggested) sel.value = suggested;
      else if (headers.length) sel.value = headers[0];
    }
  }

  function previewPrintQtyModal() {
    const mode = $('input[name="printMode"]:checked')?.value || "template";
    const tempState = {
      mode,
      templateCopies: normalizedCopyCount($("#templateCopies").value || 1) || 1,
      quantityField: $("#quantityFieldSelect").value || ""
    };

    const count = estimateOutputCopies(tempState);
    $$(".mode-card").forEach(card=>card.classList.toggle("active",!!$('input[type="radio"]:checked',card)));

    $("#estimatedCopies").textContent = count;

    let note = "";
    if (mode === "template") {
      note = `目前畫面的識別證會重複輸出 ${tempState.templateCopies} 份。`;
    } else if (mode === "rows") {
      note = state.data.length
        ? `Excel 共 ${state.data.length} 筆資料，每筆輸出 1 份。`
        : "尚未匯入 Excel，因此目前預計輸出 0 份。";
    } else {
      note = state.data.length
        ? `依 Excel「${tempState.quantityField || "未選擇"}」欄位加總輸出份數；空白、0 或非數字會略過。`
        : "尚未匯入 Excel，因此目前預計輸出 0 份。";
    }
    $("#qtyPreviewNote").textContent = note;
  }

  function openPrintQtySettings() {
    populateQuantityFieldOptions();
    const radio = $(`input[name="printMode"][value="${state.print.mode || "template"}"]`);
    if (radio) radio.checked = true;
    $("#templateCopies").value = state.print.templateCopies || 1;
    if (state.print.quantityField && state.headers.includes(state.print.quantityField)) {
      $("#quantityFieldSelect").value = state.print.quantityField;
    }
    previewPrintQtyModal();
    $("#printQtyModal").classList.remove("hidden");
  }

  function savePrintQtySettings() {
    const mode = $('input[name="printMode"]:checked')?.value || "template";
    if ((mode === "rows" || mode === "quantity") && !state.data.length) {
      return alert("此模式需要先匯入 Excel 名單。");
    }
    if (mode === "quantity" && !$("#quantityFieldSelect").value) {
      return alert("請選擇 Excel 的份數欄位。");
    }

    state.print = {
      mode,
      templateCopies: Math.max(1, normalizedCopyCount($("#templateCopies").value || 1)),
      quantityField: $("#quantityFieldSelect").value || ""
    };
    $("#printQtyModal").classList.add("hidden");
    updatePrintSummary();
    markDirty();
    pushHistory();
  }

  function showBusy(text){ $("#exportBusy").textContent=text||"處理中…"; $("#exportBusy").classList.remove("hidden"); }
  function hideBusy(){ $("#exportBusy").classList.add("hidden"); }

  function snapshotForRendering() {
    finishPointerGesture?.();
    syncCurrentSideFromDom();
    return {
      name:$("#templateName").value || "識別證", mmWidth:state.mmWidth, mmHeight:state.mmHeight,
      currentSide:state.currentSide,currentRow:state.currentRow,sides:{...state.sides},
      data:state.data,fieldMap:{...state.fieldMap},print:{...state.print},a4:{...state.a4}
    };
  }

  function makeBadgeScene(side, records) {
    const scene = document.createElement("div");
    scene.className = "badge badge-scene";
    scene.style.width = `${records.mmWidth*cardPixelsPerMm}px`;
    scene.style.height = `${records.mmHeight*cardPixelsPerMm}px`;
    const model = records.sides[side];
    setBadgeBackground(scene,model.backgroundImage);
    for (const layer of model.objects) scene.appendChild(makeLayerElement(layer));
    return scene;
  }

  async function prepareImageForCapture(image) {
    if (!image.getAttribute("src")) return;
    if (typeof image.decode === "function") {
      try { await image.decode(); }
      catch { /* Some formats can render even when decode() rejects. */ }
    } else if (!image.complete) {
      await new Promise(resolve=>{
        image.addEventListener("load",resolve,{once:true});
        image.addEventListener("error",resolve,{once:true});
      });
    }
    if (!image.naturalWidth || !image.naturalHeight) return;
    const frame = image.parentElement;
    const fit = image.style.objectFit || "contain";
    if (fit === "fill") return;
    const ratio = (fit==="cover" ? Math.max : Math.min)(
      frame.clientWidth/image.naturalWidth,frame.clientHeight/image.naturalHeight);
    const width=image.naturalWidth*ratio, height=image.naturalHeight*ratio;
    Object.assign(image.style,{
      width:`${width}px`,height:`${height}px`,
      marginLeft:`${(frame.clientWidth-width)/2}px`,marginTop:`${(frame.clientHeight-height)/2}px`
    });
  }

  async function renderBadgeCanvas(side,rowIndex,records) {
    const render = await loadLibrary("html2canvas");
    const scene = makeBadgeScene(side,records);
    scene.classList.add("badge-capture");
    scene.setAttribute("aria-hidden","true");
    document.body.appendChild(scene);
    try {
      if (document.fonts) await document.fonts.ready;
      applyRecordToBadge(scene,rowIndex,records);
      await Promise.all($$(".image-content img",scene).map(prepareImageForCapture));
      const width=scene.offsetWidth, height=scene.offsetHeight;
      if (!width || !height) throw new Error("卡片尺寸過小，無法擷取。");
      // Bound bitmap allocation independently of the PDF's physical dimensions.
      const scale=Math.min(2,Math.sqrt(4995000/(width*height)),8192/Math.max(width,height));
      const canvas = await render(scene,{backgroundColor:null,scale,useCORS:false,logging:false});
      if (!canvas.width || !canvas.height) throw new Error("瀏覽器無法建立這個尺寸的圖片。");
      return canvas;
    } finally {
      scene.remove();
    }
  }

  async function captureBadgePng(side,rowIndex,records) {
    const canvas = await renderBadgeCanvas(side,rowIndex,records);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>{
      if (blob) resolve(blob);
      else reject(new Error("圖片編碼失敗，請縮小版型尺寸後再試。"));
    },"image/png"));
  }

  function cacheBadgePng(records) {
    const last = new Map();
    return (side,rowIndex)=>{
      const previous = last.get(side);
      if (previous?.rowIndex===rowIndex) return previous.png;
      const png = captureBadgePng(side,rowIndex,records);
      last.set(side,{rowIndex,png});
      return png;
    };
  }

  let exportRunning = false;
  async function runBadgeExport(batch, task) {
    if (exportRunning) return;
    exportRunning = true;
    try {
      const records = snapshotForRendering();
      const count = batch ? estimateOutputCopies(records.print,records.data) : 1;
      if (!count) throw new Error("目前輸出設定沒有可產生的識別證，請檢查 Excel 或輸出份數設定。");
      showBusy("正在準備匯出…");
      await task(records,count);
    } catch (error) {
      alert(error.message || "匯出失敗，請再試一次。");
    } finally {
      hideBusy();
      exportRunning = false;
    }
  }

  async function exportCurrentPng() {
    await runBadgeExport(false,async records=>{
      const {currentSide:side,currentRow:row} = records;
      const id = getFieldValue("編號",row,records);
      const name = getFieldValue("姓名",row,records) || `record_${row+1}`;
      const base = safeFileName((id ? id+"_" : "") + name);
      showBusy(`正在輸出${sideLabel(side)} PNG…`);
      downloadBlob(await captureBadgePng(side,row,records),`${base}_${sideLabel(side)}.png`);
    });
  }

  async function exportAllZip() {
    await runBadgeExport(true,async (records,count)=>{
      const Zip = await loadLibrary("JSZip");
      const zip=new Zip(), used=new Set(), capture=cacheBadgePng(records);
      let position=0;
      for (const job of buildOutputJobs(records)) {
        position++;
        const base = outputJobBaseName(job,records);
        let unique = base, suffix = 2;
        while (used.has(unique.toLowerCase())) unique = `${base}_${suffix++}`;
        used.add(unique.toLowerCase());
        for (const side of ["front","back"]) {
          showBusy(`正在產生 ${position}/${count} ${sideLabel(side)}`);
          zip.file(`${unique}_${sideLabel(side)}.png`,await capture(side,job.rowIndex));
        }
      }
      downloadBlob(await zip.generateAsync({type:"blob"}),`${safeFileName(records.name)}_正反面_PNG.zip`);
    });
  }

  function badgeImageAlias(side,rowIndex) {
    return `${side}_${rowIndex ?? "template"}`;
  }

  async function exportPdf() {
    await runBadgeExport(true,async (records,count)=>{
      const {jsPDF}=await loadLibrary("jspdf");
      const {mmWidth:w,mmHeight:h}=records;
      const orientation=w>=h?"landscape":"portrait";
      const pdf=new jsPDF({orientation,unit:"mm",format:[w,h]});
      if (Math.abs(pdf.internal.pageSize.getWidth()-w)>.01 || Math.abs(pdf.internal.pageSize.getHeight()-h)>.01) {
        throw new Error("目前尺寸超過 PDF 可支援的紙張大小。");
      }
      const capture=cacheBadgePng(records);
      let position=0, page=0;
      for (const job of buildOutputJobs(records)) {
        position++;
        for (const side of ["front","back"]) {
          showBusy(`正在產生 PDF ${position}/${count} ${sideLabel(side)}`);
          const png = await capture(side,job.rowIndex);
          if (page++) pdf.addPage([w,h],orientation);
          pdf.addImage(new Uint8Array(await png.arrayBuffer()),"PNG",0,0,w,h,badgeImageAlias(side,job.rowIndex));
        }
      }
      downloadBlob(pdf.output("blob"),`${safeFileName(records.name)}_正反面.pdf`);
    });
  }

  function a4Layout(records) {
    const cfg=records.a4, portrait=cfg.orientation==="portrait";
    const pageW=portrait?210:297,pageH=portrait?297:210;
    const availW=pageW-cfg.marginLeft-cfg.marginRight;
    const availH=pageH-cfg.marginTop-cfg.marginBottom;
    const cols=Math.floor((availW+cfg.gapX)/(records.mmWidth+cfg.gapX)+1e-9);
    const rows=Math.floor((availH+cfg.gapY)/(records.mmHeight+cfg.gapY)+1e-9);
    if(cols<1||rows<1) throw new Error("目前版型尺寸與邊界設定無法排入 A4。");
    return {cols,perPage:cols*rows};
  }

  async function buildA4Pdf(side,records,count,jsPDF) {
    const cfg=records.a4, {mmWidth:w,mmHeight:h}=records;
    const {cols,perPage}=a4Layout(records);
    const pdf=new jsPDF({orientation:cfg.orientation,unit:"mm",format:"a4"});
    const capture=cacheBadgePng(records);
    let j=0;
    for (const job of buildOutputJobs(records)) {
      if(j>0 && j%perPage===0) pdf.addPage();
      showBusy(`A4 ${sideLabel(side)} ${j+1}/${count}`);
      const png=await capture(side,job.rowIndex);
      const slot=j%perPage, r=Math.floor(slot/cols), c=slot%cols;
      const x=cfg.marginLeft+c*(w+cfg.gapX);
      const y=cfg.marginTop+r*(h+cfg.gapY);
      pdf.addImage(new Uint8Array(await png.arrayBuffer()),"PNG",x,y,w,h,badgeImageAlias(side,job.rowIndex));
      if(cfg.cutLine){
        pdf.setDrawColor(170);
        pdf.rect(x,y,w,h);
      }
      j++;
    }
    return pdf;
  }

