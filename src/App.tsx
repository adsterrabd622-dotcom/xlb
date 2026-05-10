import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, Info } from 'lucide-react';
import { Toaster, toast } from 'sonner';

type CellData = string | number | null;

function numberToColumn(num: number): string {
  let letRef = '';
  let n = num + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letRef = String.fromCharCode(65 + remainder) + letRef;
    n = Math.floor((n - 1) / 26);
  }
  return letRef;
}

export default function App() {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [sheetData, setSheetData] = useState<CellData[][]>([]);
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number; value: CellData } | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (data) {
        try {
          const wb = XLSX.read(data, { type: 'array' });
          setWorkbook(wb);
          setSheets(wb.SheetNames);
          loadSheet(wb.SheetNames[0], wb);
        } catch (error) {
          toast.error("Failed to parse the file. Please make sure it's a valid Excel file.");
        }
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input so same file can be uploaded again if needed
    e.target.value = '';
  };

  const loadSheet = (sheetName: string, wb = workbook) => {
    if (!wb) return;
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    
    const data = XLSX.utils.sheet_to_json<CellData[]>(ws, { header: 1, defval: '' });
    
    let maxCols = 0;
    data.forEach(row => {
      if (row.length > maxCols) maxCols = row.length;
    });
    
    const rectangularData = data.map(row => {
      const newRow = [...row];
      while(newRow.length < maxCols) {
        newRow.push('');
      }
      return newRow;
    });
    
    setActiveSheet(sheetName);
    setSheetData(rectangularData);
    setSelectedCell(null);
  };

  const handleCellClick = (r: number, c: number, value: CellData) => {
    setSelectedCell({ r, c, value });
    const strValue = String(value).trim();
    if (strValue && strValue !== 'null' && strValue !== 'undefined') {
      navigator.clipboard.writeText(strValue).then(() => {
        toast.success('কপি করা হয়েছে! (Copied)', {
          description: `Cell ${numberToColumn(c)}${r + 1} content copied to clipboard.`,
          duration: 1500,
        });
      }).catch(() => {
        toast.error('Copy failed');
      });
    }
  };

  const resetFile = () => {
    setWorkbook(null);
    setSheets([]);
    setActiveSheet('');
    setSheetData([]);
    setSelectedCell(null);
    setFileName('');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 border border-green-200 bg-green-50 rounded-lg">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight text-slate-800">Excel Viewer</h1>
            {fileName && <p className="text-xs text-slate-500 max-w-[200px] truncate">{fileName}</p>}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           {workbook ? (
             <button 
                onClick={resetFile}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
             >
                <X className="w-4 h-4" />
                <span>Close File</span>
             </button>
           ) : (
             <label className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-sm cursor-pointer transition">
               <Upload className="w-4 h-4" />
               <span>Upload File</span>
               <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
             </label>
           )}
        </div>
      </header>
      
      {workbook ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-start bg-slate-100/80 border-b border-slate-300 px-4 py-3 shrink-0 shadow-sm z-10">
             <div className="flex items-center justify-center bg-white text-slate-600 font-mono text-sm px-3 py-1 rounded shadow-sm border border-slate-300 min-w-[70px] h-[36px]">
               {selectedCell ? `${numberToColumn(selectedCell.c)}${selectedCell.r + 1}` : '-'}
             </div>
             <div className="mx-3 text-slate-400 text-xl font-light h-[36px] flex items-center italic">fx</div>
             <div className="flex-1 bg-white border border-slate-300 shadow-sm rounded px-3 py-1.5 text-sm font-sans min-h-[36px] max-h-[140px] overflow-y-auto flex items-start break-words whitespace-pre-wrap selection:bg-green-200 text-slate-800 custom-scrollbar relative group">
                {!selectedCell ? (
                   <span className="text-slate-400 italic">Click a cell to read its expanded view and copy...</span>
                ) : (
                   <span className="w-full">{selectedCell.value}</span>
                )}
             </div>
          </div>
          
          <div className="flex bg-slate-50 border-b border-slate-200 overflow-x-auto custom-scrollbar shrink-0 px-2 pt-2">
            {sheets.map(sheet => (
              <button 
                 key={sheet}
                 onClick={() => loadSheet(sheet)}
                 className={`px-5 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition border border-b-0 -mb-[1px] ${
                   activeSheet === sheet 
                     ? 'bg-white text-green-700 border-slate-300 relative z-10 block' 
                     : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-200/50'
                 }`}
              >
                 {sheet}
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-auto bg-white relative custom-scrollbar select-none">
            {sheetData.length > 0 ? (
              <table className="border-collapse w-max min-w-full">
                <thead className="sticky top-0 z-20 bg-slate-100 shadow-sm border-b border-slate-300">
                   <tr>
                     <th className="w-12 bg-slate-200 border-r border-slate-300 sticky left-0 z-30 shadow-[1px_0_0_0_#cbd5e1]"></th>
                     {sheetData[0]?.map((_, colIndex) => (
                       <th key={colIndex} className="px-3 py-2 border-r border-slate-300 font-semibold text-xs text-slate-600 min-w-[100px] max-w-[250px] truncate select-none">
                         {numberToColumn(colIndex)}
                       </th>
                     ))}
                   </tr>
                </thead>
                <tbody className="bg-white">
                  {sheetData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-slate-200 hover:bg-slate-50 group">
                      <td className="sticky left-0 z-10 w-12 bg-slate-100 border-r border-slate-300 shadow-[1px_0_0_0_#e2e8f0] text-center text-xs text-slate-500 font-medium group-hover:bg-slate-200/70 transition-colors select-none">
                        {rowIndex + 1}
                      </td>
                      {row.map((cell, colIndex) => {
                        const isSelected = selectedCell?.r === rowIndex && selectedCell?.c === colIndex;
                        return (
                          <td 
                            key={colIndex} 
                            onClick={() => handleCellClick(rowIndex, colIndex, cell)}
                            className={`px-3 py-1.5 border-r border-slate-200 text-sm truncate cursor-copy transition-colors h-[32px] max-w-[200px] ${
                              isSelected 
                                ? 'bg-green-100 !border-r-green-500 shadow-[inset_0_0_0_2px_#22c55e] text-green-900 z-10 relative' 
                                : 'text-slate-700 hover:bg-green-50'
                            }`}
                            title={cell ? "Click to copy" : ""}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <Info className="w-8 h-8 mb-3" />
                <p>This sheet appears to be empty.</p>
              </div>
            )}
            
            {/* Blank space at bottom to allow scrolling past last row easily */}
            <div className="h-16 w-full"></div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50">
          <div className="max-w-md w-full border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center bg-white text-center hover:border-green-500 hover:bg-green-50/20 transition-all duration-300 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-emerald-600"></div>
            <div className="p-4 bg-green-50 border border-green-100 text-green-600 rounded-full mb-6">
              <FileSpreadsheet className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold mb-3 text-slate-800 tracking-tight">Upload Excel File</h2>
            <p className="text-slate-500 text-sm mb-8 max-w-xs leading-relaxed">
              View your spreadsheets directly in the browser. Supports .xlsx, .xls, and .csv formats.
            </p>
            <label className="flex items-center justify-center w-full gap-2 px-6 py-3.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-medium rounded-xl shadow-md shadow-green-600/20 cursor-pointer transition-all">
               <Upload className="w-5 h-5" />
               <span>Choose File (নির্বাচন করুন)</span>
               <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}
      <Toaster position="bottom-right" richColors theme="light" />
    </div>
  );
}
