import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, Info, Search, TableProperties, Send, Calendar, CheckCircle2, Inbox, Lock, ArrowLeft, Download, FileJson, Trash2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

type CellData = string | number | null;

interface ReceivedFile {
  id: string;
  originalName: string;
  date: string;
  filename: string;
  size: number;
  senderName?: string;
  itemCount?: string;
}

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
  const [copiedCells, setCopiedCells] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [currentDate, setCurrentDate] = useState<string>('');
  
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [itemCount, setItemCount] = useState('');

  const [viewState, setViewState] = useState<'upload' | 'viewer' | 'admin-login' | 'file-box'>('upload');
  const [adminPassword, setAdminPassword] = useState('');
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isAdminViewer, setIsAdminViewer] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (fileName && activeSheet) {
      const key = `copiedCells-${fileName}-${activeSheet}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          setCopiedCells(new Set(JSON.parse(saved)));
        } catch (e) {
          setCopiedCells(new Set());
        }
      } else {
        setCopiedCells(new Set());
      }
    } else {
      setCopiedCells(new Set());
    }
  }, [fileName, activeSheet]);

  useEffect(() => {
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
    };
    setCurrentDate(new Date().toLocaleDateString('en-US', dateOptions));
  }, []);

  const loadReceivedFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const resp = await fetch('/api/files');
      if (resp.ok) {
         const data = await resp.json();
         setReceivedFiles(data);
      }
    } catch (error) {
      console.error("Failed to load files", error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'admin123') {
      setViewState('file-box');
      loadReceivedFiles();
      setAdminPassword('');
    } else {
      toast.error('Incorrect password');
    }
  };

  const loadFileFromBox = async (file: ReceivedFile) => {
    try {
      const response = await fetch(`/api/files/${file.filename}`);
      if (!response.ok) throw new Error("Could not download file");
      
      const blob = await response.blob();
      const f = new File([blob], file.originalName, { type: response.headers.get('content-type') || '' });
      setIsAdminViewer(true);
      processFile(f);
      setViewState('viewer');
    } catch (err) {
      toast.error('Failed to open file');
    }
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    const id = fileToDelete;
    
    try {
      const resp = await fetch(`/api/files/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        toast.success("ফাইলটি মুছে ফেলা হয়েছে (File deleted successfully)");
        setReceivedFiles(prev => prev.filter(f => f.id !== id));
      } else {
        toast.error("File deletion failed");
      }
    } catch (error) {
      toast.error("Failed to delete the file");
    } finally {
      setFileToDelete(null);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Invalid file type. Please upload Excel or CSV formats.');
      return;
    }
    setFileName(file.name);
    setRawFile(file);
    setIsSent(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (data) {
        try {
          const wb = XLSX.read(data, { type: 'array' });
          setWorkbook(wb);
          setSheets(wb.SheetNames);
          loadSheet(wb.SheetNames[0], wb);
          setViewState('viewer');
        } catch (error) {
          toast.error("Failed to parse the file. Please make sure it's a valid Excel file.");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const sendToTelegram = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rawFile) return;
    if (!senderName.trim() || !itemCount.trim()) {
      toast.error('অনুগ্রহ করে প্রেরকের নাম এবং ফাইলের পরিমাণ লিখুন (Please fill all fields)');
      return;
    }
    
    setIsSending(true);
    setIsSendModalOpen(false); // Close modal when starting to send
    
    const formData = new FormData();
    formData.append('file', rawFile);
    formData.append('fileName', fileName);
    formData.append('senderName', senderName);
    formData.append('itemCount', itemCount);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details ? `${data.error} - ${JSON.stringify(data.details)}` : data.error || 'Failed to send file');
      }

      toast.success('ফাইল সফলভাবে পাঠানো হয়েছে! (File sent successfully!)');
      setIsSent(true);
    } catch (error: any) {
      toast.error(error?.message || 'Error occurred while sending the file. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsAdminViewer(false);
      processFile(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setIsAdminViewer(false);
      processFile(file);
    }
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
    setSearchTerm('');
  };

  const filteredDataWithOriginalIndices = React.useMemo(() => {
    return sheetData.map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        if (!searchTerm) return true;
        const lowerSearch = searchTerm.toLowerCase();
        return row.some(cell => String(cell).toLowerCase().includes(lowerSearch));
      });
  }, [sheetData, searchTerm]);

  const clickTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const handleCellClick = (r: number, c: number, value: CellData) => {
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      handleCellDoubleClick(r, c);
      return;
    }

    clickTimeout.current = setTimeout(() => {
      clickTimeout.current = null;
      setSelectedCell({ r, c, value });
      const strValue = String(value).trim();
      if (strValue && strValue !== 'null' && strValue !== 'undefined') {
        navigator.clipboard.writeText(strValue).then(() => {
          setCopiedCells(prev => {
            const next = new Set(prev).add(`${r}-${c}`);
            if (fileName && activeSheet) {
              localStorage.setItem(`copiedCells-${fileName}-${activeSheet}`, JSON.stringify(Array.from(next)));
            }
            return next;
          });
          toast.success('কপি করা হয়েছে! (Copied)', {
            description: `Cell ${numberToColumn(c)}${r + 1} content copied to clipboard.`,
            duration: 1500,
            className: 'font-sans'
          });
        }).catch(() => {
          toast.error('Copy failed');
        });
      }
    }, 250);
  };

  const handleCellDoubleClick = (r: number, c: number) => {
    setCopiedCells(prev => {
      const newSet = new Set(prev);
      newSet.delete(`${r}-${c}`);
      if (fileName && activeSheet) {
        localStorage.setItem(`copiedCells-${fileName}-${activeSheet}`, JSON.stringify(Array.from(newSet)));
      }
      return newSet;
    });
    setSelectedCell(null);
  };

  const resetFile = () => {
    setWorkbook(null);
    setSheets([]);
    setActiveSheet('');
    setSheetData([]);
    setSelectedCell(null);
    setFileName('');
    setRawFile(null);
    setIsSent(false);
    if (isAdminViewer) {
      setViewState('file-box');
    } else {
      setViewState('upload');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f1f5f9] text-slate-900 font-sans selection:bg-indigo-200">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-white shadow-sm shrink-0 z-50 border-b border-slate-200">
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="p-2 sm:p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-md shadow-indigo-600/20">
            <TableProperties className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg sm:text-xl leading-tight text-slate-800 tracking-tight">Excel Manager</h1>
            <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1">
              {fileName ? (
                <p className="text-[10px] sm:text-xs text-indigo-600 font-semibold max-w-[150px] sm:max-w-[250px] truncate bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{fileName}</p>
              ) : (
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Fast & Secure Viewer</p>
              )}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium border-l border-slate-200 pl-3">
                <Calendar className="w-3.5 h-3.5" />
                {currentDate}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
           {viewState === 'viewer' && (
             <AnimatePresence>
               {workbook && (
                 <motion.div 
                   initial={{ opacity: 0, width: 0 }} 
                   animate={{ opacity: 1, width: 'auto' }} 
                   exit={{ opacity: 0, width: 0 }}
                   className="relative flex items-center hidden sm:flex"
                 >
                   <Search className="absolute left-3 w-4 h-4 text-slate-400" />
                   <input 
                     type="text" 
                     placeholder="Search..." 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="pl-9 pr-8 py-2.5 bg-slate-50/50 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 rounded-xl text-sm w-48 focus:w-64 transition-all outline-none text-slate-700 font-medium placeholder:font-normal"
                   />
                   {searchTerm && (
                     <button onClick={() => setSearchTerm('')} className="absolute right-2.5 text-slate-400 hover:text-slate-600 bg-white rounded-full p-0.5 shadow-sm">
                        <X className="w-3.5 h-3.5" />
                     </button>
                   )}
                 </motion.div>
               )}
             </AnimatePresence>
           )}
           
           <AnimatePresence mode="popLayout">
             {viewState === 'viewer' && workbook && (
               <div className="relative flex items-center justify-center">
                 {!isAdminViewer && !isSent && !isSending && (
                   <motion.div 
                     key="send-tooltip"
                     initial={{ opacity: 0, scale: 0.8, y: -10 }}
                     animate={{ opacity: 1, scale: 1, y: 0 }}
                     className="absolute -bottom-[50px] sm:-bottom-[55px] hover:hidden whitespace-nowrap bg-indigo-600 text-white text-sm sm:text-base font-bold py-2 sm:py-2 px-4 sm:px-5 rounded-xl shadow-xl pointer-events-none animate-bounce z-[100]"
                   >
                     ফাইল সেন্ড করুন
                     <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-indigo-600 rotate-45"></div>
                   </motion.div>
                 )}
                 <motion.button 
                    key="send-btn"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => {
                      setItemCount('');
                      setIsSendModalOpen(true);
                    }}
                    disabled={isSending || isSent}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm ${
                      isSent 
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default' 
                        : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 hover:shadow-indigo-600/25 text-white cursor-pointer hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0'
                    }`}
                 >
                    {isSent ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isSending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    <span className="hidden sm:inline">{isSent ? 'Sent!' : isSending ? 'Sending...' : 'Send to Owner'}</span>
                    <span className="inline sm:hidden">{isSent ? 'Sent' : 'Send'}</span>
                 </motion.button>
               </div>
             )}

             {viewState === 'viewer' ? (
               <motion.button 
                  key="close-btn"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={resetFile}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-red-500 text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm border border-slate-200"
               >
                  {isAdminViewer ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isAdminViewer ? 'Back' : 'Close'}</span>
               </motion.button>
             ) : (
               viewState === 'upload' && (
                 <motion.button 
                   key="filebox-btn"
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   onClick={() => setViewState('admin-login')}
                   className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm border border-slate-200/50"
                 >
                   <Inbox className="w-4 h-4" />
                   <span className="hidden sm:inline">File Box</span>
                 </motion.button>
               )
             )}
             
             {(viewState === 'admin-login' || viewState === 'file-box') && (
                <motion.button 
                  key="back-btn"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setViewState('upload')}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white hover:bg-slate-50 text-slate-600 text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm border border-slate-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back</span>
                </motion.button>
             )}
           </AnimatePresence>
        </div>
      </header>
      
      {viewState === 'viewer' && workbook ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          {/* Formula Bar */}
          <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 bg-white border-b border-slate-200/80 shrink-0 z-20">
             <div className="flex items-center justify-center bg-slate-50 text-indigo-700 font-mono text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded border border-indigo-100/80 min-w-[50px] sm:min-w-[60px] shadow-sm font-semibold h-7">
               {selectedCell ? `${numberToColumn(selectedCell.c)}${selectedCell.r + 1}` : '-'}
             </div>
             <div className="hidden sm:block text-slate-300 font-serif italic text-xl font-light select-none">fx</div>
             <div className="flex-1 bg-slate-50/50 border border-slate-200/60 rounded px-2 sm:px-3 py-1.5 text-[12px] sm:text-[13px] font-sans flex items-start break-words whitespace-pre-wrap text-slate-800 shadow-inner max-h-[80px] overflow-y-auto custom-scrollbar min-h-[30px]">
                {!selectedCell ? (
                   <span className="text-slate-400 font-medium opacity-80">Click cell to read content...</span>
                ) : (
                   <span className="w-full text-slate-800 leading-relaxed font-medium">{selectedCell.value}</span>
                )}
             </div>
          </div>
          
          {/* Sheet Tabs */}
          <div className="flex gap-1.5 px-4 sm:px-6 py-2 bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 overflow-x-auto custom-scrollbar shrink-0">
            {sheets.map(sheet => {
              const isActive = activeSheet === sheet;
              return (
                <button 
                   key={sheet}
                   onClick={() => loadSheet(sheet)}
                   className={`relative px-4 py-1.5 text-[13px] font-semibold rounded-lg transition-all whitespace-nowrap focus:outline-none ${
                     isActive ? 'text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                   }`}
                >
                   {isActive && (
                     <motion.div 
                       layoutId="activeTab" 
                       className="absolute inset-0 bg-white rounded-lg border border-slate-200/60" 
                       transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                     />
                   )}
                   <span className="relative z-10">{sheet}</span>
                </button>
              );
            })}
          </div>
          
          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-white relative custom-scrollbar select-none">
            {filteredDataWithOriginalIndices.length > 0 ? (
              <table className="border-collapse w-max min-w-full">
                <thead className="sticky top-0 z-30 bg-slate-200/95 backdrop-blur-sm shadow-sm border-b border-slate-300">
                   <tr>
                     <th className="w-12 bg-slate-200/95 border-r border-slate-300 sticky left-0 z-40 shadow-[1px_0_0_0_#cbd5e1]"></th>
                     {sheetData[0]?.map((_, colIndex) => (
                       <th key={colIndex} className={`px-3 py-1.5 border-r border-slate-300 font-mono text-[11px] font-bold uppercase tracking-widest min-w-[100px] max-w-[300px] truncate select-none transition-colors ${selectedCell?.c === colIndex ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600'}`}>
                         {numberToColumn(colIndex)}
                       </th>
                     ))}
                   </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredDataWithOriginalIndices.map(({row, originalIndex}, idx) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.4), duration: 0.3 }}
                      key={originalIndex} 
                      className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className={`sticky left-0 z-20 w-12 border-r border-slate-300 shadow-[1px_0_0_0_#cbd5e1] text-center text-xs font-semibold group-hover:bg-slate-200/60 transition-colors select-none ${selectedCell?.r === originalIndex ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'}`}>
                        {originalIndex + 1}
                      </td>
                      {row.map((cell, colIndex) => {
                        const isSelected = selectedCell?.r === originalIndex && selectedCell?.c === colIndex;
                        const isCopied = copiedCells.has(`${originalIndex}-${colIndex}`);
                        return (
                          <td 
                            key={colIndex} 
                            onClick={() => handleCellClick(originalIndex, colIndex, cell)}
                            className={`px-3 py-1.5 border-r border-slate-100 text-[13px] truncate cursor-copy transition-all h-[30px] max-w-[250px] whitespace-nowrap ${
                              isCopied
                                ? 'bg-red-500 text-white font-medium z-10 relative'
                                : isSelected 
                                ? 'shadow-[inset_0_0_0_2px_#6366f1] bg-indigo-50/40 text-indigo-950 font-medium z-10 relative' 
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal hover:bg-indigo-50/20'
                            }`}
                            title={cell ? "Click to copy, Double click to unmark" : ""}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <motion.div 
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="flex flex-col items-center justify-center p-12 text-slate-400 mt-16"
              >
                {searchTerm ? (
                  <>
                     <div className="p-4 bg-slate-50 rounded-full mb-4">
                        <Search className="w-8 h-8 text-slate-400" />
                     </div>
                     <p className="text-lg">No results found for "<strong className="text-slate-700">{searchTerm}</strong>"</p>
                     <p className="text-sm mt-2 text-slate-500">Try adjusting your search term to find what you're looking for.</p>
                  </>
                ) : (
                  <>
                     <div className="p-4 bg-slate-50 rounded-full mb-4">
                       <Info className="w-8 h-8 text-slate-400" />
                     </div>
                     <p className="text-lg font-medium text-slate-600">This sheet appears to be empty.</p>
                  </>
                )}
              </motion.div>
            )}
            
            {/* Blank space at bottom to allow scrolling past last row easily */}
            <div className="h-24 w-full"></div>
          </div>
        </motion.div>
      ) : viewState === 'upload' ? (
        <div 
          className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden bg-slate-50/30"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Subtle background decorative shapes */}
          <div className="absolute top-1/4 left-1/4 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-indigo-300/10 rounded-full blur-[80px] sm:blur-3xl -z-10 mix-blend-multiply" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-blue-300/10 rounded-full blur-[80px] sm:blur-3xl -z-10 mix-blend-multiply" />

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={`max-w-xl w-full rounded-[1.5rem] sm:rounded-[2rem] p-8 sm:p-14 flex flex-col items-center text-center transition-all duration-300 relative overflow-hidden ${isDragging ? 'bg-indigo-50/80 shadow-2xl shadow-indigo-600/10 border-2 border-indigo-400 scale-[1.02] backdrop-blur-md' : 'bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-slate-100 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] backdrop-blur-md'}`}
          >
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600"></div>
            
            <AnimatePresence mode="wait">
              <motion.div 
                key={isDragging ? 'dragging' : 'normal'}
                initial={{ scale: 0.8, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, y: -10 }}
                transition={{ duration: 0.4, type: "spring", bounce: 0.4 }}
                className={`p-4 sm:p-6 rounded-full mb-6 sm:mb-8 ${isDragging ? 'bg-indigo-100 text-indigo-600 shadow-inner' : 'bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-sm relative overflow-hidden group'}`}
              >
                {/* Floating particle effect */}
                {!isDragging && (
                  <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-tr from-indigo-100/0 via-indigo-200/40 to-indigo-100/0 rounded-full" 
                  />
                )}
                <motion.div 
                  className="relative"
                  animate={!isDragging ? { y: [0, -4, 0] } : {}} 
                  transition={!isDragging ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : {}}
                >
                  <FileSpreadsheet className="w-12 h-12 sm:w-16 sm:h-16 relative z-10" strokeWidth={1.5} />
                  <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 bg-white rounded-full p-1 sm:p-1.5 shadow-sm border border-slate-100">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-slate-800 tracking-tight">
               {isDragging ? 'Drop it here!' : 'Welcome to Excel Viewer'}
            </h2>
            <p className="text-slate-500 text-[14px] sm:text-[15px] mb-8 sm:mb-10 max-w-sm leading-relaxed font-medium px-4">
              {isDragging ? 'Release to instantly read and format your spreadsheet.' : 'Select a file to securely view it in your browser. You can copy individual cells or send the file to the owner.'}
            </p>
            
            <label className={`group relative flex items-center justify-center w-full sm:w-auto min-w-0 sm:min-w-[240px] gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-600/25 transition-all outline-none focus-within:ring-4 focus-within:ring-indigo-600/20 active:scale-95 ${isDragging ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:-translate-y-1'}`}>
               <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
                 <Upload className="w-5 h-5 opacity-90 group-hover:opacity-100 transition-all duration-300" />
               </motion.div>
               <span className="tracking-wide text-[15px]">Choose File (নির্বাচন করুন)</span>
               <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </motion.div>
        </div>
      ) : viewState === 'admin-login' ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50/50 p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-slate-100"
          >
             <div className="h-2 bg-gradient-to-r from-slate-800 to-slate-900 w-full" />
             <div className="p-6 sm:p-8 pb-8 sm:pb-10">
               <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 border border-slate-200">
                 <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-slate-700" />
               </div>
               <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-1.5 sm:mb-2">Admin Access</h2>
               <p className="text-slate-500 mb-6 sm:mb-8 text-sm">Enter the password to access the File Box</p>
               
               <form onSubmit={handleAdminLogin} className="space-y-4">
                 <div>
                   <input
                     type="password"
                     value={adminPassword}
                     onChange={(e) => setAdminPassword(e.target.value)}
                     placeholder="Enter password..."
                     className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none text-slate-800 transition-all font-medium"
                     autoFocus
                   />
                 </div>
                 <motion.button 
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-slate-900/20"
                 >
                   Access File Box
                 </motion.button>
               </form>
             </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-slate-50/50 overflow-hidden">
          <div className="p-4 sm:p-8 flex-1 overflow-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                 <div className="p-2 sm:p-3 bg-indigo-100 text-indigo-700 rounded-xl sm:rounded-2xl border border-indigo-200">
                   <Inbox className="w-6 h-6 sm:w-7 sm:h-7" />
                 </div>
                 <div>
                   <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Received File Box</h2>
                   <p className="text-slate-500 text-xs sm:text-sm font-medium">All files sent to you are listed below</p>
                 </div>
              </div>

              {isLoadingFiles ? (
                <div className="flex items-center justify-center p-20">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
              ) : receivedFiles.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-16 flex flex-col items-center text-center shadow-sm">
                   <div className="bg-slate-50 p-6 rounded-full mb-6">
                     <Inbox className="w-12 h-12 text-slate-300" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-700 mb-2">Your File Box is empty</h3>
                   <p className="text-slate-500 max-w-sm">No one has sent any files yet. When users upload and send a file from their viewer, it will appear here.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  <AnimatePresence>
                    {receivedFiles.map((file, idx) => {
                      const dateObj = new Date(file.date);
                      const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const displayTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                      const sizeInKb = Math.round(file.size / 1024);
                      
                      return (
                        <motion.div 
                          key={file.id}
                          initial={{ opacity: 0, y: 15, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          whileHover={{ y: -2, scale: 1.01 }}
                          transition={{ delay: idx * 0.05, duration: 0.3 }}
                          className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all group"
                        >
                          <div className="flex items-center gap-4">
                             <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
                               <FileJson className="w-6 h-6" />
                             </div>
                             <div>
                               <h4 className="font-semibold text-slate-800 text-[15px] truncate max-w-[280px]" title={file.originalName}>
                                 {file.originalName}
                               </h4>
                               <div className="flex gap-2.5 items-center mt-1.5 text-xs text-slate-500 font-medium flex-wrap">
                                 <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {displayDate} at {displayTime}</span>
                                 <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                 <span>{sizeInKb} KB</span>
                                 <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                 <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">👤 {file.senderName || 'Unknown'}</span>
                                 <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">🔢 {file.itemCount || '0'}</span>
                               </div>
                             </div>
                          </div>
                          
                          <div className="hidden sm:flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            <motion.button 
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={(e) => { e.stopPropagation(); setFileToDelete(file.id); }}
                              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
                              title="Delete file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </motion.button>
                            <motion.button 
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => {
                                 window.open(`/api/files/${file.filename}`, '_blank');
                              }}
                              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 flex-1"
                            >
                              <Download className="w-4 h-4" /> Download
                            </motion.button>
                            <motion.button 
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => loadFileFromBox(file)}
                              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 flex-1"
                            >
                              <TableProperties className="w-4 h-4" /> Open
                            </motion.button>
                          </div>

                          <div className="flex sm:hidden w-full gap-2 mt-2 pt-4 border-t border-slate-100">
                             <motion.button 
                               whileTap={{ scale: 0.95 }}
                               onClick={(e) => { e.stopPropagation(); setFileToDelete(file.id); }}
                               className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg flex items-center justify-center flex-shrink-0"
                               title="Delete file"
                             >
                                <Trash2 className="w-4 h-4" />
                             </motion.button>
                             <motion.button 
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                 window.open(`/api/files/${file.filename}`, '_blank');
                              }}
                              className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                             >
                                <Download className="w-4 h-4" /> DL
                             </motion.button>
                             <motion.button 
                               whileTap={{ scale: 0.95 }}
                               onClick={() => loadFileFromBox(file)}
                               className="flex-1 py-2.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                             >
                               <TableProperties className="w-4 h-4" /> View
                             </motion.button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      <AnimatePresence>
        {isSendModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-bold text-slate-800">Send to Owner</h3>
                  <button 
                    onClick={() => setIsSendModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={sendToTelegram} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 text-left">Sender Name (প্রেরকের নাম)</label>
                    <input
                      type="text"
                      required
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5 text-left">File Items / Quantity (ফাইলের পরিমাণ)</label>
                    <input
                      type="text"
                      required
                      value={itemCount}
                      onChange={(e) => setItemCount(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSending}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                    >
                      {isSending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" /> Send File
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {fileToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Delete File?</h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">Are you sure you want to delete this file from the box? This action cannot be undone.</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setFileToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteFile}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-red-600/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster position="bottom-right" richColors theme="light" closeButton style={{ fontFamily: 'Inter, sans-serif' }} />
    </div>
  );
}
