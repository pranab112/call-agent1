import React from 'react';
import { KnowledgeBase } from '../types';

interface KnowledgePanelProps {
  knowledge: KnowledgeBase;
  setKnowledge: React.Dispatch<React.SetStateAction<KnowledgeBase>>;
  disabled: boolean;
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({ knowledge, setKnowledge, disabled }) => {
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
              <label className="block text-xs font-medium text-slate-400 mb-1">Instructions & Data</label>
              <textarea
                value={knowledge.content}
                onChange={(e) => setKnowledge(prev => ({ ...prev, content: e.target.value }))}
                disabled={disabled}
                className="w-full h-64 bg-slate-900 border border-slate-700 rounded-md px-3 py-3 text-xs text-slate-300 focus:border-purple-500 outline-none resize-none disabled:opacity-50 leading-relaxed custom-scrollbar font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgePanel;