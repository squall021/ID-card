  function renderFields(){
    const list=$("#fieldList");
    list.innerHTML="";
    state.fields.forEach(field=>{
      const row=document.createElement("div");
      row.className="field-item";
      row.innerHTML=`<span>⌘ ${escapeHtml(field)}</span><button class="icon-btn">＋</button>`;
      row.querySelector("button").addEventListener("click",()=>addTextObject(field,true));
      list.appendChild(row);
    });
    $("#propField").innerHTML=`<option value="">固定文字</option>`+
      state.fields.map(f=>`<option value="${escapeAttr(f)}">${escapeHtml(f)}</option>`).join("");
    $("#propQrField").innerHTML=`<option value="">固定內容</option>`+
      state.fields.map(f=>`<option value="${escapeAttr(f)}">${escapeHtml(f)}</option>`).join("");
  }

  function populateProperties(el){
    $("#propName").value=el.dataset.name||"";
    $("#propX").value=pct(el.style.left,badge.clientWidth).toFixed(1);
    $("#propY").value=pct(el.style.top,badge.clientHeight).toFixed(1);
    $("#propW").value=pct(el.style.width,badge.clientWidth).toFixed(1);
    $("#propH").value=pct(el.style.height,badge.clientHeight).toFixed(1);
    $("#propLocked").checked=isLocked(el);

    ["textProperties","imageProperties","boxProperties","qrProperties"].forEach(id=>$("#"+id).classList.add("hidden"));

    if(el.dataset.type==="text"){
      $("#textProperties").classList.remove("hidden");
      const c=textContentEl(el);
      const fs=parseFloat(getComputedStyle(el).fontSize)||16;
      $("#propContent").value=c?.textContent||"";
      $("#propField").value=el.dataset.field||"";
      $("#propFontFamily").value=el.style.fontFamily||"'Noto Sans TC','Microsoft JhengHei',sans-serif";
      $("#propFontSize").value=fs;
      $("#propLetterSpacing").value=parseFloat(getComputedStyle(el).letterSpacing)||0;
      $("#propLineHeight").value=parseFloat(getComputedStyle(el).lineHeight)/(fs||16)||1.2;
      $("#propColor").value=rgbToHex(getComputedStyle(el).color);
      $("#propAutoShrink").checked=el.dataset.autoShrink==="1";
      $("#propMaxFont").value=Number(el.dataset.maxFont||fs);
      $("#propMinFont").value=Number(el.dataset.minFont||Math.min(10,fs));
    }else if(el.dataset.type==="image"){
      $("#imageProperties").classList.remove("hidden");
      $("#propImageOpacity").value=Math.round((parseFloat(el.style.opacity||"1"))*100);
      const img=$("img",el);
      $("#propImageFit").value=img?.style.objectFit||"contain";
    }else if(el.dataset.type==="box"){
      $("#boxProperties").classList.remove("hidden");
      $("#propBoxColor").value=rgbToHex(getComputedStyle(objectContent(el)).backgroundColor);
      $("#propBoxOpacity").value=Math.round((parseFloat(el.style.opacity||"1"))*100);
    }else if(el.dataset.type==="qr"){
      $("#qrProperties").classList.remove("hidden");
      $("#propQrContent").value=el.dataset.qrContent||"";
      $("#propQrField").value=el.dataset.qrField||"";
    }
  }

  function autoShrink(el){
    if(el.dataset.type!=="text") return;
    const c=textContentEl(el);
    if(!c) return;

    if(el.dataset.autoShrink!=="1") return;

    let maxFont=Number(el.dataset.maxFont||parseFloat(getComputedStyle(el).fontSize)||16);
    let minFont=Number(el.dataset.minFont||10);
    if(minFont>maxFont) [minFont,maxFont]=[maxFont,minFont];

    el.style.fontSize=`${maxFont}px`;

    // Wait for the new font size to affect layout synchronously.
    let fs=maxFont;
    const fits=()=>c.scrollWidth<=c.clientWidth+1 && c.scrollHeight<=c.clientHeight+1;

    while(!fits() && fs>minFont){
      fs=Math.max(minFont,fs-1);
      el.style.fontSize=`${fs}px`;
      if(fs===minFont) break;
    }
  }

  function refreshAllAutoShrink(){
    $$(".design-object[data-type='text']",badge).forEach(autoShrink);
  }

  function bindProperties(){
    [["propX","left"],["propY","top"],["propW","width"],["propH","height"]].forEach(([id,prop])=>{
      $("#"+id).addEventListener("change",e=>{
        const el=selectedObject(); if(!el||isLocked(el)) return;
        el.style[prop]=`${parseFloat(e.target.value||0)}%`;
        if(el.dataset.type==="qr") renderQr(el);
        if(el.dataset.type==="text") autoShrink(el);
        syncCurrentSideFromDom(); markDirty(); pushHistory();
      });
    });

    $("#propName").addEventListener("change",e=>{
      const el=selectedObject(); if(!el) return;
      el.dataset.name=e.target.value;
      syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
    });

    $("#propLocked").addEventListener("change",e=>{
      const el=selectedObject(); if(!el) return;
      el.dataset.locked=e.target.checked?"1":"0";
      el.classList.toggle("locked",e.target.checked);
      selectObject(el);
      syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
    });

    $("#propContent").addEventListener("input",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text"||isLocked(el)) return;
      el.dataset.field="";
      el.classList.remove("dynamic");
      const c=textContentEl(el); if(c) c.textContent=e.target.value;
      $("#propField").value="";
      autoShrink(el);
      syncCurrentSideFromDom(); markDirty();
    });
    $("#propContent").addEventListener("change",()=>pushHistory());

    $("#propField").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.dataset.field=e.target.value;
      el.classList.toggle("dynamic",!!e.target.value);
      const c=textContentEl(el);
      if(c){
        c.textContent=e.target.value ? (getFieldValue(e.target.value)||`{{${e.target.value}}}`) : c.textContent;
      }
      autoShrink(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propFontFamily").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.style.fontFamily=e.target.value;
      autoShrink(el); syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propFontSize").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      const fs=Number(e.target.value)||16;
      el.style.fontSize=`${fs}px`;
      if(el.dataset.autoShrink==="1") el.dataset.maxFont=String(fs);
      autoShrink(el);
      populateProperties(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propLetterSpacing").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.style.letterSpacing=`${e.target.value}px`;
      autoShrink(el); syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propLineHeight").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.style.lineHeight=String(e.target.value);
      autoShrink(el); syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propColor").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.style.color=e.target.value;
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propAutoShrink").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.dataset.autoShrink=e.target.checked?"1":"0";
      if(e.target.checked){
        const fs=parseFloat(getComputedStyle(el).fontSize)||16;
        el.dataset.maxFont=el.dataset.maxFont||String(fs);
        el.dataset.minFont=el.dataset.minFont||String(Math.min(10,fs));
        autoShrink(el);
      }
      populateProperties(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propMaxFont").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.dataset.maxFont=String(Number(e.target.value)||16);
      autoShrink(el); populateProperties(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propMinFont").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.dataset.minFont=String(Number(e.target.value)||8);
      autoShrink(el); populateProperties(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propBoldBtn").addEventListener("click",()=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      el.style.fontWeight=(parseInt(getComputedStyle(el).fontWeight)>=600)?"400":"700";
      autoShrink(el); syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $$(".align-btn").forEach(btn=>btn.addEventListener("click",()=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="text") return;
      const a=btn.dataset.align;
      el.style.textAlign=a;
      el.style.justifyContent=a==="left"?"flex-start":a==="right"?"flex-end":"center";
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    }));

    $("#propImageOpacity").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="image") return;
      el.style.opacity=String(Number(e.target.value)/100);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });
    $("#propImageFit").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="image") return;
      const img=$("img",el); if(img) img.style.objectFit=e.target.value;
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propBoxColor").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="box") return;
      objectContent(el).style.background=e.target.value;
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });
    $("#propBoxOpacity").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="box") return;
      el.style.opacity=String(Number(e.target.value)/100);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#propQrContent").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="qr") return;
      el.dataset.qrContent=e.target.value;
      el.dataset.qrField="";
      $("#propQrField").value="";
      renderQr(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });
    $("#propQrField").addEventListener("change",e=>{
      const el=selectedObject(); if(!el||el.dataset.type!=="qr") return;
      el.dataset.qrField=e.target.value;
      renderQr(el);
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });

    $("#duplicateBtn").addEventListener("click",()=>{
      const el=selectedObject(); if(!el) return;
      const copy=el.cloneNode(true);
      copy.querySelectorAll(".resize-handle").forEach(h=>h.remove());
      copy.dataset.id=uid("dup");
      copy.style.left=`${Math.min(90,pct(el.style.left,badge.clientWidth)+3)}%`;
      copy.style.top=`${Math.min(90,pct(el.style.top,badge.clientHeight)+3)}%`;
      badge.appendChild(copy);
      makeInteractive(copy);
      if(copy.dataset.type==="qr") renderQr(copy);
      if(copy.dataset.type==="text") autoShrink(copy);
      selectObject(copy);
      syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
    });

    $("#deleteBtn").addEventListener("click",()=>{
      const el=selectedObject(); if(el) deleteObject(el);
    });
  }

  function deleteObject(el){
    if(!confirm(`確定要刪除「${objectName(el)}」嗎？`)) return;
    el.remove();
    selectObject(null);
    syncCurrentSideFromDom();
    renderLayers(); markDirty(); pushHistory();
  }

  function addTextObject(field="",dynamic=false){
    const el=document.createElement("div");
    el.className="design-object text-object"+(dynamic?" dynamic":"");
    el.dataset.id=uid("text");
    el.dataset.type="text";
    el.dataset.field=field;
    el.dataset.name=dynamic?field:"固定文字";
    el.dataset.locked="0";
    el.dataset.autoShrink="1";
    el.dataset.maxFont="24";
    el.dataset.minFont="10";
    el.style.cssText="left:25%;top:30%;width:50%;height:12%;font-size:24px;text-align:center;justify-content:center;";
    const c=document.createElement("div");
    c.className="object-content text-content";
    c.textContent=dynamic?(getFieldValue(field)||`{{${field}}}`):"雙擊修改文字";
    el.appendChild(c);
    badge.appendChild(el);
    makeInteractive(el);
    autoShrink(el);
    selectObject(el);
    syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
  }

  function addImageObject(src){
    const el=document.createElement("div");
    el.className="design-object image-object";
    el.dataset.id=uid("img"); el.dataset.type="image"; el.dataset.name="圖片"; el.dataset.locked="0";
    el.style.cssText="left:8%;top:8%;width:22%;height:22%;";
    el.innerHTML=`<div class="object-content image-content"><img src="${src}" alt="" style="object-fit:contain"></div>`;
    badge.appendChild(el); makeInteractive(el); selectObject(el);
    syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
  }

  function addBox(){
    const el=document.createElement("div");
    el.className="design-object box-object";
    el.dataset.id=uid("box"); el.dataset.type="box"; el.dataset.name="色塊"; el.dataset.locked="0";
    el.style.cssText="left:10%;top:15%;width:35%;height:18%;z-index:1;";
    el.innerHTML='<div class="object-content box-content"></div>';
    badge.appendChild(el); makeInteractive(el); selectObject(el);
    syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
  }

  function addQr(){
    const value=prompt("QR Code 固定內容（也可以之後在右側改成 Excel 欄位）：","https://");
    if(value===null) return;
    const el=document.createElement("div");
    el.className="design-object qr-object";
    el.dataset.id=uid("qr"); el.dataset.type="qr"; el.dataset.name="QR Code"; el.dataset.locked="0";
    el.dataset.qrContent=value; el.dataset.qrField="";
    el.style.cssText="left:70%;top:62%;width:20%;height:28%;";
    el.innerHTML='<div class="object-content qr-content"></div>';
    badge.appendChild(el); makeInteractive(el); renderQr(el); selectObject(el);
    syncCurrentSideFromDom(); renderLayers(); markDirty(); pushHistory();
  }

  function renderQr(el){
    const target=$(".qr-content",el);
    if(!target) return;
    target.innerHTML="";
    const value=el.dataset.qrField ? (getFieldValue(el.dataset.qrField)||" ") : (el.dataset.qrContent||" ");
    if(!window.QRCode){ target.textContent="QR"; return; }
    const size=Math.max(60,Math.floor(Math.min(el.clientWidth,el.clientHeight)));
    new QRCode(target,{text:String(value),width:size,height:size,correctLevel:QRCode.CorrectLevel.M});
  }

  function getFieldValue(field){
    if(!state.data.length) return "";
    const row=state.data[state.currentRow]||{};
    if(field in row) return row[field]??"";
    const source=Object.keys(state.fieldMap).find(k=>state.fieldMap[k]===field);
    return source ? (row[source]??"") : "";
  }

  function applyCurrentRecord(){
    $$(".design-object[data-type='text']",badge).forEach(el=>{
      if(el.dataset.field){
        const c=textContentEl(el);
        if(c) c.textContent=state.data.length ? String(getFieldValue(el.dataset.field)??"") : `{{${el.dataset.field||""}}}`;
      }
      autoShrink(el);
    });
    $$(".design-object[data-type='qr']",badge).forEach(renderQr);

    const row=state.data[state.currentRow]||{};
    const nameKey=["姓名","Name","name"].find(k=>k in row);
    $("#currentRecordName").textContent=state.data.length ? String(row[nameKey]??`第 ${state.currentRow+1} 筆`) : "範例資料";
    $("#recordCounter").textContent=state.data.length ? `${state.currentRow+1} / ${state.data.length}` : "0 / 0";
    $("#previewCounter").textContent=$("#recordCounter").textContent;
  }

  function renderDataTable(){
    const thead=$("#dataTable thead"),tbody=$("#dataTable tbody");
    thead.innerHTML=state.headers.length?`<tr><th>#</th>${state.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr>`:"";
    tbody.innerHTML="";
    state.data.forEach((row,i)=>{
      const tr=document.createElement("tr");
      if(i===state.currentRow) tr.classList.add("active");
      tr.innerHTML=`<td>${i+1}</td>${state.headers.map(h=>`<td>${escapeHtml(row[h]??"")}</td>`).join("")}`;
      tr.addEventListener("click",()=>{ state.currentRow=i; applyCurrentRecord(); renderDataTable(); });
      tbody.appendChild(tr);
    });
  }


  function updateDataUi(){
    const hasData = state.data.length > 0;
    $("#removeExcelBtn").disabled = !hasData;
    $("#fieldMappingBtn").disabled = !hasData;

    if(!hasData){
      $("#dataInfo").textContent = "尚未匯入資料";
      $("#drawerInfo").textContent = "尚未匯入資料";
    }

    populateQuantityFieldOptions();
    updatePrintSummary();
  }

  function clearExcelData(){
    state.data = [];
    state.headers = [];
    state.currentRow = 0;
    state.fieldMap = {};

    // If the current print mode depends on Excel, switch back to repeated-template mode.
    if(state.print.mode !== "template"){
      state.print.mode = "template";
      state.print.quantityField = "";
      state.print.templateCopies = Math.max(1, state.print.templateCopies || 1);
    }

    renderDataTable();
    applyCurrentRecord();
    updateDataUi();
    $("#recordSearch").value = "";
    $("#dataDrawer").classList.remove("open");

    markDirty();
    pushHistory();
  }

  function removeExcelData(){
    if(!state.data.length) return;
    const ok = confirm(
      `確定要移除目前 Excel 名單嗎？\n\n` +
      `目前共有 ${state.data.length} 筆資料。\n` +
      `版型中的「Excel 套印欄位」、正反面設計、文字位置與 QR Code 欄位綁定都會保留，只移除名單資料與欄位對應。`
    );
    if(!ok) return;
    clearExcelData();
  }

