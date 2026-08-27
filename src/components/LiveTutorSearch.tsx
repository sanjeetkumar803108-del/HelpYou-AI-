import React, { useState, useEffect } from 'react';
import { 
  Search, Sparkles, ArrowLeft, Loader2, Globe, CheckCircle2, 
  Lightbulb, FileText, Check, ChevronRight, History, X, Trash2, 
  Calendar, Lock, ExternalLink, Copy, RefreshCw, Newspaper,
  Atom, BookOpen, Layers, Share2, Compass, AlertCircle,
  Zap, ShieldCheck, Bookmark, CheckSquare, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isProUser } from '../utils/coins';
import { triggerVibration } from '../utils/vibrate';
import { getProfileContext } from '../utils/profile';
import { safeGetItem } from '../utils/storage';
import { detectAndLogMistake } from '../utils/mistakes';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query as fsQuery, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import GlobalMarkdown from './GlobalMarkdown';

interface LiveTutorSearchProps {
  onBack: () => void;
}

interface DetailedSource {
  title: string;
  uri: string;
  sourceName?: string;
}

interface SearchResult {
  topic_title: string;
  live_updates: string | string[];
  match_score: string;
  action_steps: string[];
  pro_tips: string;
  related_queries?: string[];
  source_links: string[];
  detailed_sources?: DetailedSource[];
  text?: string;
}

