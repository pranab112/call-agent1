import React, { useState } from 'react';
import KnowledgePanel from './components/KnowledgePanel';
import AgentInterface from './components/AgentInterface';
import { KnowledgeBase, ConnectionState } from './types';

const App: React.FC = () => {
  // Default Knowledge Base
  const [knowledge, setKnowledge] = useState<KnowledgeBase>({
    companyName: "नमस्ते टेक्नोलोजी (Namaste Tech)",
    content: `विवरण:
नमस्ते टेक्नोलोजी नेपालको एक अग्रणी सफ्टवेयर र क्लाउड सेवा प्रदायक कम्पनी हो।

कार्यालय समय:
आइतबार - शुक्रबार: बिहान १०:०० - बेलुका ५:०० बजे सम्म
शनिबार: बिदा

सम्पर्क:
इमेल: support@namastetech.np
फोन: ९८००००००००
ठेगाना: बानेश्वर, काठमाडौँ।

कर्मचारी विवरण:
- राम शर्मा (बिक्री प्रबन्धक): एक्सटेन्सन १०१। हाल मिटिङमा हुनुहुन्छ।
- सीता अर्याल (प्राविधिक प्रमुख): एक्सटेन्सन १०२। उपलब्ध हुनुहुन्छ।
- रिसेप्शन डेस्क: एक्सटेन्सन ०।

प्राय: सोधिने प्रश्नहरू (FAQs):
प्रश्न: पासवर्ड कसरी रिसेट गर्ने?
उत्तर: कृपया हाम्रो वेबसाइट portal.namastetech.np मा जानुहोस् र "Forgot Password" मा क्लिक गर्नुहोस्।

प्रश्न: के तपाईँहरू २४ घण्टा सेवा दिनुहुन्छ?
उत्तर: हामी विशेष ग्राहकहरूलाई मात्र २४ घण्टा सेवा दिन्छौँ। अन्यका लागि कार्यालय समयमा सम्पर्क गर्नुहोस्।

नीतिहरू (Call Handling Policies):
- यदि फोन गर्ने व्यक्ति रिसाएमा, शान्त रहनुहोस् र सीता अर्याल (Ext 102) लाई कल ट्रान्सफर गर्ने प्रस्ताव गर्नुहोस्।
- यदि कसैले राम शर्मा वा "Sales" सँग कुरा गर्न चाहेमा, उहाँको एक्सटेन्सन १०१ मा कल ट्रान्सफर गर्नुहोस्।
- कर्मचारीहरूको व्यक्तिगत मोबाइल नम्बर नदिनुहोस्, सधैँ "transferCall" टुल प्रयोग गर्नुहोस्।`
  });

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-black overflow-hidden">
      {/* Sidebar for Data Config */}
      <div className="hidden md:block h-full z-20 shadow-2xl">
        <KnowledgePanel 
          knowledge={knowledge} 
          setKnowledge={setKnowledge} 
          disabled={false}
        />
      </div>

      {/* Main Agent View */}
      <div className="flex-1 h-full relative">
         <AgentInterface knowledge={knowledge} />
      </div>

      {/* Mobile Drawer Toggle (Simplified for demo) */}
      <div className="md:hidden absolute top-4 right-4 z-50">
        {/* Mobile implementation would go here, omitting for brevity to focus on Core Logic */}
      </div>
    </div>
  );
};

export default App;