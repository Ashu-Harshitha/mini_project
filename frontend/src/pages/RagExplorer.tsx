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
  Check,
  Upload,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ragApi, type RagDocumentItem } from '@/api/ragApi';
import { type RagItem } from '@/mocks/data';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { UncertaintyBadge } from '@/components/UncertaintyBadge';

export const RagExplorer: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('corn nitrogen deficiency diagnosis V8 stage Iowa');
  const [sourceType, setSourceType] = useState('All');
  const [topK, setTopK] = useState(4);
  const [documents, setDocuments] = useState<any[]>([]);
  const [stats, setStats] = useState({
    documentsIndexed: 0,
    lastRefresh: 'Loading...',
    avgRetrievalMs: 0,
    indexCoverage: '0%',
  });
  const [searching, setSearching] = useState(false);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadSourceType, setUploadSourceType] = useState('extension_guide');
  const [uploadYear, setUploadYear] = useState<string>(new Date().getFullYear().toString());
  const [uploadAuthors, setUploadAuthors] = useState('');
  const [uploadPublisher, setUploadPublisher] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStats();
    handleSearch();
  }, []);

  const loadStats = () => {
    ragApi.getRagStats().then((res: any) => {
      setStats({
        documentsIndexed: res.documentsIndexed ?? res.documents ?? 0,
        lastRefresh: res.lastRefresh ?? res.last_refresh ?? 'Recently',
        avgRetrievalMs: res.avgRetrievalMs ?? res.avg_retrieval_ms ?? 0,
        indexCoverage: res.indexCoverage ?? res.coverage ?? '100%',
      });
    }).catch(console.error);
  };

  const handleSearch = async () => {
    setSearching(true);
    try {
      const docs = await ragApi.searchRag(searchQuery, sourceType, topK);
      setDocuments(docs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadMessage({ type: 'error', text: 'Please select a PDF file to upload.' });
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadMessage({ type: 'error', text: 'Document title is required.' });
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle.trim());
      formData.append('source_type', uploadSourceType);
      if (uploadYear) formData.append('year', uploadYear);
      if (uploadAuthors.trim()) formData.append('authors', uploadAuthors.trim());
      if (uploadPublisher.trim()) formData.append('publisher', uploadPublisher.trim());

      const res = await ragApi.uploadDocument(formData);
      setUploadMessage({
        type: 'success',
        text: res.message || 'PDF uploaded and queued for background ingestion!',
      });
      setUploadFile(null);
      setUploadTitle('');
      setUploadAuthors('');
      setUploadPublisher('');
      // Reload stats after upload
      setTimeout(loadStats, 2000);
    } catch (err: any) {
      setUploadMessage({
        type: 'error',
        text: err.message || 'Failed to upload document. Ensure file is a valid PDF under 20 MB.',
      });
    } finally {
      setUploading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedChunkId(prev => (prev === id ? null : id));
  };

  const observations = [
    { text: 'Interveinal chlorosis on lower 3 leaf tiers', confidence: 78 },
    { text: 'No lesions, spots, or pest damage visible', confidence: 91 },
    { text: 'Canopy density normal for V8 growth stage', confidence: 82 },
    { text: 'Yellowing pattern — lowest-leaf onset, tip-to-base', confidence: 72 },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header with Upload CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('nav.ragExplorer', 'RAG Explorer')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Semantic agronomy document retriever powered by ChromaDB and local vector embeddings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(!showUploadModal)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition"
        >
          <Upload className="w-4 h-4" />
          <span>{showUploadModal ? 'Hide Upload Form' : 'Upload Document'}</span>
        </button>
      </div>

      {/* Upload Form Card */}
      {showUploadModal && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 shadow-md transition-all animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Upload New Agronomy Extension Guide
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">PDF magic bytes verified • Max 20 MB</span>
          </div>

          {uploadMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 mb-4 ${
                uploadMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300'
              }`}
            >
              {uploadMessage.type === 'success' ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{uploadMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PDF Document File *
                </label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 dark:file:bg-emerald-950 dark:file:text-emerald-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Corn Growth and Development"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Type
                </label>
                <select
                  value={uploadSourceType}
                  onChange={(e) => setUploadSourceType(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="extension_guide">Extension Guide</option>
                  <option value="research_report">Research Report</option>
                  <option value="fact_sheet">Fact Sheet</option>
                  <option value="decision_tool">Decision Tool</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Publication Year
                </label>
                <input
                  type="number"
                  placeholder="2022"
                  value={uploadYear}
                  onChange={(e) => setUploadYear(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Authors
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sawyer, J.E., Mallarino, A.P."
                  value={uploadAuthors}
                  onChange={(e) => setUploadAuthors(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Publisher / Extension Service
                </label>
                <input
                  type="text"
                  placeholder="e.g. Iowa State University Extension"
                  value={uploadPublisher}
                  onChange={(e) => setUploadPublisher(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white shadow-sm transition disabled:opacity-75 flex items-center gap-1.5"
              >
                {uploading ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Ingesting...</span>
                  </>
                ) : (
                  <span>Upload & Ingest</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

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
                    ragApi.searchRag(searchQuery, type, topK).then((docs) => setDocuments(docs || []));
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
                ragApi.searchRag(searchQuery, sourceType, k).then((docs) => setDocuments(docs || []));
              }}
              className="w-full accent-emerald-700 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Retrieved Agronomic Guidance Documents */}
      <div className="space-y-4">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
          Retrieved Agronomic Guidance ({documents.length} chunks)
        </h3>

        <div className="space-y-4">
          {documents.map((doc, idx) => {
            const chunkId = doc.chunk_id || doc.id || `chunk-${idx}`;
            const isExpanded = expandedChunkId === chunkId;
            const fullText = doc.text || doc.snippet || '';
            const previewText = doc.snippet || (fullText.length > 250 ? fullText.substring(0, 250) + '...' : fullText);

            return (
              <div
                key={chunkId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3 transition hover:border-emerald-300 dark:hover:border-emerald-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        {doc.type || doc.source_type || 'Extension Guide'}
                      </span>
                      {doc.authors && (
                        <span className="text-[11px] text-slate-400">{doc.authors}</span>
                      )}
                      {doc.year && (
                        <span className="text-[11px] text-slate-400">({doc.year})</span>
                      )}
                      {doc.page && (
                        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          p.{doc.page}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {doc.title}
                    </h4>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      {doc.source || doc.citation}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        {doc.relevance}% relevance
                      </div>
                    </div>
                    <div className="w-20 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${doc.relevance}%` }} />
                    </div>
                  </div>
                </div>

                {/* Chunk Text Container with Expand/Collapse */}
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                  {isExpanded ? (
                    <div className="whitespace-pre-wrap">{fullText}</div>
                  ) : (
                    <div className="italic">"{previewText}"</div>
                  )}

                  {fullText.length > 250 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(chunkId)}
                      className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Show less</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>Expand full chunk text</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