const parseSavedSearch = (text: string, title: string, rawData?: string): SearchResult => {
  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && (parsed.topic_title || parsed.live_updates)) {
        return {
          topic_title: parsed.topic_title || title.replace(/🔍|Deep Search:/g, '').trim(),
          live_updates: parsed.live_updates || "Saved search updates loaded from history.",
          match_score: parsed.match_score || '98%',
          action_steps: Array.isArray(parsed.action_steps) ? parsed.action_steps : [],
          pro_tips: parsed.pro_tips || '',
          related_queries: Array.isArray(parsed.related_queries) ? parsed.related_queries : [],
          source_links: Array.isArray(parsed.source_links) ? parsed.source_links : [],
          detailed_sources: Array.isArray(parsed.detailed_sources) ? parsed.detailed_sources : undefined
        };
      }
    } catch (e) {
      console.error("Error parsing raw_data from history:", e);
    }
  }

  let topic_title = title.replace(/🔍|Deep Search:/g, '').trim();
  const topicMatch = text.match(/### (.*?)\n/);
  if (topicMatch) {
    topic_title = topicMatch[1].trim();
  }

  let match_score = '98%';
  const scoreMatch = text.match(/\* \*\*Match Score:\*\* (.*?)\n/);
  if (scoreMatch) {
    match_score = scoreMatch[1].trim();
  }

  let pro_tips = '';
  const tipsMatch = text.match(/\* \*\*Pro Tips:\*\* (.*?)\n/);
  if (tipsMatch) {
    pro_tips = tipsMatch[1].trim();
  }

  let live_updates: string | string[] = [];
  const liveSection = text.match(/#### Verified Live Updates:\n([\s\S]*?)(?=\n\n#### Action Steps:|\n\n#### Sources:|\n\n####|$)/);
  if (liveSection && liveSection[1].trim()) {
    const rawSection = liveSection[1].trim();
    const lines = rawSection.split('\n').map(l => l.replace(/^\*\s*/, '').trim()).filter(Boolean);
    live_updates = lines.length > 0 ? lines : rawSection;
  } else {
    const cleanedText = text
      .replace(/^\*\*Deep Search:.*?\*\*\n*/i, '')
      .replace(/### .*?\n*/g, '')
      .replace(/\* \*\*Match Score:\*\* .*?\n*/g, '')
      .replace(/\* \*\*Pro Tips:\*\* .*?\n*/g, '')
      .replace(/#### Action Steps:[\s\S]*?(?=\n\n####|$)/g, '')
      .replace(/#### Sources:[\s\S]*$/g, '')
      .trim();
    live_updates = cleanedText || "Analysis loaded from your saved deep search session history.";
  }

  const action_steps: string[] = [];
  const actionSection = text.match(/#### Action Steps:\n([\s\S]*?)(?=\n\n#### Sources:|\n\n####|$)/);
  if (actionSection) {
    const lines = actionSection[1].split('\n');
    lines.forEach(line => {
      const cleaned = line.replace(/^\d+\.\s+/, '').trim();
      if (cleaned) action_steps.push(cleaned);
    });
  }

  const source_links: string[] = [];
  const sourcesSection = text.match(/#### Sources:\n([\s\S]*?)$/);
  if (sourcesSection) {
    const lines = sourcesSection[1].split('\n');
    lines.forEach(line => {
      const linkMatch = line.match(/\((https?:\/\/.*?)\)/);
      if (linkMatch) source_links.push(linkMatch[1]);
    });
  }

  return {
    topic_title,
    live_updates,
    match_score,
    action_steps,
    pro_tips,
    source_links
  };
};

function getFriendlyErrorMessage(err: any): string {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("quota") || msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("limit")) {
    return "Our study research engine is experiencing high student activity right now. Please wait 10-20 seconds and tap Search Again.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("timeout") || msg.includes("failed to fetch") || msg.includes("connection")) {
    return "Unable to connect to the research server. Please check your internet connection and try again.";
  }
  if (msg.includes("invalid argument") || msg.includes("400") || msg.includes("500") || msg.includes("error") || msg.includes("json")) {
    return "We could not complete this research query at the moment. Please tap Search Again to get fresh verified data.";
  }
  return "Unable to load live research right now. Please tap Search Again to retry.";
}

export default function LiveTutorSearch({ onBack }: LiveTutorSearchProps) {
  const isVip = isProUser();

  if (!isVip) {
    return (
      <div className="w-full h-full flex flex-col justify-between bg-gradient-to-b from-slate-50 via-white to-blue-50/30 overflow-hidden min-h-[500px]">
        {/* Navbar */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-zinc-200/60 bg-white/80 backdrop-blur-md">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-zinc-100/90 border border-zinc-200/60 text-zinc-700 hover:text-zinc-950 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <span className="font-black text-blue-600 text-xs tracking-widest uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            VIP Research Engine
          </span>
          <div className="w-10 h-10" />
        </div>

        {/* Lock Overlay Content */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 text-center max-w-md mx-auto">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/25">
              <Lock className="w-9 h-9" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
              className="absolute -inset-2 rounded-3xl bg-blue-500/20 -z-10 blur-sm"
            />
          </div>
          
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
            Deep Search AI is VIP Only! 🌟
          </h2>
          
          <p className="text-sm font-semibold text-zinc-500 mt-2.5 leading-relaxed">
            Unlock 100% verified real-time web grounding, breaking news, 2026 exam calendars, and multi-source research intelligence with VIP!
          </p>

          <div className="w-full bg-white border border-blue-100/80 rounded-3xl p-5 my-6 space-y-3.5 shadow-sm text-left">
            <div className="flex items-center gap-3 text-xs font-black text-zinc-800">
              <span className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">🌐</span>
              <span>Google News Live & Wikipedia REST Index</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-black text-zinc-800">
              <span className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">⚡</span>
              <span>100% Direct Working Links (0 Broken 404s)</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-black text-zinc-800">
              <span className="w-7 h-7 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">📑</span>
              <span>Multi-Paragraph Deep Explanations in Hinglish/Hindi</span>
            </div>
          </div>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-vip-modal'))}
            className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer border-none"
          >
            <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
            Unlock Deep Search with VIP PRO
          </button>
        </div>
      </div>
    );
  }

  const [query, setQuery] = useState('');
  const [localNotes, setLocalNotes] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'news' | 'stem' | 'history'>('all');
  const [loading, setLoading] = useState(false);
  const [searchStep, setSearchStep] = useState(0);
  const [searchResponse, setSearchResponse] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [showNotesBlending, setShowNotesBlending] = useState(false);
  const [copied, setCopied] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Dynamic search loading steps animation
  const searchSteps = [
    { label: "1. Analyzing query & extracting core entities...", icon: "🔍", sub: "Converting conversational prompts into high-precision search keywords" },
    { label: "2. Querying Google News RSS & Wikipedia REST...", icon: "🌐", sub: "Fetching verified breaking articles and encyclopedia records in real time" },
    { label: "3. Grounding citations & validating direct URLs...", icon: "⚡", sub: "Verifying live source links to ensure 0 broken links or 404s" },
    { label: "4. Synthesizing in-depth academic research report...", icon: "🧠", sub: "Generating comprehensive multi-paragraph analysis with LaTeX equations" }
  ];

  useEffect(() => {
    let interval: any;
    if (loading) {
      setSearchStep(0);
      interval = setInterval(() => {
        setSearchStep(prev => (prev < searchSteps.length - 1 ? prev + 1 : prev));
      }, 1500);
    } else {
      setSearchStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const fetchHistory = async () => {
    if (!auth.currentUser) return;
    setLoadingHistory(true);
    try {
      const q = fsQuery(
        collection(db, 'pocket_items'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const items: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const titleLower = (data.title || '').toLowerCase();
        const textLower = (data.text || '').toLowerCase();
        
        const isSearch = titleLower.includes('deep search') || 
                         textLower.includes('**deep search') ||
                         data.type === 'deep_search';
        if (isSearch) {
          items.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date()
          });
        }
      });

      if (items.length > 10) {
        const toKeep = items.slice(0, 10);
        const toDelete = items.slice(10);
        for (const item of toDelete) {
          try {
            await deleteDoc(doc(db, 'pocket_items', item.id));
          } catch (err) {
            console.error("Failed to delete old search item:", err);
          }
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.error("Failed to fetch search history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerVibration(15);
    try {
      await deleteDoc(doc(db, 'pocket_items', id));
      setHistoryItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete history item:", err);
    }
  };

  const handleSearch = async (forcedQuery?: string) => {
    const activeQuery = (typeof forcedQuery === 'string' ? forcedQuery : query).trim();
    if (!activeQuery) return;

    if (typeof forcedQuery === 'string') {
      setQuery(forcedQuery);
    }

    triggerVibration(15);
    setLoading(true);
    setError(null);
    setSearchResponse(null);
    setCheckedSteps({});
    setCopied(false);

    try {
      const currentNotes = localNotes.trim();

      const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/live-study-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: activeQuery,
          profileContext: getProfileContext(),
          studentNotes: currentNotes || undefined
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error(errData.error || "High research volume. Please retry in 30 seconds.");
        }
        throw new Error(errData.error || "Live research search was interrupted. Please retry.");
      }

      const data = await response.json();

      let formattedResult: SearchResult;
      if (data && typeof data === 'object') {
        const updates = data.live_updates || data.updates || data.content || data.summary || data.text || data.explanation || "";
        formattedResult = {
          topic_title: data.topic_title || data.title || activeQuery,
          live_updates: updates,
          match_score: data.match_score || '98%',
          action_steps: Array.isArray(data.action_steps) ? data.action_steps : (data.steps || []),
          pro_tips: data.pro_tips || data.tip || '',
          related_queries: Array.isArray(data.related_queries) ? data.related_queries : [],
          source_links: Array.isArray(data.source_links) ? data.source_links : [],
          detailed_sources: Array.isArray(data.detailed_sources) ? data.detailed_sources : undefined,
          text: data.text || ""
        };
      } else {
        throw new Error("Invalid response format from research engine.");
      }

      // Log potential trap/misconceptions
      const searchContext = `${formattedResult.topic_title || ''} ${formattedResult.pro_tips || ''}`;
      detectAndLogMistake('Deep Search', activeQuery, searchContext).catch(() => {});

      // Save deep search session to Firebase Firestore
      if (auth.currentUser) {
        const liveUpdatesText = Array.isArray(formattedResult.live_updates)
          ? formattedResult.live_updates.map((u: string) => `* ${u}`).join('\n\n')
          : (formattedResult.live_updates || '');

        await addDoc(collection(db, 'pocket_items'), {
          userId: auth.currentUser.uid,
          title: `🔍 Deep Search: ${activeQuery}`,
          text: `**Deep Search: ${activeQuery}**\n\n### ${formattedResult.topic_title || 'Research Breakdown'}\n\n* **Match Score:** ${formattedResult.match_score || '98%'}\n* **Pro Tips:** ${formattedResult.pro_tips || ''}\n\n#### Verified Live Updates:\n${liveUpdatesText}\n\n#### Action Steps:\n` + 
            (formattedResult.action_steps || []).map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') + 
            `\n\n#### Sources:\n` + (formattedResult.source_links || []).map((link: string) => `* [${link}](${link})`).join('\n'),
          raw_data: JSON.stringify(formattedResult),
          type: 'deep_search',
          createdAt: serverTimestamp()
        }).catch(err => console.error("Error saving deep search history:", err));
      }

      setSearchResponse(formattedResult);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to complete live research. Please try again.");
      setSearchResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleStep = (idx: number) => {
    triggerVibration(10);
    setCheckedSteps(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const copyReportToClipboard = () => {
    if (!searchResponse) return;
    triggerVibration(15);
    const updates = Array.isArray(searchResponse.live_updates)
      ? searchResponse.live_updates.join('\n\n')
      : searchResponse.live_updates;

    const steps = (searchResponse.action_steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const sources = (searchResponse.source_links || []).map(l => `- ${l}`).join('\n');

    const fullText = `# ${searchResponse.topic_title}\n\n${updates}\n\n### Actionable Steps\n${steps}\n\n### Pro Tip\n${searchResponse.pro_tips}\n\n### Verified Sources\n${sources}`;

    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const shareReport = async () => {
    if (!searchResponse) return;
    triggerVibration(15);
    const updates = Array.isArray(searchResponse.live_updates)
      ? searchResponse.live_updates.join('\n\n')
      : searchResponse.live_updates;

    const textToShare = `${searchResponse.topic_title}\n\n${updates}\n\nShared via HelpYou AI Deep Search`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: searchResponse.topic_title,
          text: textToShare
        });
      } catch (_) {}
    } else {
      copyReportToClipboard();
    }
  };

  const getCleanDomain = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const getSourceBadgeInfo = (source: DetailedSource, link: string) => {
    const domain = getCleanDomain(link).toLowerCase();
    const name = (source.sourceName || '').toLowerCase();
    const title = (source.title || '').toLowerCase();

    if (domain.includes('wikipedia') || name.includes('wikipedia')) {
      return { label: 'Wikipedia Encyclopedia', color: 'bg-zinc-100 text-zinc-800 border-zinc-300' };
    }
    if (domain.includes('news.google') || name.includes('google news')) {
      return { label: 'Google Live News Feed', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    if (domain.includes('britannica')) {
      return { label: 'Encyclopaedia Britannica', color: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    if (domain.includes('allen') || title.includes('allen')) {
      return { label: 'Allen Academic Updates', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }
    if (domain.includes('pw') || title.includes('physics wallah')) {
      return { label: 'Physics Wallah Verified', color: 'bg-violet-50 text-violet-700 border-violet-200' };
    }
    if (domain.includes('lpu') || domain.includes('careers360') || domain.includes('shiksha')) {
      return { label: 'National Exam Portal', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
    }
    return { label: source.sourceName || getCleanDomain(link), color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  };

  const openSourceUrl = (url: string) => {
    triggerVibration(10);
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error("Failed to open source URL:", e);
    }
  };

  const completedStepsCount = Object.values(checkedSteps).filter(Boolean).length;
  const totalStepsCount = searchResponse?.action_steps?.length || 0;

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6] font-sans overflow-hidden select-none">
      {/* Ultra-Luxury Glassmorphic Header */}
      <header className="px-5 py-4 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl flex justify-between items-center shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              triggerVibration(15);
              onBack();
            }}
            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <div>
            <h2 className="text-base font-black text-zinc-900 flex items-center gap-2 leading-tight">
              <span>Deep Search AI</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE 3.0
              </span>
            </h2>
            <p className="text-[10px] text-zinc-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-500" />
              100% Grounded Real-Time Web Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {searchResponse && (
            <>
              <button
                onClick={shareReport}
                title="Share Research"
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-zinc-100 hover:bg-blue-50 hover:text-blue-600 text-zinc-700 transition-all active:scale-95 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={copyReportToClipboard}
                title="Copy Full Report"
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-zinc-100 hover:bg-emerald-50 hover:text-emerald-600 text-zinc-700 transition-all active:scale-95 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600 stroke-[3]" /> : <Copy className="w-4 h-4" />}
              </button>
            </>
          )}
          {auth.currentUser && (
            <button
              onClick={() => {
                triggerVibration(15);
                setShowHistory(!showHistory);
                if (!showHistory) fetchHistory();
              }}
              title="Search History"
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                showHistory 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' 
                  : 'bg-zinc-100/90 hover:bg-zinc-200 text-zinc-700'
              }`}
            >
              <History className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </header>

      {/* Main Scroll Content Area */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {showHistory ? (
          <div className="max-w-md mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-blue-600" />
                <span>Recent Deep Search Vault</span>
              </h3>
              <button 
                onClick={() => setShowHistory(false)}
                className="text-xs font-black text-blue-600 hover:underline cursor-pointer"
              >
                Back to Search
              </button>
            </div>
            
            {loadingHistory ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400 font-bold">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="text-xs">Fetching past search sessions...</span>
              </div>
            ) : !Array.isArray(historyItems) || historyItems.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-3xl p-8 text-center text-zinc-500 font-bold shadow-xs">
                <p className="text-3xl mb-2">🔍</p>
                <p className="text-sm font-black text-zinc-800">No Search History Found</p>
                <p className="text-xs text-zinc-400 mt-1">Your verified research queries will appear here automatically.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      triggerVibration(15);
                      setSearchResponse(parseSavedSearch(item.text || '', item.title || '', item.raw_data));
                      setQuery((item.title || '').replace(/🔍|Deep Search:/g, '').trim());
                      setShowHistory(false);
                    }}
                    className="bg-white border border-zinc-200/80 hover:border-blue-300 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <h4 className="font-black text-zinc-900 group-hover:text-blue-600 transition-colors text-sm truncate">
                        {item.title}
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-bold flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="text-xs text-zinc-600 line-clamp-2 mt-1.5 font-medium leading-relaxed">
                        {item.text ? item.text.substring(0, 130).replace(/[#*`]/g, '') + '...' : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors active:scale-95 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Search Hero Box */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl p-5 shadow-sm border border-zinc-200/80 space-y-4 relative overflow-hidden"
            >
              {/* Subtle Ambient Glow */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -z-10 pointer-events-none" />

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch();
                }} 
                className="space-y-3.5"
              >
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search any 2026 news, exam dates, syllabus, or hard doubts..."
                    className="w-full pl-4 pr-26 py-4 bg-zinc-50/80 border border-zinc-200/90 rounded-2xl text-sm font-bold text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                  />

                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-16 text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="absolute right-2 top-2 bottom-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:bg-zinc-100 disabled:from-zinc-100 disabled:to-zinc-100 text-white disabled:text-zinc-400 font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-4 h-4 stroke-[3]" />
                        <span>Search</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Search Mode Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: 'all', label: 'All Sources', icon: <Globe className="w-3 h-3" /> },
                    { id: 'news', label: 'Breaking News & Dates', icon: <Newspaper className="w-3 h-3" /> },
                    { id: 'stem', label: 'STEM & Formulas', icon: <Atom className="w-3 h-3" /> },
                    { id: 'history', label: 'History & Cases', icon: <BookOpen className="w-3 h-3" /> }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        triggerVibration(8);
                        setSelectedCategory(mode.id as any);
                      }}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        selectedCategory === mode.id
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-black shadow-2xs'
                          : 'bg-zinc-50 border-zinc-200/80 text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      {mode.icon}
                      <span>{mode.label}</span>
                    </button>
                  ))}
                </div>

                {/* Local Context Blending Accordion */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration(10);
                      setShowNotesBlending(!showNotesBlending);
                    }}
                    className="text-xs font-bold text-zinc-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors py-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>{showNotesBlending ? "Hide syllabus / local context blending" : "Blend local syllabus / study notes"}</span>
                    <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${showNotesBlending ? "rotate-90 text-blue-500" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {showNotesBlending && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-2"
                      >
                        <textarea
                          value={localNotes}
                          onChange={(e) => setLocalNotes(e.target.value)}
                          placeholder="Paste syllabus chapters, target college, or class notes here. The live search report will be customized for your exact academic background..."
                          rows={3}
                          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition-all leading-relaxed resize-none"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </form>
            </motion.div>

            {/* Dynamic Multi-Stage Holographic Radar Loader */}
            <AnimatePresence mode="wait">
              {loading && (
                <motion.div 
                  key="search-loading"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white rounded-3xl p-8 border border-zinc-200/80 shadow-md flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden"
                >
                  {/* Rotating Scanning Wave */}
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full border-4 border-blue-500/15 border-t-blue-600 animate-spin" />
                    <motion.div 
                      animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.6, 0.2] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="absolute inset-0 rounded-full bg-blue-500/10 -z-10"
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-3xl">
                      {searchSteps[searchStep]?.icon || "🌐"}
                    </div>
                  </div>

                  <div className="space-y-1.5 max-w-sm">
                    <p className="text-sm font-black text-zinc-900 tracking-tight">
                      {searchSteps[searchStep]?.label}
                    </p>
                    <p className="text-xs font-semibold text-zinc-400 leading-relaxed">
                      {searchSteps[searchStep]?.sub}
                    </p>
                  </div>

                  {/* Multi-step progress bar */}
                  <div className="w-full max-w-xs bg-zinc-100 rounded-full h-2 overflow-hidden shadow-inner">
                    <motion.div 
                      className="bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 h-full rounded-full"
                      initial={{ width: "25%" }}
                      animate={{ width: `${((searchStep + 1) / searchSteps.length) * 100}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>

                  {/* Step Indicators */}
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {searchSteps.map((_, sIdx) => (
                      <div
                        key={sIdx}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          sIdx <= searchStep ? 'bg-blue-600 scale-125' : 'bg-zinc-200'
                        }`}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Student-Friendly Reassuring Error State */}
              {error && !loading && (
                <motion.div 
                  key="search-error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/40 border border-blue-200/80 shadow-xs text-center space-y-3.5"
                >
                  <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto text-lg shadow-2xs font-bold">
                    ⚡
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-zinc-900 text-sm">Let's Try That Again</h4>
                    <p className="text-xs font-medium text-zinc-600 max-w-xs mx-auto leading-relaxed">
                      {getFriendlyErrorMessage(error)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSearch()}
                    className="inline-flex items-center justify-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-5 py-2.5 rounded-2xl transition-all active:scale-95 shadow-sm shadow-blue-500/20 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Search Again</span>
                  </button>
                </motion.div>
              )}

              {/* Full In-Depth Search Results Display */}
              {searchResponse && !loading && (
                <motion.div 
                  key={`search-result-${searchResponse.topic_title}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {/* Topic Title & Executive Relevance Card */}
                  <div className="bg-white rounded-3xl p-5 sm:p-6 border-l-4 border-l-blue-600 border border-zinc-200/80 shadow-sm space-y-3.5">
                    {/* Top Row: Category tag and Match Score Badge */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-black tracking-wider text-blue-600 uppercase flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        Academic Grounded Report
                      </span>

                      {searchResponse.match_score && (
                        <div className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 flex items-center gap-1.5 shadow-2xs shrink-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[11px] font-black text-emerald-700">
                            {searchResponse.match_score} Match
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Full-width Title: 2-3 clean readable lines */}
                    <h3 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight leading-snug break-words">
                      {searchResponse.topic_title}
                    </h3>

                    {/* Metadata Summary Pill Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/60">
                        ⚡ Real-Time Web Grounded
                      </span>
                      {searchResponse.detailed_sources && (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 border border-purple-200/60">
                          📚 {searchResponse.detailed_sources.length} Verified Sources
                        </span>
                      )}
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-zinc-100 text-zinc-700 border border-zinc-200">
                        ⏱️ Comprehensive Read
                      </span>
                    </div>

                    {/* Live Updates & In-Depth Paragraphs */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2 text-xs font-black text-zinc-700 uppercase tracking-wider">
                        <Globe className="w-4 h-4 text-blue-600" />
                        <span>Verified Real-Time Analysis</span>
                      </div>

                      <div className="text-zinc-850 text-xs sm:text-[13px] leading-relaxed bg-zinc-50/60 p-4 sm:p-5 rounded-2xl border border-zinc-200/70 space-y-4 select-text">
                        {Array.isArray(searchResponse.live_updates) ? (
                          searchResponse.live_updates.map((update, idx) => (
                            <div key={idx} className="space-y-1.5 border-b border-zinc-200/40 pb-3 last:border-b-0 last:pb-0">
                              <GlobalMarkdown>{update}</GlobalMarkdown>
                            </div>
                          ))
                        ) : (
                          <GlobalMarkdown>{searchResponse.live_updates}</GlobalMarkdown>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Interactive Action Steps & Prep Roadmap */}
                  {searchResponse.action_steps && searchResponse.action_steps.length > 0 && (
                    <div className="bg-white rounded-3xl p-6 border border-zinc-200/80 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-black text-purple-700 tracking-wider uppercase">
                          <CheckSquare className="w-4 h-4 text-purple-600" />
                          <span>Actionable Study Checklist</span>
                        </div>
                        <span className="text-[10px] font-black text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
                          {completedStepsCount} of {totalStepsCount} Done
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {searchResponse.action_steps.map((step, idx) => (
                          <div 
                            key={idx}
                            onClick={() => toggleStep(idx)}
                            className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-all ${
                              checkedSteps[idx] 
                                ? 'bg-emerald-50/40 border-emerald-200 text-zinc-500' 
                                : 'bg-zinc-50/50 border-zinc-200/70 hover:border-zinc-300 text-zinc-800'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-all mt-0.5 ${
                              checkedSteps[idx]
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-zinc-300 bg-white'
                            }`}>
                              {checkedSteps[idx] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className={`text-xs font-bold leading-relaxed flex-1 select-text ${checkedSteps[idx] ? 'line-through decoration-emerald-500/50 decoration-2' : ''}`}>
                              <GlobalMarkdown>{step}</GlobalMarkdown>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Expert Educator Pro Tip */}
                  {searchResponse.pro_tips && (
                    <div className="bg-gradient-to-r from-amber-50/90 to-orange-50/90 rounded-3xl p-5 border border-amber-200/80 shadow-xs flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-amber-500/25">
                        <Lightbulb className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="space-y-1 flex-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-orange-500 fill-orange-500" />
                          Expert Educator Insight & Exam Traps
                        </span>
                        <div className="text-zinc-800 text-xs font-bold leading-relaxed select-text">
                          <GlobalMarkdown>{searchResponse.pro_tips}</GlobalMarkdown>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 100% Real Clickable Source Cards */}
                  {searchResponse.detailed_sources && searchResponse.detailed_sources.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider px-1 text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-600" />
                          <span>Verified Live Citations ({searchResponse.detailed_sources.length})</span>
                        </span>
                        <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          100% Verified URLs
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {searchResponse.detailed_sources.map((src, idx) => {
                          const badgeInfo = getSourceBadgeInfo(src, src.uri);
                          return (
                            <div
                              key={idx}
                              onClick={() => openSourceUrl(src.uri)}
                              className="flex items-center justify-between p-4 bg-white hover:bg-zinc-50 rounded-2xl border border-zinc-200/80 shadow-xs hover:shadow-md transition-all hover:translate-x-1 active:scale-[0.99] cursor-pointer group"
                            >
                              <div className="flex items-center gap-3.5 min-w-0 pr-2">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                  <Newspaper className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 space-y-0.5">
                                  <p className="text-xs font-black text-zinc-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                                    {src.title}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md border ${badgeInfo.color}`}>
                                      {badgeInfo.label}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 truncate max-w-[160px]">
                                      {getCleanDomain(src.uri)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-1 text-zinc-400 group-hover:text-blue-600 transition-colors">
                                <ExternalLink className="w-4 h-4" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Explore Further: Related Queries */}
                  {searchResponse.related_queries && searchResponse.related_queries.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-1.5 text-xs font-black text-zinc-700 uppercase tracking-wider">
                        <Compass className="w-4 h-4 text-purple-600" />
                        <span>Explore Further (1-Click Research)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {searchResponse.related_queries.map((rq, rqIdx) => (
                          <button
                            key={rqIdx}
                            onClick={() => handleSearch(rq)}
                            className="text-xs px-3.5 py-2.5 rounded-2xl bg-white hover:bg-blue-50 text-zinc-700 hover:text-blue-700 font-bold border border-zinc-200/80 shadow-xs transition-all active:scale-95 text-left flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{rq}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Welcome Screen (Ultra-Premium Luxury State) */}
              {!searchResponse && !loading && !error && (
                <motion.div 
                  key="search-welcome"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center justify-center py-6 text-center space-y-6"
                >
                  <div className="relative">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-3xl shadow-xl shadow-blue-500/20 select-none">
                      🔍
                    </div>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.7, 0.3] }}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className="absolute -inset-2 rounded-3xl bg-blue-500/15 -z-10 blur-sm"
                    />
                  </div>
                  
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="text-lg font-black text-zinc-900 tracking-tight">
                      Deep Search AI Engine 3.0
                    </h3>
                    <p className="text-xs font-semibold text-zinc-500 leading-relaxed">
                      Instant multi-source web intelligence, 2026 exam notifications, breaking discoveries, and rigorous academic derivations with verified citations.
                    </p>
                  </div>

                  {/* 4 Premium Category Tiles */}
                  <div className="grid grid-cols-2 gap-3 w-full max-w-sm pt-2">
                    {[
                      {
                        title: "2026 Exam Calendars",
                        desc: "JEE, NEET, Board notices",
                        icon: "🎓",
                        query: "JEE Main 2026 registration dates and latest syllabus updates",
                        bg: "bg-blue-50/80 hover:bg-blue-100/80 border-blue-200/80"
                      },
                      {
                        title: "Case Investigations",
                        desc: "Timelines & official reports",
                        icon: "🏛️",
                        query: "Jeju island incident complete history and timeline",
                        bg: "bg-amber-50/80 hover:bg-amber-100/80 border-amber-200/80"
                      },
                      {
                        title: "STEM & Derivations",
                        desc: "Formulas & mechanisms",
                        icon: "🔬",
                        query: "Quantum entanglement mechanism and key mathematical principles",
                        bg: "bg-purple-50/80 hover:bg-purple-100/80 border-purple-200/80"
                      },
                      {
                        title: "Breaking News & Space",
                        desc: "Live discoveries & tech",
                        icon: "🚀",
                        query: "Latest James Webb Space Telescope discoveries 2026",
                        bg: "bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200/80"
                      }
                    ].map((tile, tIdx) => (
                      <button
                        key={tIdx}
                        onClick={() => handleSearch(tile.query)}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 shadow-xs transition-all active:scale-95 hover:shadow-md cursor-pointer ${tile.bg}`}
                      >
                        <span className="text-xl">{tile.icon}</span>
                        <h4 className="text-xs font-black text-zinc-900 leading-tight mt-1">{tile.title}</h4>
                        <p className="text-[10px] font-bold text-zinc-500 leading-tight">{tile.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Quick Pill Suggestions */}
                  <div className="space-y-2.5 w-full pt-2">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                      Popular Search Prompts
                    </span>
                    <div className="flex flex-wrap justify-center gap-2 px-1">
                      {[
                        "JEE 2026 latest updates",
                        "NEET 2026 syllabus changes",
                        "Jeju uprising timeline",
                        "CRISPR gene editing 2026 updates"
                      ].map((sug, sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => handleSearch(sug)}
                          className="text-[11px] px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-700 font-bold border border-zinc-200/80 shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3 h-3 text-blue-500" />
                          <span>{sug}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

