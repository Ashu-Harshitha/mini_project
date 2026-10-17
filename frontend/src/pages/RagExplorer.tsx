import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Search, 
  Clock, 
  Zap, 
  BookOpen, 
  FileText, 
  ExternalLink,
  Sliders,
  Sparkles,
  Layers,
  Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ragApi } from '@/api/ragApi';
import { type RagItem } from '@/mocks/data';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';

export const RagExplorer: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('corn nitrogen deficiency diagnosis V8 stage Iowa');
  const [sourceType, setSourceType] = useState('All');
  const [topK, setTopK] = useState(4);
  const [documents, setDocuments] = useState<RagItem[]>([]);
  const [stats, setStats] = useState({
    documentsIndexed: 2847,
    lastRefresh: '6h ago',
    avgRetrievalMs: 340,
    indexCoverage: '94%',
  });
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    ragApi.getRagStats().then(setStats);
    handleSearch();
  }, []);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const docs = await ragApi.searchRag(searchQuery, sourceType, topK);
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const observations = [
    { text: 'Interveinal chlorosis on lower 3 leaf tiers', confidence: 78 },
    { text: 'No lesions, spots, or pest damage visible', confidence: 91 },
    { text: 'Canopy density normal for V8 growth stage', confidence: 82 },
    { text: 'Yellowing pattern — lowest-leaf onset, tip-to-base', confidence: 72 },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('nav.ragExplorer', 'RAG Explorer')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Inspect retrieved agronomic sources and how they inform AI recommendations.
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Documents Indexed
          </span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.documentsIndexed.toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Last Refresh
          </span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.lastRefresh}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Avg. Retrieval
          </span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.avgRetrievalMs}ms
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Index Coverage
          </span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {stats.indexCoverage}
          </div>
        </div>
      </div>

      {/* Query Formulation & Observations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Image Observations (Query Input) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Image Observations (Query Input)
            </h3>
            <UncertaintyBadge confidence={78} size="sm" />
          </div>

          <div className="space-y-3">
            {observations.map((obs, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200">
                  <span>{obs.text}</span>
                  <span className="font-semibold">{obs.confidence}%</span>
                </div>
                <ConfidenceBar score={obs.confidence} showPercentage={false} heightClass="h-1.5" />
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            These observations, combined with soil + weather data, form the RAG retrieval query.
          </p>
        </div>

        {/* Right: Semantic Search Controls */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            Semantic Search Query
          </h3>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agronomic guidelines..."
                className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition disabled:opacity-75 flex items-center gap-1.5"
            >
              {searching ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Searching</span>
                </>
              ) : (
                <span>Search</span>
              )}
            </button>
          </div>

          {/* Source types */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Source types
            </label>
            <div className="flex flex-wrap gap-2">
              {['All', 'Extension Guide', 'Research Report', 'Fact Sheet', 'Decision Tool'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSourceType(type);
                    ragApi.searchRag(searchQuery, type, topK).then(setDocuments);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    sourceType === type
                      ? 'bg-emerald-800 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Top-k slider */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span>Top-k retrieved: {topK} documents</span>
            </div>
            <input
              type="range"
              min="2"
              max="8"
              value={topK}
              onChange={(e) => {
                const k = parseInt(e.target.value, 10);
                setTopK(k);
                ragApi.searchRag(searchQuery, sourceType, k).then(setDocuments);
              }}
              className="w-full accent-emerald-700 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Retrieved Agronomic Guidance Documents */}
      <div className="space-y-4">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
          Retrieved Agronomic Guidance ({documents.length} documents)
        </h3>

        <div className="space-y-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 transition hover:border-emerald-300 dark:hover:border-emerald-700"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                      {doc.type}
                    </span>
                    <span className="text-[11px] text-slate-400">{doc.authors}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {doc.title}
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                    {doc.source}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {doc.relevance}% relevance
                    </div>
                  </div>
                  <div className="w-16 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${doc.relevance}%` }} />
                  </div>
                </div>
              </div>

              {/* Quote Snippet Box */}
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 italic leading-relaxed">
                "{doc.snippet}"
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
