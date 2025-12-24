import React, { useCallback, useState } from 'react';
import { KnowledgeBase } from '../types';

interface KnowledgePanelProps {
  knowledge: KnowledgeBase;
  setKnowledge: React.Dispatch<React.SetStateAction<KnowledgeBase>>;
  disabled: boolean;
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({ knowledge, setKnowledge, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileRead = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setKnowledge(prev => ({
          ...prev,
          content: prev.content + "\n\n--- IMPORTED FILE: " + file.name + " ---\n\n" + text
        }));
      }
    };
    reader.readAsText(file);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach((file: File) => {
         if (file.type === "text/plain" || file.name.endsWith('.md') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
            handleFileRead(file);
         } else {
            alert(`File ${file.name} not supported. Please upload .txt, .md, .json, or .csv`);
         }
      });
    }
  }, [disabled, setKnowledge]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach((file: File) => handleFileRead(file));
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 p-6 w-full md:w-96 overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2 text-white flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configuration
        </h2>
        <p className="text-sm text-slate-400">
          Setup your AI Receptionist and Telephony.
        </p>
      </div>

      <div className="space-y-8">
        
        {/* Section: Office Data */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
             <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
             Data & Knowledge
           </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Company Name</label>
              <input
                type="text"
                value={knowledge.companyName}
                onChange={(e) => setKnowledge(prev => ({ ...prev, companyName: e.target.value }))}
                disabled={disabled}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-purple-500 outline-none disabled:opacity-50"
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                 Instructions & Data ({knowledge.content.length} chars)
              </label>
              
              {/* File Upload Zone */}
              <div 
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`relative mb-2 group border-2 border-dashed rounded-lg p-4 text-center transition-colors ${isDragging ? 'border-purple-400 bg-purple-400/10' : 'border-slate-700 hover:border-slate-500 bg-slate-900'}`}
              >
                 <input 
                    type="file" 
                    multiple 
                    onChange={handleFileInput} 
                    accept=".txt,.md,.json,.csv"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    disabled={disabled}
                 />
                 <div className="pointer-events-none">
                    <svg className="w-6 h-6 text-slate-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <p className="text-[10px] text-slate-400">
                       <span className="text-purple-400 font-bold">Upload Files</span> or drag & drop<br/>
                       (.txt, .csv, .json, .md)
                    </p>
                 </div>
              </div>

              <textarea
                value={knowledge.content}
                onChange={(e) => setKnowledge(prev => ({ ...prev, content: e.target.value }))}
                disabled={disabled}
                placeholder="Or type/paste your data here..."
                className="w-full h-96 bg-slate-900 border border-slate-700 rounded-md px-3 py-3 text-xs text-slate-300 focus:border-purple-500 outline-none resize-none disabled:opacity-50 leading-relaxed custom-scrollbar font-mono"
              />
              <button 
                onClick={() => setKnowledge(prev => ({ ...prev, content: '' }))}
                className="text-[10px] text-red-400 underline hover:text-red-300 self-end mt-1"
                disabled={disabled}
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgePanel;