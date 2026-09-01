  async function exportA4(){
    if(!buildOutputJobs().length) return alert("目前輸出設定沒有可產生的識別證，請檢查 Excel 或輸出份數設定。");
    if(!window.jspdf) return alert("jsPDF 尚未載入。");
    const oldSide=state.currentSide,oldRow=state.currentRow;
    try{
      syncCurrentSideFromDom();
      if(state.a4.sideMode==="both"){
        if(!window.JSZip) return alert("JSZip 尚未載入。");
        const zip=new JSZip();
        const frontPdf=await buildA4Pdf("front");
        zip.file(`${safeFileName($("#templateName").value)}_A4_正面.pdf`,frontPdf.output("blob"));
        const backPdf=await buildA4Pdf("back");
        zip.file(`${safeFileName($("#templateName").value)}_A4_背面.pdf`,backPdf.output("blob"));
        const blob=await zip.generateAsync({type:"blob"});
        downloadBlob(blob,`${safeFileName($("#templateName").value)}_A4_正反面.zip`);
      }else{
        const pdf=await buildA4Pdf(state.a4.sideMode);
        pdf.save(`${safeFileName($("#templateName").value)}_A4_${sideLabel(state.a4.sideMode)}.pdf`);
      }
    }catch(err){
      alert(err.message||"A4 輸出失敗。");
    }finally{
      state.currentRow=oldRow;
      if(state.currentSide!==oldSide) renderSide(oldSide);
      applyCurrentRecord(); hideBusy();
    }
  }

  function updatePreviewClone(){
    const wrap=$("#previewCloneWrap");
    wrap.innerHTML="";
    const oldSide=state.currentSide;
    syncCurrentSideFromDom();
    if(state.previewSide!==state.currentSide) renderSide(state.previewSide);
    applyCurrentRecord();
    const clone=badge.cloneNode(true);
    clone.id="previewBadge";
    clone.querySelectorAll(".resize-handle").forEach(h=>h.remove());
    clone.querySelectorAll(".design-object").forEach(o=>o.classList.remove("selected"));
    clone.style.transform="none";
    clone.style.width=`${state.mmWidth*8}px`;
    clone.style.height=`${state.mmHeight*8}px`;
    wrap.appendChild(clone);
    if(oldSide!==state.currentSide) renderSide(oldSide);
    applyCurrentRecord();
    $("#previewCounter").textContent=state.data.length?`${state.currentRow+1} / ${state.data.length}`:"0 / 0";
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
      state.a4={
        sideMode:$("#a4SideMode").value,
        orientation:$("#a4Orientation").value,
        marginTop:Number($("#a4MarginTop").value)||0,
        marginBottom:Number($("#a4MarginBottom").value)||0,
        marginLeft:Number($("#a4MarginLeft").value)||0,
        marginRight:Number($("#a4MarginRight").value)||0,
        gapX:Number($("#a4GapX").value)||0,
        gapY:Number($("#a4GapY").value)||0,
        cutLine:$("#a4CutLine").checked
      };
      $("#a4Modal").classList.add("hidden");
      markDirty(); pushHistory();
    });
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
      $("#templateName").value=$("#newTemplateName").value||"未命名版型";
      state.mmWidth=Number($("#newWidth").value)||90;
      state.mmHeight=Number($("#newHeight").value)||54;
      state.sides={front:structuredClone(defaultFront),back:{backgroundImage:"",objects:[]}};
      state.currentSide="front";
      state.print={mode:"template",templateCopies:1,quantityField:""};
      $("#newTemplateModal").classList.add("hidden");
      applyCardSize(false); renderSide("front"); updateDataUi(); requestAnimationFrame(fitToScreen);
      markDirty(); pushHistory();
    });

    $("#cardWidth").addEventListener("change",e=>{
      state.mmWidth=Number(e.target.value)||90; applyCardSize(true); markDirty(); pushHistory();
    });
    $("#cardHeight").addEventListener("change",e=>{
      state.mmHeight=Number(e.target.value)||54; applyCardSize(true); markDirty(); pushHistory();
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
      badge.style.backgroundImage=`url("${await fileToDataURL(file)}")`;
      syncCurrentSideFromDom(); markDirty(); pushHistory(); e.target.value="";
    });
    $("#clearBgBtn").addEventListener("click",()=>{
      badge.style.backgroundImage="";
      syncCurrentSideFromDom(); markDirty(); pushHistory();
    });
    $("#copyFrontToBackBtn").addEventListener("click",()=>{
      syncCurrentSideFromDom();
      if(!confirm("確定要用正面內容覆蓋目前的背面版型嗎？")) return;
      state.sides.back=structuredClone(state.sides.front);
      if(state.currentSide==="back") renderSide("back");
      markDirty(); pushHistory();
    });

    $("#imageUpload").addEventListener("change",async e=>{
      const file=e.target.files?.[0]; if(!file) return;
      addImageObject(await fileToDataURL(file)); e.target.value="";
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

      try{ await importExcel(file); }
      catch(err){ console.error(err); alert("Excel 讀取失敗，請確認檔案格式。"); }
      e.target.value="";
    });
    $("#fieldMappingBtn").addEventListener("click",openFieldMapping);
    $("#removeExcelBtn").addEventListener("click",removeExcelData);
    $("#cancelMapping").addEventListener("click",()=>$("#mappingModal").classList.add("hidden"));
    $("#confirmMapping").addEventListener("click",confirmFieldMapping);

    ["showDataBtn","expandDataBtn"].forEach(id=>$("#"+id).addEventListener("click",()=>$("#dataDrawer").classList.add("open")));
    $("#closeDataDrawer").addEventListener("click",()=>$("#dataDrawer").classList.remove("open"));

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
    $("#closePreview").addEventListener("click",()=>$("#previewOverlay").classList.add("hidden"));
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
      $("#leftPanel").classList.toggle("collapsed");
      workspace.classList.toggle("hide-left",$("#leftPanel").classList.contains("collapsed"));
      requestAnimationFrame(fitToScreen);
    });
    $("#toggleRightBtn").addEventListener("click",()=>{
      $("#rightPanel").classList.toggle("collapsed");
      workspace.classList.toggle("hide-right",$("#rightPanel").classList.contains("collapsed"));
      requestAnimationFrame(fitToScreen);
    });

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
      localStorage.setItem("badgeTemplateV4",JSON.stringify(templateSnapshotObject()));
      $("#saveStatus").textContent="已儲存於本機";
    });
    $("#loadTemplateBtn").addEventListener("click",()=>{
      const raw=localStorage.getItem("badgeTemplateV4");
      if(!raw) return alert("目前瀏覽器沒有已儲存的 V4 版型。");
      restoreTemplate(JSON.parse(raw));
      $("#saveStatus").textContent="已載入";
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
      }catch(err){ console.error(err); alert("JSON 版型檔格式錯誤。"); }
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

    window.addEventListener("resize",()=>{ if(state.fitMode) fitToScreen(); });
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
