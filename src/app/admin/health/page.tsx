"use client";

import { useEffect, useState } from "react";
import { fetchIngestionHealth, fetchRecentErrors, type HealthStats } from "./actions";

export default function HealthDashboard() {
  const [stats, setStats] = useState<HealthStats[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchIngestionHealth(), fetchRecentErrors()]).then(([healthData, errorsData]) => {
      setStats(healthData);
      setErrors(errorsData);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col h-screen w-full bg-black text-gray-200 overflow-y-auto p-8 font-sans">
      <div className="max-w-6xl mx-auto w-full">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Ingestion Health</h1>
            <p className="text-gray-400 mt-2">Monitor data pipeline status and sync errors.</p>
          </div>
          <a href="/admin/events" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm transition-colors border border-gray-700">
            &larr; Back to Events
          </a>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse flex space-x-2">
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/50">
                <h2 className="text-lg font-semibold text-white">Source Status</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-900/50 text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="px-6 py-3 font-medium">Source Type</th>
                      <th className="px-6 py-3 font-medium text-right">Total Configurations</th>
                      <th className="px-6 py-3 font-medium text-right">Active</th>
                      <th className="px-6 py-3 font-medium text-right">Errors</th>
                      <th className="px-6 py-3 font-medium text-right">Success Rate</th>
                      <th className="px-6 py-3 font-medium">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {stats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          No ingestion sources found.
                        </td>
                      </tr>
                    ) : (
                      stats.map((s) => {
                        const successRate = s.totalVenues > 0 ? (s.activeCount / s.totalVenues) * 100 : 0;
                        return (
                          <tr key={s.sourceType} className="hover:bg-gray-800/30 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-300">
                              <span className="px-2.5 py-1 bg-gray-800 rounded text-xs font-mono border border-gray-700">
                                {s.sourceType}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-300">{s.totalVenues}</td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-emerald-400 font-mono">{s.activeCount}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={s.errorCount > 0 ? "text-red-400 font-mono font-bold" : "text-gray-500 font-mono"}>
                                {s.errorCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className={successRate < 90 ? "text-amber-400" : "text-gray-400"}>
                                  {successRate.toFixed(1)}%
                                </span>
                                <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${successRate < 90 ? 'bg-amber-400' : 'bg-emerald-500'}`} 
                                    style={{ width: `${successRate}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-400 text-sm">
                              {s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString() : 'Never'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="bg-gray-900 border border-red-900/30 rounded-xl overflow-hidden shadow-2xl relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50"></div>
                <div className="px-6 py-4 border-b border-gray-800 bg-red-900/10">
                  <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Recent Sync Errors
                  </h2>
                </div>
                <div className="divide-y divide-gray-800/50">
                  {errors.map((err, i) => (
                    <div key={i} className="p-4 hover:bg-gray-800/50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{err.venueName}</span>
                          <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400 border border-gray-700">
                            {err.type}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {err.lastSyncedAt !== 'Never' ? new Date(err.lastSyncedAt).toLocaleString() : 'Never'}
                        </span>
                      </div>
                      <p className="text-sm text-red-300/80 font-mono bg-red-900/10 p-2 rounded border border-red-900/20 mt-2 break-all">
                        {err.error}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
