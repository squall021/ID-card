importScripts("vendor/xlsx-0.20.3.full.min.js", "app-excel.js");

self.onmessage = ({data}) => {
  try { self.postMessage({rows:readWorkbook(self.XLSX, data)}); }
  catch (error) { self.postMessage({error:error.message || "Excel 讀取失敗。"}); }
};
