  async function importExcel(file){
    if(!window.XLSX) return alert("SheetJS 尚未載入，請確認網路連線。");
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:"array"});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
    state.data=rows; state.headers=rows.length?Object.keys(rows[0]):[];
    state.currentRow=0; state.fieldMap={};
    state.headers.forEach(h=>{if(!state.fields.includes(h)) state.fields.push(h);});
    renderFields(); renderDataTable(); applyCurrentRecord();
    updateDataUi();
    $("#dataInfo").textContent=`已匯入 ${rows.length} 筆 / ${state.headers.length} 欄`;
    $("#drawerInfo").textContent=`共 ${rows.length} 筆資料`;
    openFieldMapping();
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
    state.fieldMap={};
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
      sides:structuredClone(state.sides)
    };
  }

  function restoreTemplate(tpl,fromHistory=false){
    state.restoring=true;
    $("#templateName").value=tpl.name||"未命名版型";
    state.mmWidth=Number(tpl.width||90); state.mmHeight=Number(tpl.height||54);
    state.fields=Array.isArray(tpl.fields)?tpl.fields:["姓名","職稱","單位","編號","活動名稱"];
    state.fieldMap=tpl.fieldMap||{};
    state.view={...state.view,...(tpl.view||{})};
    state.print={...state.print,...(tpl.print||{})};
    state.a4={...state.a4,...(tpl.a4||{})};

    if(tpl.version>=4 && tpl.sides){
      state.sides=structuredClone(tpl.sides);
      state.currentSide=tpl.currentSide==="back"?"back":"front";
    }else{
      // V3 compatibility: import old single-side template as front.
      state.sides={
        front:{
          backgroundImage:tpl.backgroundImage||"",
          objects:(tpl.objects||[]).map(o=>({
            ...o,
            maxFont:o.maxFont||"",
            minFont:o.minFont||""
          }))
        },
        back:{backgroundImage:"",objects:[]}
      };
      state.currentSide="front";
    }

    applyCardSize(false);
    renderFields();
    $("#toggleGuides").checked = state.view.guides !== false;
    $("#toggleEdgeSnap").checked = state.view.edgeSnap !== false;
    updateDataUi();
    renderSide(state.currentSide);
    requestAnimationFrame(fitToScreen);
    state.restoring=false;
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
    if(state.historyIndex<=0) return;
    state.historyIndex--;
    restoreTemplate(JSON.parse(state.history[state.historyIndex]),true);
    updateHistoryButtons();
  }
  function redo(){
    if(state.historyIndex>=state.history.length-1) return;
    state.historyIndex++;
    restoreTemplate(JSON.parse(state.history[state.historyIndex]),true);
    updateHistoryButtons();
  }


  function normalizedCopyCount(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 0;
  }

  function buildOutputJobs() {
    const mode = state.print.mode || "template";
    const jobs = [];

    if (mode === "template") {
      const copies = Math.max(1, normalizedCopyCount(state.print.templateCopies || 1));
      const rowIndex = state.data.length ? state.currentRow : null;
      for (let i = 0; i < copies; i++) {
        jobs.push({ rowIndex, copyIndex: i + 1, copyTotal: copies });
      }
      return jobs;
    }

    if (!state.data.length) return jobs;

    if (mode === "rows") {
      state.data.forEach((_, rowIndex) => {
        jobs.push({ rowIndex, copyIndex: 1, copyTotal: 1 });
      });
      return jobs;
    }

    const field = state.print.quantityField;
    state.data.forEach((row, rowIndex) => {
      const copies = normalizedCopyCount(row?.[field]);
      for (let i = 0; i < copies; i++) {
        jobs.push({ rowIndex, copyIndex: i + 1, copyTotal: copies });
      }
    });
    return jobs;
  }

  function outputJobBaseName(job, fallbackIndex=1) {
    if (job?.rowIndex !== null && job?.rowIndex !== undefined && state.data.length) {
      const old = state.currentRow;
      state.currentRow = job.rowIndex;
      const name = getFieldValue("姓名") || getFieldValue("職稱") || `record_${job.rowIndex + 1}`;
      const id = getFieldValue("編號") || "";
      state.currentRow = old;
      let base = safeFileName((id ? id + "_" : "") + name);
      if (job.copyTotal > 1) {
        base += `_第${String(job.copyIndex).padStart(String(job.copyTotal).length, "0")}份`;
      }
      return base;
    }
    const label = safeFileName($("#templateName").value || "識別證");
    if (job?.copyTotal > 1) {
      return `${label}_第${String(job.copyIndex).padStart(String(job.copyTotal).length, "0")}份`;
    }
    return label || `badge_${fallbackIndex}`;
  }

  function estimateOutputCopies() {
    return buildOutputJobs().length;
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

    const old = { ...state.print };
    state.print = tempState;
    const count = estimateOutputCopies();
    state.print = old;

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

  async function renderBadgeCanvas(){
    refreshAllAutoShrink();
    if(!window.html2canvas) throw new Error("html2canvas 未載入");
    const selected=selectedObject();
    clearResizeHandles();
    $$(".design-object",badge).forEach(o=>o.classList.remove("selected"));
    const oldTransform=badge.style.transform;
    const oldW=scaleBox.style.width,oldH=scaleBox.style.height;
    badge.style.transform="none";
    scaleBox.style.width=`${badge.offsetWidth}px`;
    scaleBox.style.height=`${badge.offsetHeight}px`;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const canvas=await html2canvas(badge,{backgroundColor:null,scale:2,useCORS:true,logging:false});
    badge.style.transform=oldTransform;
    scaleBox.style.width=oldW; scaleBox.style.height=oldH;
    if(selected) selectObject(selected,false);
    return canvas;
  }

  function refreshAllAutoShrink(){
    $$(".design-object[data-type='text']",badge).forEach(autoShrink);
  }

  async function captureSide(side,rowIndex){
    const oldSide=state.currentSide,oldRow=state.currentRow;
    syncCurrentSideFromDom();
    if(side!==state.currentSide) renderSide(side);
    state.currentRow=rowIndex;
    applyCurrentRecord();
    const canvas=await renderBadgeCanvas();
    state.currentRow=oldRow;
    if(oldSide!==state.currentSide) renderSide(oldSide);
    applyCurrentRecord();
    return canvas;
  }

  function currentOutputBase(){
    const name=getFieldValue("姓名")||`record_${state.currentRow+1}`;
    const id=getFieldValue("編號")||"";
    return safeFileName((id?id+"_":"")+name);
  }

  async function exportCurrentPng(){
    try{
      showBusy(`正在輸出${sideLabel(state.currentSide)} PNG…`);
      const canvas=await renderBadgeCanvas();
      const blob=await new Promise(r=>canvas.toBlob(r,"image/png"));
      downloadBlob(blob,`${currentOutputBase()}_${sideLabel(state.currentSide)}.png`);
    }finally{ hideBusy(); }
  }

  async function exportAllZip(){
    const jobs=buildOutputJobs();
    if(!jobs.length) return alert("目前輸出設定沒有可產生的識別證，請檢查 Excel 或輸出份數設定。");
    if(!window.JSZip) return alert("JSZip 尚未載入。");

    const zip=new JSZip();
    const oldSide=state.currentSide,oldRow=state.currentRow;
    try{
      syncCurrentSideFromDom();
      for(let j=0;j<jobs.length;j++){
        const job=jobs[j];
        if(job.rowIndex!==null && job.rowIndex!==undefined) state.currentRow=job.rowIndex;
        applyCurrentRecord();

        for(const side of ["front","back"]){
          showBusy(`正在產生 ${j+1}/${jobs.length} ${sideLabel(side)}`);
          const captureRow=(job.rowIndex!==null && job.rowIndex!==undefined) ? job.rowIndex : state.currentRow;
          const canvas=await captureSide(side,captureRow);
          const data=canvas.toDataURL("image/png").split(",")[1];
          const base=outputJobBaseName(job,j+1);
          zip.file(`${base}_${sideLabel(side)}.png`,data,{base64:true});
        }
      }
      const blob=await zip.generateAsync({type:"blob"});
      downloadBlob(blob,`${safeFileName($("#templateName").value)}_正反面_PNG.zip`);
    }finally{
      state.currentRow=oldRow;
      if(state.currentSide!==oldSide) renderSide(oldSide);
      applyCurrentRecord(); hideBusy();
    }
  }

  async function exportPdf(){
    const jobs=buildOutputJobs();
    if(!jobs.length) return alert("目前輸出設定沒有可產生的識別證，請檢查 Excel 或輸出份數設定。");
    if(!window.jspdf) return alert("jsPDF 尚未載入。");

    const {jsPDF}=window.jspdf;
    const orientation=state.mmWidth>=state.mmHeight?"landscape":"portrait";
    const pdf=new jsPDF({orientation,unit:"mm",format:[state.mmWidth,state.mmHeight]});
    const oldSide=state.currentSide,oldRow=state.currentRow;
    let page=0;

    try{
      syncCurrentSideFromDom();
      for(let j=0;j<jobs.length;j++){
        const job=jobs[j];
        if(job.rowIndex!==null && job.rowIndex!==undefined) state.currentRow=job.rowIndex;
        applyCurrentRecord();

        for(const side of ["front","back"]){
          showBusy(`正在產生 PDF ${j+1}/${jobs.length} ${sideLabel(side)}`);
          const captureRow=(job.rowIndex!==null && job.rowIndex!==undefined) ? job.rowIndex : state.currentRow;
          const canvas=await captureSide(side,captureRow);
          if(page>0) pdf.addPage([state.mmWidth,state.mmHeight],orientation);
          pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,state.mmWidth,state.mmHeight);
          page++;
        }
      }
      pdf.save(`${safeFileName($("#templateName").value)}_正反面.pdf`);
    }finally{
      state.currentRow=oldRow;
      if(state.currentSide!==oldSide) renderSide(oldSide);
      applyCurrentRecord(); hideBusy();
    }
  }

  async function buildA4Pdf(side){
    const jobs=buildOutputJobs();
    if(!jobs.length) throw new Error("目前輸出設定沒有可產生的識別證。");

    const {jsPDF}=window.jspdf;
    const cfg=state.a4;
    const portrait=cfg.orientation==="portrait";
    const pageW=portrait?210:297,pageH=portrait?297:210;
    const availW=pageW-cfg.marginLeft-cfg.marginRight;
    const availH=pageH-cfg.marginTop-cfg.marginBottom;
    const cols=Math.floor((availW+cfg.gapX)/(state.mmWidth+cfg.gapX));
    const rows=Math.floor((availH+cfg.gapY)/(state.mmHeight+cfg.gapY));
    if(cols<1||rows<1) throw new Error("目前版型尺寸與邊界設定無法排入 A4。");

    const perPage=cols*rows;
    const pdf=new jsPDF({orientation:cfg.orientation,unit:"mm",format:"a4"});

    for(let j=0;j<jobs.length;j++){
      const job=jobs[j];
      if(j>0 && j%perPage===0) pdf.addPage();
      if(job.rowIndex!==null && job.rowIndex!==undefined) state.currentRow=job.rowIndex;
      applyCurrentRecord();

      showBusy(`A4 ${sideLabel(side)} ${j+1}/${jobs.length}`);
      const captureRow=(job.rowIndex!==null && job.rowIndex!==undefined) ? job.rowIndex : state.currentRow;
      const canvas=await captureSide(side,captureRow);

      const slot=j%perPage;
      const r=Math.floor(slot/cols),c=slot%cols;
      const x=cfg.marginLeft+c*(state.mmWidth+cfg.gapX);
      const y=cfg.marginTop+r*(state.mmHeight+cfg.gapY);
      pdf.addImage(canvas.toDataURL("image/png"),"PNG",x,y,state.mmWidth,state.mmHeight);

      if(cfg.cutLine){
        pdf.setDrawColor(170);
        pdf.rect(x,y,state.mmWidth,state.mmHeight);
      }
    }
    return pdf;
  }

