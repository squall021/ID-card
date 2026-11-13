function readWorkbook(xlsx, buffer) {
  const workbook = xlsx.read(buffer, {type:"array", sheets:0});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Excel 檔案沒有可匯入的工作表。");
  return xlsx.utils.sheet_to_json(sheet, {defval:""});
}
