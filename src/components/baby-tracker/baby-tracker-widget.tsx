"use client";

import { useEffect, useMemo, useState } from 'react';

import type { BabyLogEntry, BabyLogKind } from '@/types/baby-log.types';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser-client';

type ModalState =
  | { type: 'closed' }
  | { type: 'open'; kind: 'feeding' }
  | { type: 'open'; kind: 'diaper' }
  | { type: 'open'; kind: 'sleep' }
  | { type: 'open'; kind: 'daily' }
  | { type: 'open'; kind: 'weekly' };

export function BabyTrackerWidget() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [logs, setLogs] = useState<BabyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sleepLoading, setSleepLoading] = useState(false);

  // Active sleep entry — if one exists with no end time, sleep is "in progress"
  const activeSleep = logs.find((l) => l.kind === 'sleep' && l.sleep_start && !l.sleep_end) ?? null;

  // Feeding form state
  const [feedingType, setFeedingType] = useState<'breast' | 'bottle' | 'breast_pumped' | null>(null);
  const [feedingDuration, setFeedingDuration] = useState('');
  const [feedingAmount, setFeedingAmount] = useState('');
  const [feedingUnit, setFeedingUnit] = useState<'ml' | 'oz'>('ml'); // Default to ml
  const [feedingTime, setFeedingTime] = useState('');

  // Diaper form state
  const [diaperTime, setDiaperTime] = useState('');

  // Sleep form state
  const [sleepStartTime, setSleepStartTime] = useState('');
  const [sleepEndTime, setSleepEndTime] = useState('');

  // Fetch logs and auto-delete old entries
  useEffect(() => {
    async function fetchLogs() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Delete entries older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      await supabase
        .from('baby_logs')
        .delete()
        .eq('user_id', session.user.id)
        .lt('logged_at', sevenDaysAgo.toISOString());

      // Fetch remaining logs
      const { data, error } = await supabase
        .from('baby_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('logged_at', { ascending: false });

      if (!error && data) {
        setLogs(data);
      }
      setLoading(false);
    }

    void fetchLogs();
  }, [supabase]);

  // ─── Create helpers ─────────────────────────────────────────────

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  // Feeding — modal form with adaptive fields
  async function handleCreateFeeding(e: React.FormEvent) {
    e.preventDefault();
    if (!feedingType) return;

    setSaving(true);
    const session = await getSession();
    if (!session) { setSaving(false); return; }

    let amountMl: number | null = null;
    if ((feedingType === 'bottle' || feedingType === 'breast_pumped') && feedingAmount) {
      amountMl = Number(feedingAmount);
      if (feedingUnit === 'oz') {
        amountMl = amountMl * 29.5735; // Convert oz to ml
      }
    }

    // Use custom time if provided, otherwise use current time
    let loggedAt: string;
    if (feedingTime) {
      const now = new Date();
      const [hours, minutes] = feedingTime.split(':');
      now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      loggedAt = now.toISOString();
    } else {
      loggedAt = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('baby_logs')
      .insert({
        user_id: session.user.id,
        kind: 'feeding',
        logged_at: loggedAt,
        feeding_type: feedingType,
        feeding_duration_minutes: feedingType === 'breast' && feedingDuration ? Number(feedingDuration) : null,
        feeding_amount_ml: amountMl,
        feeding_amount_unit: feedingUnit,
      })
      .select()
      .single();

    if (!error && data) {
      setLogs((prev) => [data, ...prev].sort((a, b) => 
        new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      ));
      setFeedingType(null);
      setFeedingDuration('');
      setFeedingAmount('');
      setFeedingTime('');
      setModal({ type: 'closed' });
    } else if (error) {
      console.error('Error logging feeding:', error);
      alert(`Failed to log feeding: ${error.message}. Please check your Supabase RLS policies.`);
    }

    setSaving(false);
  }

  // Diaper — instant log, no modal
  async function handleLogDiaper(diaperType: 'wet' | 'dirty' | 'both', customTime?: string) {
    const session = await getSession();
    if (!session) return;

    let loggedAt: string;
    if (customTime) {
      const now = new Date();
      const [hours, minutes] = customTime.split(':');
      now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      loggedAt = now.toISOString();
    } else {
      loggedAt = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('baby_logs')
      .insert({
        user_id: session.user.id,
        kind: 'diaper',
        logged_at: loggedAt,
        diaper_type: diaperType,
      })
      .select()
      .single();

    if (!error && data) {
      setLogs((prev) => [data, ...prev].sort((a, b) => 
        new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      ));
      setDiaperTime('');
    } else if (error) {
      console.error('Error logging diaper:', error);
      alert('Failed to log diaper change: ' + error.message);
    }
  }

  // Sleep — toggle start/end or use custom times
  async function handleToggleSleep() {
    setSleepLoading(true);
    const session = await getSession();
    if (!session) {
      setSleepLoading(false);
      return;
    }

    if (activeSleep) {
      // End the active sleep
      let endTime: string;
      if (sleepEndTime) {
        const now = new Date();
        const [hours, minutes] = sleepEndTime.split(':');
        now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        endTime = now.toISOString();
      } else {
        endTime = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('baby_logs')
        .update({ sleep_end: endTime })
        .eq('id', activeSleep.id)
        .select()
        .single();

      if (!error && data) {
        setLogs((prev) => prev.map((l) => (l.id === activeSleep.id ? data : l)).sort((a, b) => 
          new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        ));
        setSleepEndTime('');
      } else if (error) {
        console.error('Error ending sleep:', error);
        alert('Failed to end sleep: ' + error.message);
      }
    } else {
      // Start a new sleep
      let startTime: string;
      if (sleepStartTime) {
        const now = new Date();
        const [hours, minutes] = sleepStartTime.split(':');
        now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        startTime = now.toISOString();
      } else {
        startTime = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('baby_logs')
        .insert({
          user_id: session.user.id,
          kind: 'sleep',
          logged_at: startTime,
          sleep_start: startTime,
          sleep_end: null,
        })
        .select()
        .single();

      if (!error && data) {
        setLogs((prev) => [data, ...prev].sort((a, b) => 
          new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        ));
        setSleepStartTime('');
      } else if (error) {
        console.error('Error starting sleep:', error);
        alert('Failed to start sleep: ' + error.message);
      }
    }
    setSleepLoading(false);
  }

  // Log completed sleep session with both start and end times
  async function handleLogCompletedSleep() {
    if (!sleepStartTime || !sleepEndTime) {
      alert('Please provide both start and end times');
      return;
    }

    setSleepLoading(true);
    const session = await getSession();
    if (!session) {
      setSleepLoading(false);
      return;
    }

    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);

    const [startHours, startMinutes] = sleepStartTime.split(':');
    const [endHours, endMinutes] = sleepEndTime.split(':');
    
    startDate.setHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
    endDate.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);

    // If end time is before start time, assume sleep crossed midnight
    if (endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }

    const { data, error } = await supabase
      .from('baby_logs')
      .insert({
        user_id: session.user.id,
        kind: 'sleep',
        logged_at: startDate.toISOString(),
        sleep_start: startDate.toISOString(),
        sleep_end: endDate.toISOString(),
      })
      .select()
      .single();

    if (!error && data) {
      setLogs((prev) => [data, ...prev].sort((a, b) => 
        new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      ));
      setSleepStartTime('');
      setSleepEndTime('');
      setModal({ type: 'closed' });
    } else if (error) {
      console.error('Error logging sleep:', error);
      alert('Failed to log sleep: ' + error.message);
    }

    setSleepLoading(false);
  }

  // ─── Delete ─────────────────────────────────────────────────────

  async function handleDeleteLog(logId: string) {
    setDeletingId(logId);

    const { error } = await supabase
      .from('baby_logs')
      .delete()
      .eq('id', logId);

    if (error) {
      console.error('Delete error:', error);
      alert(`Failed to delete log: ${error.message}`);
    } else {
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    }

    setDeletingId(null);
  }

  // ─── Weekly Statistics Calculations ─────────────────────────────

  function calculateWeeklyStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const weekLogs = logs.filter(log => new Date(log.logged_at) >= sevenDaysAgo);
    
    // Group logs by day for daily averages
    const logsByDay: { [key: string]: BabyLogEntry[] } = {};
    weekLogs.forEach(log => {
      const date = new Date(log.logged_at);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!logsByDay[dayKey]) logsByDay[dayKey] = [];
      logsByDay[dayKey].push(log);
    });

    const daysWithData = Object.keys(logsByDay).length;

    // ─── SLEEP STATISTICS ───
    const sleepLogs = weekLogs.filter(l => l.kind === 'sleep' && l.sleep_start && l.sleep_end);
    
    // Longest continuous sleep stretch
    let longestSleep = 0;
    let longestSleepOccurrences = 0;
    sleepLogs.forEach(log => {
      const duration = (new Date(log.sleep_end!).getTime() - new Date(log.sleep_start!).getTime()) / 60000;
      if (duration > longestSleep) {
        longestSleep = duration;
        longestSleepOccurrences = 1;
      } else if (Math.abs(duration - longestSleep) < 5) {
        longestSleepOccurrences++;
      }
    });

    // Night vs Day sleep (night = 7pm - 7am)
    let totalNightSleep = 0;
    let totalDaySleep = 0;
    sleepLogs.forEach(log => {
      const start = new Date(log.sleep_start!);
      const end = new Date(log.sleep_end!);
      const duration = (end.getTime() - start.getTime()) / 60000;
      const startHour = start.getHours();
      
      // Consider sleep as "night" if it starts between 7pm (19) and 7am (7)
      if (startHour >= 19 || startHour < 7) {
        totalNightSleep += duration;
      } else {
        totalDaySleep += duration;
      }
    });

    const totalSleep = totalNightSleep + totalDaySleep;
    const nightSleepPercent = totalSleep > 0 ? (totalNightSleep / totalSleep) * 100 : 0;

    // Average wake windows (time between sleep sessions)
    const wakeWindows: number[] = [];
    const sortedSleep = [...sleepLogs].sort((a, b) => 
      new Date(a.sleep_start!).getTime() - new Date(b.sleep_start!).getTime()
    );
    for (let i = 0; i < sortedSleep.length - 1; i++) {
      const endOfSleep = new Date(sortedSleep[i].sleep_end!);
      const startOfNextSleep = new Date(sortedSleep[i + 1].sleep_start!);
      const wakeMinutes = (startOfNextSleep.getTime() - endOfSleep.getTime()) / 60000;
      if (wakeMinutes > 0 && wakeMinutes < 300) { // Only count wake windows under 5 hours
        wakeWindows.push(wakeMinutes);
      }
    }
    const avgWakeWindow = wakeWindows.length > 0 
      ? wakeWindows.reduce((a, b) => a + b, 0) / wakeWindows.length 
      : 0;

    // ─── FEEDING STATISTICS ───
    const feedingLogs = weekLogs.filter(l => l.kind === 'feeding');
    
    // Average daily volume (bottle/pumped only)
    const bottleFeedings = feedingLogs.filter(l => 
      (l.feeding_type === 'bottle' || l.feeding_type === 'breast_pumped') && l.feeding_amount_ml
    );
    const totalVolume = bottleFeedings.reduce((sum, log) => sum + (log.feeding_amount_ml || 0), 0);
    const avgDailyVolume = daysWithData > 0 ? totalVolume / daysWithData : 0;

    // Average feeds per day
    const avgFeedsPerDay = daysWithData > 0 ? feedingLogs.length / daysWithData : 0;

    // Cluster feeding analysis (feeds within 2 hours of each other)
    const feedingsByHour: { [hour: number]: number } = {};
    feedingLogs.forEach(log => {
      const hour = new Date(log.logged_at).getHours();
      feedingsByHour[hour] = (feedingsByHour[hour] || 0) + 1;
    });
    const peakFeedingHour = Object.entries(feedingsByHour)
      .sort((a, b) => b[1] - a[1])[0];

    // ─── DIAPER STATISTICS ───
    const diaperLogs = weekLogs.filter(l => l.kind === 'diaper');
    const wetDiapers = diaperLogs.filter(l => l.diaper_type === 'wet' || l.diaper_type === 'both');
    const dirtyDiapers = diaperLogs.filter(l => l.diaper_type === 'dirty' || l.diaper_type === 'both');
    
    const avgWetPerDay = daysWithData > 0 ? wetDiapers.length / daysWithData : 0;
    const avgDirtyPerDay = daysWithData > 0 ? dirtyDiapers.length / daysWithData : 0;

    return {
      daysWithData,
      sleep: {
        longestStretch: longestSleep,
        longestStretchOccurrences: longestSleepOccurrences,
        nightSleepPercent,
        avgWakeWindow,
        totalSleepSessions: sleepLogs.length,
      },
      feeding: {
        avgDailyVolume,
        avgFeedsPerDay,
        peakFeedingHour: peakFeedingHour ? parseInt(peakFeedingHour[0]) : null,
        peakFeedingCount: peakFeedingHour ? peakFeedingHour[1] : 0,
        totalFeedings: feedingLogs.length,
      },
      diaper: {
        avgWetPerDay,
        avgDirtyPerDay,
        totalWet: wetDiapers.length,
        totalDirty: dirtyDiapers.length,
      }
    };
  }

  // ─── Formatting ─────────────────────────────────────────────────

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function kindLabel(kind: BabyLogKind): string {
    switch (kind) {
      case 'feeding': return 'Feeding';
      case 'diaper':  return 'Diaper';
      case 'sleep':   return 'Sleep';
    }
  }

  function kindColor(kind: BabyLogKind): string {
    switch (kind) {
      case 'feeding': return 'bg-blue-900/40 text-blue-400';
      case 'diaper':  return 'bg-yellow-900/40 text-yellow-400';
      case 'sleep':   return 'bg-purple-900/40 text-purple-400';
    }
  }

  function logSummary(log: BabyLogEntry): string {
    switch (log.kind) {
      case 'feeding':
        return [
          log.feeding_type === 'breast' ? 'Breast' : log.feeding_type === 'bottle' ? 'Bottle' : log.feeding_type === 'breast_pumped' ? 'Breast (pumped)' : null,
          log.feeding_duration_minutes ? `${log.feeding_duration_minutes} min` : null,
          log.feeding_amount_ml ? `${Math.round(log.feeding_amount_ml)} ml` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Feeding logged';

      case 'diaper':
        return log.diaper_type
          ? log.diaper_type.charAt(0).toUpperCase() + log.diaper_type.slice(1)
          : 'Diaper change';

      case 'sleep': {
        if (log.sleep_start && log.sleep_end) {
          const start = new Date(log.sleep_start);
          const end = new Date(log.sleep_end);
          const mins = Math.round((end.getTime() - start.getTime()) / 60000);

          const formatTime = (date: Date) => {
            return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          };

          return `${formatTime(start)} to ${formatTime(end)} (${mins} min)`;
        }
        if (log.sleep_start && !log.sleep_end) return 'In progress…';
        return 'Sleep logged';
      }
    }
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Baby Tracker</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setModal({ type: 'open', kind: 'daily' })}
              className="rounded-lg bg-zinc-800/60 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              📊 Daily
            </button>
            <button
              onClick={() => setModal({ type: 'open', kind: 'weekly' })}
              className="rounded-lg bg-zinc-800/60 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              📈 Weekly
            </button>
          </div>
        </div>

        {/* Quick-action buttons */}
        <div className="mb-4 flex flex-wrap gap-2">
          {/* Feeding — opens modal */}
          <button
            onClick={() => setModal({ type: 'open', kind: 'feeding' })}
            className="rounded-lg bg-blue-900/40 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-900/60"
          >
            + Feeding
          </button>

          {/* Diaper — opens modal for type selection */}
          <button
            onClick={() => setModal({ type: 'open', kind: 'diaper' })}
            className="rounded-lg bg-yellow-900/40 px-4 py-2 text-sm font-medium text-yellow-300 transition-colors hover:bg-yellow-900/60"
          >
            + Diaper Change
          </button>

          {/* Sleep — opens modal */}
          <button
            onClick={() => setModal({ type: 'open', kind: 'sleep' })}
            className="rounded-lg bg-purple-900/40 px-4 py-2 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-900/60"
          >
            + Sleep
          </button>
        </div>

        {/* Log list */}
        <div className="min-h-[200px] space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/20 p-4">
          {loading ? (
            <p className="text-center text-sm text-zinc-500">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              No logs yet — tap a button above to start tracking.
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindColor(log.kind)}`}>
                        {kindLabel(log.kind)}
                      </span>
                      <p className="text-sm text-zinc-200">{logSummary(log)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-400">{formatDate(log.logged_at)}</span>
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      disabled={deletingId === log.id}
                      className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:opacity-50"
                      aria-label="Delete log"
                    >
                      {deletingId === log.id ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Feeding modal */}
      {modal.type === 'open' && modal.kind === 'feeding' && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-50">Log Feeding</h3>
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateFeeding} className="space-y-4">
              {/* Time input */}
              <div>
                <label htmlFor="feedingTime" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Time (optional)
                </label>
                <input
                  id="feedingTime"
                  type="time"
                  value={feedingTime}
                  onChange={(e) => setFeedingTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
                <p className="mt-1 text-xs text-zinc-500">Leave blank to use current time</p>
              </div>

              {/* Type toggle */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedingType('breast')}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      feedingType === 'breast'
                        ? 'border-blue-600 bg-blue-900/40 text-blue-200'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    Breast
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedingType('breast_pumped')}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      feedingType === 'breast_pumped'
                        ? 'border-blue-600 bg-blue-900/40 text-blue-200'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    Breast (pumped)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedingType('bottle')}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      feedingType === 'bottle'
                        ? 'border-blue-600 bg-blue-900/40 text-blue-200'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    Bottle
                  </button>
                </div>
              </div>

              {/* Duration — shown for breast only */}
              {feedingType === 'breast' && (
                <div>
                  <label htmlFor="duration" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Duration (minutes)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min="1"
                    value={feedingDuration}
                    onChange={(e) => setFeedingDuration(e.target.value)}
                    placeholder="e.g. 15"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                </div>
              )}

              {/* Amount — only shown for bottle or breast (pumped) */}
              {(feedingType === 'bottle' || feedingType === 'breast_pumped') && (
                <div>
                  <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Amount
                  </label>
                  <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
                    <input
                      id="amount"
                      type="number"
                      min="1"
                      value={feedingAmount}
                      onChange={(e) => setFeedingAmount(e.target.value)}
                      placeholder="e.g. 120"
                      className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                    />
                    <div className="flex border-l border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setFeedingUnit('ml')}
                        className={`px-3 py-2 text-sm font-medium ${
                          feedingUnit === 'ml'
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        ml
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedingUnit('oz')}
                        className={`px-3 py-2 text-sm font-medium ${
                          feedingUnit === 'oz'
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        oz
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal({ type: 'closed' })}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !feedingType}
                  className="flex-1 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Log Feeding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Diaper modal */}
      {modal.type === 'open' && modal.kind === 'diaper' && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-50">Log Diaper Change</h3>
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Time input */}
              <div>
                <label htmlFor="diaperTime" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Time (optional)
                </label>
                <input
                  id="diaperTime"
                  type="time"
                  value={diaperTime}
                  onChange={(e) => setDiaperTime(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
                <p className="mt-1 text-xs text-zinc-500">Leave blank to use current time</p>
              </div>

              <p className="text-sm text-zinc-400">Select diaper type:</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    handleLogDiaper('wet', diaperTime || undefined);
                    setModal({ type: 'closed' });
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:border-yellow-600"
                >
                  💧 Wet
                </button>
                <button
                  onClick={() => {
                    handleLogDiaper('dirty', diaperTime || undefined);
                    setModal({ type: 'closed' });
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:border-yellow-600"
                >
                  💩 Dirty
                </button>
                <button
                  onClick={() => {
                    handleLogDiaper('both', diaperTime || undefined);
                    setModal({ type: 'closed' });
                  }}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:border-yellow-600"
                >
                  💧💩 Both
                </button>
              </div>
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sleep modal */}
      {modal.type === 'open' && modal.kind === 'sleep' && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl my-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-50">Log Sleep</h3>
              <button
                onClick={() => {
                  setModal({ type: 'closed' });
                  setSleepStartTime('');
                  setSleepEndTime('');
                }}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {activeSleep ? (
                <>
                  {/* Active sleep - just end it */}
                  <div className="rounded-lg bg-purple-900/20 border border-purple-800 p-4">
                    <p className="text-sm text-purple-200 mb-2">Sleep in progress</p>
                    <p className="text-xs text-zinc-400">
                      Started: {new Date(activeSleep.sleep_start!).toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                      })}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="sleepEndTime" className="mb-1.5 block text-sm font-medium text-zinc-300">
                      End Time (optional)
                    </label>
                    <input
                      id="sleepEndTime"
                      type="time"
                      value={sleepEndTime}
                      onChange={(e) => setSleepEndTime(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                    />
                    <p className="mt-1 text-xs text-zinc-500">Leave blank to use current time</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setModal({ type: 'closed' });
                        setSleepEndTime('');
                      }}
                      className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handleToggleSleep();
                        setModal({ type: 'closed' });
                      }}
                      disabled={sleepLoading}
                      className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                    >
                      {sleepLoading ? 'Saving...' : 'End Sleep'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* No active sleep - choose how to log */}
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-400">Choose an option:</p>
                    
                    {/* Quick start button */}
                    <button
                      onClick={() => {
                        handleToggleSleep();
                        setModal({ type: 'closed' });
                      }}
                      disabled={sleepLoading}
                      className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                    >
                      🌙 Start Sleep Now
                    </button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-zinc-800"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-zinc-950 px-2 text-zinc-500">OR</span>
                      </div>
                    </div>

                    {/* Custom time inputs */}
                    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                      <p className="text-sm font-medium text-zinc-300">Log completed sleep session</p>
                      
                      <div>
                        <label htmlFor="sleepStartTime" className="mb-1.5 block text-sm font-medium text-zinc-300">
                          Start Time
                        </label>
                        <input
                          id="sleepStartTime"
                          type="time"
                          value={sleepStartTime}
                          onChange={(e) => setSleepStartTime(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                      </div>

                      <div>
                        <label htmlFor="sleepEndTimeComplete" className="mb-1.5 block text-sm font-medium text-zinc-300">
                          End Time
                        </label>
                        <input
                          id="sleepEndTimeComplete"
                          type="time"
                          value={sleepEndTime}
                          onChange={(e) => setSleepEndTime(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                      </div>

                      <button
                        onClick={handleLogCompletedSleep}
                        disabled={sleepLoading || !sleepStartTime || !sleepEndTime}
                        className="w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                      >
                        {sleepLoading ? 'Saving...' : 'Log Sleep Session'}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setModal({ type: 'closed' });
                      setSleepStartTime('');
                      setSleepEndTime('');
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily Timeline Modal */}
      {modal.type === 'open' && modal.kind === 'daily' && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl my-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Today's Timeline</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Timeline Container */}
            <div className="space-y-6">
              {/* Legend */}
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-zinc-400">Feeding</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-zinc-400">Diaper</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-zinc-400">Sleep</span>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative">
                {/* Time labels */}
                <div className="flex justify-between text-xs text-zinc-500 mb-2">
                  <span>12 AM</span>
                  <span>6 AM</span>
                  <span>12 PM</span>
                  <span>6 PM</span>
                  <span>11:59 PM</span>
                </div>

                {/* Timeline bar background */}
                <div className="relative h-16 bg-zinc-900/40 rounded-lg border border-zinc-800 overflow-hidden">
                  {/* Hour markers */}
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px bg-zinc-800/50"
                      style={{ left: `${(i / 24) * 100}%` }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {(() => {
                    const now = new Date();
                    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
                    const percentOfDay = (minutesSinceMidnight / (24 * 60)) * 100;
                    return (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                        style={{ left: `${percentOfDay}%` }}
                        title="Current time"
                      >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full"></div>
                      </div>
                    );
                  })()}

                  {/* Activity markers and bars */}
                  {(() => {
                    const today = new Date();
                    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const todayLogs = logs.filter(log => new Date(log.logged_at) >= startOfDay);

                    return todayLogs.map((log) => {
                      const logTime = new Date(log.logged_at);
                      const minutesSinceMidnight = logTime.getHours() * 60 + logTime.getMinutes();
                      const leftPercent = (minutesSinceMidnight / (24 * 60)) * 100;

                      // For sleep, show duration bar
                      if (log.kind === 'sleep' && log.sleep_start) {
                        const sleepStart = new Date(log.sleep_start);
                        const sleepEnd = log.sleep_end ? new Date(log.sleep_end) : new Date();
                        
                        const startMinutes = sleepStart.getHours() * 60 + sleepStart.getMinutes();
                        const endMinutes = sleepEnd.getHours() * 60 + sleepEnd.getMinutes();
                        const durationMinutes = endMinutes - startMinutes;
                        
                        const left = (startMinutes / (24 * 60)) * 100;
                        const width = (durationMinutes / (24 * 60)) * 100;

                        return (
                          <div
                            key={log.id}
                            className="absolute top-1/2 -translate-y-1/2 h-10 bg-purple-500/60 border-2 border-purple-400 rounded cursor-pointer hover:bg-purple-500/80 transition-colors z-10"
                            style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                            title={`Sleep: ${logSummary(log)}`}
                          >
                            <div className="flex items-center justify-center h-full text-xs text-white font-medium">
                              {log.sleep_end ? `${Math.round(durationMinutes)}m` : '😴'}
                            </div>
                          </div>
                        );
                      }

                      // For feeding with duration, show bar
                      if (log.kind === 'feeding' && log.feeding_duration_minutes) {
                        const durationMinutes = log.feeding_duration_minutes;
                        const width = (durationMinutes / (24 * 60)) * 100;

                        return (
                          <div
                            key={log.id}
                            className="absolute top-1/2 -translate-y-1/2 h-8 bg-blue-500/60 border-2 border-blue-400 rounded cursor-pointer hover:bg-blue-500/80 transition-colors z-10"
                            style={{ left: `${leftPercent}%`, width: `${Math.max(width, 0.5)}%` }}
                            title={`Feeding: ${logSummary(log)}`}
                          >
                            <div className="flex items-center justify-center h-full text-xs text-white font-medium">
                              🍼
                            </div>
                          </div>
                        );
                      }

                      // For point events (feeding without duration, diaper), show marker
                      const color = log.kind === 'feeding' ? 'blue' : log.kind === 'diaper' ? 'yellow' : 'purple';
                      const icon = log.kind === 'feeding' ? '🍼' : log.kind === 'diaper' ? '🧷' : '😴';

                      return (
                        <div
                          key={log.id}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform z-10 shadow-lg"
                          style={{ 
                            left: `${leftPercent}%`,
                            backgroundColor: color === 'blue' ? '#3b82f6' : color === 'yellow' ? '#eab308' : '#a855f7',
                            borderWidth: '2px',
                            borderStyle: 'solid',
                            borderColor: color === 'blue' ? '#60a5fa' : color === 'yellow' ? '#fde047' : '#c084fc'
                          }}
                          title={`${kindLabel(log.kind)}: ${logSummary(log)}`}
                        >
                          <span className="text-sm">{icon}</span>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Activity List Below Timeline */}
                <div className="mt-6 space-y-2 max-h-64 overflow-y-auto">
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">Activity Details</h4>
                  {(() => {
                    const today = new Date();
                    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const todayLogs = logs.filter(log => new Date(log.logged_at) >= startOfDay);

                    if (todayLogs.length === 0) {
                      return <p className="text-sm text-zinc-500 text-center py-4">No activities recorded today</p>;
                    }

                    return todayLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800"
                      >
                        <span className={`rounded px-2 py-1 text-xs font-medium ${kindColor(log.kind)}`}>
                          {kindLabel(log.kind)}
                        </span>
                        <span className="text-sm text-zinc-300 flex-1">{logSummary(log)}</span>
                        <span className="text-xs text-zinc-500">{formatDate(log.logged_at)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Report Modal */}
      {modal.type === 'open' && modal.kind === 'weekly' && (() => {
        const stats = calculateWeeklyStats();
        
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-2xl my-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-zinc-50">Weekly Report</h3>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                    Past 7 days • {stats.daysWithData} day{stats.daysWithData !== 1 ? 's' : ''} with data
                  </p>
                </div>
                <button
                  onClick={() => setModal({ type: 'closed' })}
                  className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Sleep Statistics */}
                <div className="rounded-xl border border-purple-900/40 bg-purple-950/20 p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <span className="text-base sm:text-lg">😴</span>
                    </div>
                    <h4 className="text-base sm:text-lg font-semibold text-purple-200">Sleep Trends</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {/* Longest Sleep Stretch */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Longest Stretch</div>
                      <div className="text-lg sm:text-xl font-bold text-purple-300">
                        {stats.sleep.longestStretch > 0 
                          ? `${Math.floor(stats.sleep.longestStretch / 60)}h ${Math.round(stats.sleep.longestStretch % 60)}m`
                          : 'No data'}
                      </div>
                      {stats.sleep.longestStretchOccurrences > 1 && (
                        <div className="text-xs text-green-400 mt-0.5">
                          ✨ {stats.sleep.longestStretchOccurrences}x this week
                        </div>
                      )}
                    </div>

                    {/* Night vs Day Sleep */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Night Sleep</div>
                      <div className="text-lg sm:text-xl font-bold text-purple-300">
                        {stats.sleep.nightSleepPercent > 0 
                          ? `${Math.round(stats.sleep.nightSleepPercent)}%`
                          : 'No data'}
                      </div>
                      {stats.sleep.nightSleepPercent > 0 && (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {stats.sleep.nightSleepPercent >= 60 ? '✓ Good pattern' : '→ Improving'}
                        </div>
                      )}
                    </div>

                    {/* Average Wake Windows */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Wake Windows</div>
                      <div className="text-lg sm:text-xl font-bold text-purple-300">
                        {stats.sleep.avgWakeWindow > 0 
                          ? `${Math.round(stats.sleep.avgWakeWindow)} min`
                          : 'No data'}
                      </div>
                    </div>

                    {/* Total Sleep Sessions */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Sleep Sessions</div>
                      <div className="text-lg sm:text-xl font-bold text-purple-300">
                        {stats.sleep.totalSleepSessions}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        ~{stats.daysWithData > 0 ? Math.round(stats.sleep.totalSleepSessions / stats.daysWithData) : 0}/day
                      </div>
                    </div>
                  </div>
                </div>

                {/* Feeding Statistics */}
                <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <span className="text-base sm:text-lg">🍼</span>
                    </div>
                    <h4 className="text-base sm:text-lg font-semibold text-blue-200">Feeding Patterns</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {/* Average Daily Volume */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Daily Volume</div>
                      <div className="text-lg sm:text-xl font-bold text-blue-300">
                        {stats.feeding.avgDailyVolume > 0 
                          ? `${Math.round(stats.feeding.avgDailyVolume)} ml`
                          : 'No data'}
                      </div>
                      {stats.feeding.avgDailyVolume > 0 && (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          ~{Math.round(stats.feeding.avgDailyVolume * 0.033814)} oz
                        </div>
                      )}
                    </div>

                    {/* Average Feeds Per Day */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Feeds/Day</div>
                      <div className="text-lg sm:text-xl font-bold text-blue-300">
                        {stats.feeding.avgFeedsPerDay > 0 
                          ? Math.round(stats.feeding.avgFeedsPerDay)
                          : 'No data'}
                      </div>
                      {stats.feeding.avgFeedsPerDay > 0 && (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          ~Every {Math.round(24 / stats.feeding.avgFeedsPerDay)}h
                        </div>
                      )}
                    </div>

                    {/* Peak Feeding Time */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Peak Time</div>
                      <div className="text-lg sm:text-xl font-bold text-blue-300">
                        {stats.feeding.peakFeedingHour !== null 
                          ? `${stats.feeding.peakFeedingHour % 12 || 12}${stats.feeding.peakFeedingHour >= 12 ? 'PM' : 'AM'}`
                          : 'No data'}
                      </div>
                      {stats.feeding.peakFeedingHour !== null && stats.feeding.peakFeedingHour >= 17 && stats.feeding.peakFeedingHour <= 23 && (
                        <div className="text-xs text-yellow-400 mt-0.5">
                          Cluster feeding
                        </div>
                      )}
                    </div>

                    {/* Total Feedings */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Total Feedings</div>
                      <div className="text-lg sm:text-xl font-bold text-blue-300">
                        {stats.feeding.totalFeedings}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        This week
                      </div>
                    </div>
                  </div>
                </div>

                {/* Diaper Statistics */}
                <div className="rounded-xl border border-yellow-900/40 bg-yellow-950/20 p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <span className="text-base sm:text-lg">🧷</span>
                    </div>
                    <h4 className="text-base sm:text-lg font-semibold text-yellow-200">Diaper Output</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {/* Average Wet Per Day */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Wet/Day</div>
                      <div className="text-lg sm:text-xl font-bold text-yellow-300">
                        {stats.diaper.avgWetPerDay > 0 
                          ? Math.round(stats.diaper.avgWetPerDay * 10) / 10
                          : 'No data'}
                      </div>
                      {stats.diaper.avgWetPerDay > 0 && (
                        <div className="text-xs mt-0.5">
                          {stats.diaper.avgWetPerDay >= 6 
                            ? <span className="text-green-400">✓ Great!</span>
                            : <span className="text-yellow-400">→ Monitor</span>
                          }
                        </div>
                      )}
                    </div>

                    {/* Stool Pattern */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Dirty/Day</div>
                      <div className="text-lg sm:text-xl font-bold text-yellow-300">
                        {stats.diaper.avgDirtyPerDay > 0 
                          ? Math.round(stats.diaper.avgDirtyPerDay * 10) / 10
                          : 'No data'}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Normal varies
                      </div>
                    </div>

                    {/* Total Wet */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Total Wet</div>
                      <div className="text-lg sm:text-xl font-bold text-yellow-300">
                        {stats.diaper.totalWet}
                      </div>
                    </div>

                    {/* Total Dirty */}
                    <div className="bg-zinc-900/40 rounded-lg p-2.5 sm:p-3 border border-zinc-800">
                      <div className="text-xs text-zinc-400 mb-0.5">Total Dirty</div>
                      <div className="text-lg sm:text-xl font-bold text-yellow-300">
                        {stats.diaper.totalDirty}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reassurance Message */}
                <div className="rounded-xl border border-green-900/40 bg-green-950/20 p-3 sm:p-4">
                  <div className="flex gap-2.5">
                    <div className="text-xl sm:text-2xl">💚</div>
                    <div>
                      <h4 className="text-sm sm:text-base font-semibold text-green-200 mb-1.5">You're Doing Great!</h4>
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                        These weekly trends help you see the bigger picture beyond the challenging days.
                        {stats.sleep.longestStretch >= 180 && " Your baby is showing good sleep progress!"} 
                        {stats.diaper.avgWetPerDay >= 6 && " Hydration looks healthy."} 
                        {stats.feeding.avgFeedsPerDay >= 6 && stats.feeding.avgFeedsPerDay <= 12 && " Feeding patterns are within normal range."} 
                        Remember, every baby develops at their own pace.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
