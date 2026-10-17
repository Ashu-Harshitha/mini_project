import React, { useState, useEffect } from 'react';
import {
  Star,
  Search,
  Filter,
  User,
  Clock,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminFeedbackItem } from '@/api/adminApi';
import { AudioPlayer } from '@/components/AudioPlayer';
import { EmptyState } from '@/components/EmptyState';

export const AdminFeedback: React.FC = () => {
  const { t } = useTranslation();

  const [feedbackItems, setFeedbackItems] = useState<AdminFeedbackItem[]>([]);
  const [avgRatingPerAgronomist, setAvgRatingPerAgronomist] = useState<Record<string, number>>({});
  const [minRatingFilter, setMinRatingFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getFeedback({
        min_rating: minRatingFilter ? Number(minRatingFilter) : undefined,
      });
      setFeedbackItems(data.items);
      setAvgRatingPerAgronomist(data.avg_rating_per_agronomist || {});
    } catch (err) {
      console.warn('Failed to load farmer feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [minRatingFilter]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
            <span>Farmer Outcome Feedback & Ratings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real field outcome evaluations, farmer satisfaction ratings, and agronomist performance averages
          </p>
        </div>
      </div>

      {/* Average Ratings Per Agronomist Cards */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Average Satisfaction Per Agronomist
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {Object.keys(avgRatingPerAgronomist).length === 0 ? (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              No agronomist ratings yet.
            </div>
          ) : (
            Object.entries(avgRatingPerAgronomist).map(([agronomistName, avg]) => (
              <div
                key={agronomistName}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white block">
                    {agronomistName}
                  </span>
                  <span className="text-[11px] text-slate-400">Certified Agronomist</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 font-black text-sm">
                  <span>{avg.toFixed(1)}</span>
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">Minimum Rating:</span>
          <select
            value={minRatingFilter}
            onChange={(e) => setMinRatingFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="">All Ratings (1 - 5)</option>
            <option value="5">5 Stars only</option>
            <option value="4">4+ Stars</option>
            <option value="3">3+ Stars</option>
            <option value="2">2+ Stars</option>
            <option value="1">1+ Stars</option>
          </select>
        </div>
        <span className="text-slate-400 text-xs">{feedbackItems.length} reviews found</span>
      </div>

      {/* Feedback Feed */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500">Loading farmer reviews...</span>
        </div>
      ) : feedbackItems.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No Feedback on Record"
          description="Farmers have not submitted outcome ratings for the selected filters yet."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feedbackItems.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900 dark:text-white">
                      <span>{item.farmer_name || `Farmer #${item.farmer_id}`}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        ({item.case_number || `Case #${item.case_id}`})
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Reviewed by: {item.agronomist_name || 'Agronomist'}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= item.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200 dark:text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Comment with translation */}
                {item.comment && (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    <p>{item.comment_translated || item.comment}</p>
                    {item.comment_translated && item.comment_lang && item.comment_lang !== 'en' && (
                      <span className="text-[10px] text-slate-400 italic block mt-1">
                        Translated from [{item.comment_lang.toUpperCase()}]: "{item.comment}"
                      </span>
                    )}
                  </div>
                )}

                {/* Voice note audio player */}
                {item.audio_url && (
                  <div className="mt-2">
                    <AudioPlayer src={item.audio_url} title="Farmer voice feedback" />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Outcome Verified</span>
                <span>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
