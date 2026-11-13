  async function exportA4(){
    await runBadgeExport(true,async (records,count)=>{
      a4Layout(records);
      const {jsPDF}=await loadLibrary("jspdf");
      const name=safeFileName(records.name);
      if(records.a4.sideMode==="both"){
        const Zip=await loadLibrary("JSZip");
        const zip=new Zip();
        for (const side of ["front","back"]) {
          const pdf=await buildA4Pdf(side,records,count,jsPDF);
          zip.file(`${name}_A4_${sideLabel(side)}.pdf`,pdf.output("blob"));
        }
        downloadBlob(await zip.generateAsync({type:"blob"}),`${name}_A4_正反面.zip`);
      }else{
        const side=records.a4.sideMode;
        const pdf=await buildA4Pdf(side,records,count,jsPDF);
        downloadBlob(pdf.output("blob"),`${name}_A4_${sideLabel(side)}.pdf`);
      }
    });
  }

  function fitPreview(){
    const scene=$("#previewBadge");
    if (!scene) return;
    const scale=Math.min(1,innerWidth*.88/scene.offsetWidth,innerHeight*.65/scene.offsetHeight);
    scene.style.transform=`scale(${scale})`;
    const wrap=$("#previewCloneWrap");
    wrap.style.width=`${scene.offsetWidth*scale}px`;
    wrap.style.height=`${scene.offsetHeight*scale}px`;
  }

  function updatePreviewClone(){
    if ($("#previewOverlay").classList.contains("hidden")) return;
    const records=snapshotForRendering();
    const scene=makeBadgeScene(state.previewSide,records);
    scene.id="previewBadge";
    const wrap=$("#previewCloneWrap");
    wrap.textContent="";
    wrap.appendChild(scene);
    applyRecordToBadge(scene,records.currentRow,records);
    fitPreview();
  }

  function bindA4(){
    $("#a4SettingsBtn").addEventListener("click",()=>{
      const a=state.a4;
      $("#a4SideMode").value=a.sideMode;
      $("#a4Orientation").value=a.orientation;
      $("#a4MarginTop").value=a.marginTop; $("#a4MarginBottom").value=a.marginBottom;
      $("#a4MarginLeft").value=a.marginLeft; $("#a4MarginRight").value=a.marginRight;
      $("#a4GapX").value=a.gapX; $("#a4GapY").value=a.gapY;
      $("#a4CutLine").checked=a.cutLine;
      $("#a4Modal").classList.remove("hidden");
    });
    $("#closeA4Settings").addEventListener("click",()=>$("#a4Modal").classList.add("hidden"));
    $("#saveA4Settings").addEventListener("click",()=>{
      try {
        state.a4=normalizedA4({
          sideMode:$("#a4SideMode").value,
          orientation:$("#a4Orientation").value,
          marginTop:$("#a4MarginTop").value,
          marginBottom:$("#a4MarginBottom").value,
          marginLeft:$("#a4MarginLeft").value,
          marginRight:$("#a4MarginRight").value,
          gapX:$("#a4GapX").value,
          gapY:$("#a4GapY").value,
          cutLine:$("#a4CutLine").checked
        },state.a4);
      } catch (error) { alert(error.message); return; }
      $("#a4Modal").classList.add("hidden");
      markDirty(); pushHistory();
    });
  }

  function readCardDimensions(width,height){
    return [positiveMm(width,90),positiveMm(height,54)];
  }

  function changeCardSize(width,height){
    try { [state.mmWidth,state.mmHeight]=readCardDimensions(width,height); }
    catch (error) {
      $("#cardWidth").value=state.mmWidth;
      $("#cardHeight").value=state.mmHeight;
      alert(error.message);
      return;
    }
    applyCardSize(true); markDirty(); pushHistory();
  }

  function toggleRightPanel(){
    const narrow = matchMedia("(max-width: 900px)").matches;
    if (narrow) {
      workspace.classList.toggle("show-right-narrow");
    } else {
      $("#rightPanel").classList.toggle("collapsed");
      workspace.classList.toggle("hide-right",$("#rightPanel").classList.contains("collapsed"));
    }
    if (state.fitMode) requestAnimationFrame(fitToScreen);
  }

  function bindEvents(){
    $("#newTemplateBtn").addEventListener("click",()=>$("#newTemplateModal").classList.remove("hidden"));
    $("#cancelNewTemplate").addEventListener("click",()=>$("#newTemplateModal").classList.add("hidden"));
    $$(".preset").forEach(p=>p.addEventListener("click",()=>{
      $$(".preset").forEach(x=>x.classList.remove("active"));
      p.classList.add("active");
      $("#newWidth").value=p.dataset.w; $("#newHeight").value=p.dataset.h;
    }));
    $("#confirmNewTemplate").addEventListener("click",()=>{
      let size;
      try { size=readCardDimensions($("#newWidth").value,$("#newHeight").value); }
      catch (error) { alert(error.message); return; }
      $("#templateName").value=$("#newTemplateName").value||"未命名版型";
      [state.mmWidth,state.mmHeight]=size;
      state.sides={front:cloneModel(defaultFront),back:{backgroundImage:"",objects:[]}};
      state.currentSide="front";
      state.print={mode:"template",templateCopies:1,quantityField:""};
      $("#newTemplateModal").classList.add("hidden");
      applyCardSize(false); renderSide("front"); updateDataUi(); requestAnimationFrame(fitToScreen);
      markDirty(); pushHistory();
    });

    $("#cardWidth").addEventListener("change",e=>{
      changeCardSize(e.target.value,state.mmHeight);
    });
    $("#cardHeight").addEventListener("change",e=>{
      changeCardSize(state.mmWidth,e.target.value);
    });
    $("#landscapeBtn").addEventListener("click",()=>{
      if(state.mmWidth<state.mmHeight)[state.mmWidth,state.mmHeight]=[state.mmHeight,state.mmWidth];
      applyCardSize(true); markDirty(); pushHistory();
    });
    $("#portraitBtn").addEventListener("click",()=>{
      if(state.mmWidth>state.mmHeight)[state.mmWidth,state.mmHeight]=[state.mmHeight,state.mmWidth];
      applyCardSize(true); markDirty(); pushHistory();
    });

    $("#bgUpload").addEventListener("change",async e=>{
      const file=e.target.files?.[0]; if(!file) return;
      const side = state.currentSide;
      try {
        const src = imageDataUrl(await fileToDataURL(file));
        if (!src) throw new Error("請選擇有效的圖片檔案。");
        if (side===state.currentSide) setBadgeBackground(badge,`url("${src}")`);
        else state.sides[side]={...state.sides[side],backgroundImage:`url("${src}")`};
        markDirty(); pushHistory();
      } catch (error) { alert(error.message || "底圖讀取失敗。"); }
      finally { e.target.value=""; }
    });
    $("#clearBgBtn").addEventListener("click",()=>{
      badge.style.backgroundImage="";
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });
    $("#copyFrontToBackBtn").addEventListener("click",()=>{
      syncCurrentSideFromDom();
      if(!confirm("確定要用正面內容覆蓋目前的背面版型嗎？")) return;
      state.sides.back=cloneModel(state.sides.front);
      if(state.currentSide==="back") renderSide("back");
      markDirty(); pushHistory();
    });

    $("#imageUpload").addEventListener("change",async e=>{
      const file=e.target.files?.[0]; if(!file) return;
      try {
        const src=imageDataUrl(await fileToDataURL(file));
        if(!src) throw new Error("請選擇有效的圖片檔案。");
        addImageObject(src);
      } catch (error) { alert(error.message || "圖片讀取失敗。"); }
      finally { e.target.value=""; }
    });

    $("#addFixedTextBtn").addEventListener("click",()=>addTextObject("",false));
    $("#addExcelFieldBtn").addEventListener("click",()=>{
      const field=prompt("Excel 套印欄位名稱：",state.fields[0]||"姓名");
      if(!field) return;
      if(!state.fields.includes(field)) state.fields.push(field);
      renderFields(); addTextObject(field,true);
    });
    $("#addBoxBtn").addEventListener("click",addBox);
    $("#addQrBtn").addEventListener("click",addQr);
    $("#addObjectShortcut").addEventListener("click",()=>addTextObject("",false));

    function addField(){
      const f=prompt("新增欄位名稱：");
      if(!f) return;
      if(!state.fields.includes(f)) state.fields.push(f);
      renderFields(); markDirty(); pushHistory();
    }
    $("#addFieldBtn").addEventListener("click",addField);
    $("#addFieldShortcut").addEventListener("click",addField);

    $$(".side-btn").forEach(btn=>btn.addEventListener("click",()=>switchSide(btn.dataset.cardSide)));

    $("#excelInput").addEventListener("change",async e=>{
      const file=e.target.files?.[0]; if(!file) return;

      if(state.data.length){
        const ok = confirm(
          `目前已有 ${state.data.length} 筆 Excel 資料。\n\n` +
          `要以「${file.name}」取代目前名單嗎？\n` +
          `版型設計與 Excel 套印欄位會保留。`
        );
        if(!ok){
          e.target.value="";
          return;
        }
      }

      const oldInfo=$("#dataInfo").textContent;
      e.target.disabled=true;
      $("#dataInfo").textContent="正在讀取 Excel…";
      try{ await importExcel(file); }
      catch(err){ $("#dataInfo").textContent=oldInfo; alert(err.message || "Excel 讀取失敗，請確認檔案格式。"); }
      finally { e.target.disabled=false; e.target.value=""; }
    });
    $("#fieldMappingBtn").addEventListener("click",openFieldMapping);
    $("#removeExcelBtn").addEventListener("click",removeExcelData);
    $("#cancelMapping").addEventListener("click",()=>$("#mappingModal").classList.add("hidden"));
    $("#confirmMapping").addEventListener("click",confirmFieldMapping);

    ["showDataBtn","expandDataBtn"].forEach(id=>$("#"+id).addEventListener("click",openDataDrawer));
    $("#closeDataDrawer").addEventListener("click",closeDataDrawer);
    $("#dataTable tbody").addEventListener("click",event=>{
      const row=event.target.closest("tr[data-record]");
      if(!row) return;
      state.currentRow=Number(row.dataset.record);
      applyCurrentRecord(); renderDataTable(); updatePreviewClone();
    });

    ["prevRecord","prevRecordRibbon"].forEach(id=>$("#"+id).addEventListener("click",()=>moveRecord(-1)));
    ["nextRecord","nextRecordRibbon"].forEach(id=>$("#"+id).addEventListener("click",()=>moveRecord(1)));
    $("#searchBtn").addEventListener("click",searchRecord);
    $("#recordSearch").addEventListener("keydown",e=>{if(e.key==="Enter")searchRecord();});

    $("#previewModeBtn").addEventListener("click",()=>{
      state.previewSide=state.currentSide;
      $$(".preview-side-btn").forEach(b=>b.classList.toggle("active",b.dataset.previewSide===state.previewSide));
      $("#previewOverlay").classList.remove("hidden");
      updatePreviewClone();
    });
    $("#closePreview").addEventListener("click",()=>{
      $("#previewOverlay").classList.add("hidden");
      $("#previewCloneWrap").textContent="";
    });
    $("#previewPrev").addEventListener("click",()=>moveRecord(-1));
    $("#previewNext").addEventListener("click",()=>moveRecord(1));
    $$(".preview-side-btn").forEach(btn=>btn.addEventListener("click",()=>{
      state.previewSide=btn.dataset.previewSide;
      $$(".preview-side-btn").forEach(b=>b.classList.toggle("active",b.dataset.previewSide===state.previewSide));
      updatePreviewClone();
    }));

    $("#printQtySettingsBtn").addEventListener("click",openPrintQtySettings);
    $("#cancelPrintQty").addEventListener("click",()=>$("#printQtyModal").classList.add("hidden"));
    $("#savePrintQty").addEventListener("click",savePrintQtySettings);
    $$('input[name="printMode"]').forEach(r=>r.addEventListener("change",previewPrintQtyModal));
    $("#templateCopies").addEventListener("input",previewPrintQtyModal);
    $("#quantityFieldSelect").addEventListener("change",previewPrintQtyModal);

    $("#exportCurrentPngBtn").addEventListener("click",exportCurrentPng);
    $("#exportAllZipBtn").addEventListener("click",exportAllZip);
    $("#exportPdfBtn").addEventListener("click",exportPdf);
    $("#exportA4Btn").addEventListener("click",exportA4);

    const zin=()=>setZoom(state.zoom+.1,false);
    const zout=()=>setZoom(state.zoom-.1,false);
    ["zoomIn","zoomInRibbon"].forEach(id=>$("#"+id).addEventListener("click",zin));
    ["zoomOut","zoomOutRibbon"].forEach(id=>$("#"+id).addEventListener("click",zout));
    ["zoomReset","zoomResetRibbon"].forEach(id=>$("#"+id).addEventListener("click",()=>setZoom(1,false)));
    ["fitBtn","fitRibbon"].forEach(id=>$("#"+id).addEventListener("click",fitToScreen));

    $("#toggleGuides").addEventListener("change",e=>{
      state.view.guides=e.target.checked;
      hideAlignmentGuides();
      markDirty(); pushHistory();
    });
    $("#toggleEdgeSnap").addEventListener("change",e=>{
      state.view.edgeSnap=e.target.checked;
      hideAlignmentGuides();
      markDirty(); pushHistory();
    });

    $("#toggleLeftBtn").addEventListener("click",()=>{
      if (matchMedia("(max-width: 620px)").matches) workspace.classList.toggle("show-left-narrow");
      else {
        $("#leftPanel").classList.toggle("collapsed");
        workspace.classList.toggle("hide-left",$("#leftPanel").classList.contains("collapsed"));
      }
      if (state.fitMode) requestAnimationFrame(fitToScreen);
    });
    $("#toggleRightBtn").addEventListener("click",toggleRightPanel);
    $("#closeNarrowProperties").addEventListener("click",toggleRightPanel);

    stageScroll.addEventListener("wheel",e=>{
      if(!e.ctrlKey) return;
      e.preventDefault(); setZoom(state.zoom+(e.deltaY<0?.1:-.1),false);
    },{passive:false});

    badge.addEventListener("pointerdown",e=>{
      if(e.target===badge||e.target.classList.contains("safe-area")){
        hideAlignmentGuides();
        selectObject(null);
      }
    });

    $("#saveTemplateBtn").addEventListener("click",()=>{
      try {
        localStorage.setItem("badgeTemplateV4",JSON.stringify(templateSnapshotObject()));
        $("#saveStatus").textContent="已儲存於本機";
      } catch { alert("瀏覽器無法儲存此版型，可使用「匯出版型 JSON」備份。"); }
    });
    $("#loadTemplateBtn").addEventListener("click",()=>{
      try {
        const raw=localStorage.getItem("badgeTemplateV4");
        if(!raw) return alert("目前瀏覽器沒有已儲存的 V4 版型。");
        restoreTemplate(JSON.parse(raw));
        $("#saveStatus").textContent="已載入";
      } catch (err) { alert(err.message || "本機版型讀取失敗。"); }
    });
    $("#exportTemplateBtn").addEventListener("click",()=>{
      const blob=new Blob([JSON.stringify(templateSnapshotObject(),null,2)],{type:"application/json"});
      downloadBlob(blob,`${safeFileName($("#templateName").value)}.json`);
    });
    $("#importTemplateInput").addEventListener("change",async e=>{
      const file=e.target.files?.[0]; if(!file) return;
      try{
        restoreTemplate(JSON.parse(await file.text()));
        $("#saveStatus").textContent="已匯入";
      }catch(err){ alert(err.message || "JSON 版型檔格式錯誤。"); }
      e.target.value="";
    });

    $("#templateName").addEventListener("change",()=>{markDirty();pushHistory();});
    $("#undoBtn").addEventListener("click",undo);
    $("#redoBtn").addEventListener("click",redo);

    document.addEventListener("keydown",e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
        e.preventDefault(); if(e.shiftKey)redo(); else undo();
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){
        e.preventDefault(); redo();
      }
      if((e.key==="Delete"||e.key==="Backspace")&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){
        const el=selectedObject();
        if(el){ e.preventDefault(); deleteObject(el); }
      }
    });

    window.addEventListener("resize",()=>{
      if(state.fitMode) fitToScreen();
      if (!$("#previewOverlay").classList.contains("hidden")) fitPreview();
    });
  }

  function init(){
    setupTabs();
    applyCardSize(false);
    renderFields();
    $("#toggleGuides").checked = state.view.guides !== false;
    $("#toggleEdgeSnap").checked = state.view.edgeSnap !== false;
    updateDataUi();
    renderSide("front");
    bindProperties();
    bindA4();
    bindEvents();
    requestAnimationFrame(()=>requestAnimationFrame(fitToScreen));
    pushHistory(true);
  }

  init();
