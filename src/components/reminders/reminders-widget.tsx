"use client";

import { useEffect, useMemo, useState } from 'react';

import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import type { Reminder } from '@/types/reminder.types';
import { getSupabaseBrowserClient } from '@/utils/supabase/browser-client';

type ModalState = 
  | { type: 'closed' }
  | { type: 'open' };

export function RemindersWidget() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });
  const [saving, setSaving] = useState(false);

  // Form state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [remindDate, setRemindDate] = useState('');
  const [remindTime, setRemindTime] = useState('');

  // Fetch reminders
  useEffect(() => {
    async function fetchReminders() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', session.user.id)
        .order('remind_at', { ascending: true });

      if (!error && data) {
        setReminders(data);
      }
      setLoading(false);
    }

    void fetchReminders();
  }, [supabase]);

  // Create new reminder
  async function handleCreateReminder(e: React.FormEvent) {
    e.preventDefault();
    
    if (!remindDate || !remindTime) {
      return;
    }

    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      return;
    }

    // Combine date and time into ISO string
    const remindAt = new Date(`${remindDate}T${remindTime}:00`).toISOString();

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: session.user.id,
        phone_number: phoneNumber,
        message: message,
        remind_at: remindAt,
        status: 'pending'
      })
      .select()
      .single();

    if (!error && data) {
      setReminders(prev => [...prev, data].sort((a, b) => 
        new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()
      ));
      setPhoneNumber('');
      setMessage('');
      setRemindDate('');
      setRemindTime('');
      setModal({ type: 'closed' });
    }

    setSaving(false);
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  return (
    <>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Reminders</h2>
          <button
            onClick={() => setModal({ type: 'open' })}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            + Create New
          </button>
        </div>

        <div className="min-h-[200px] space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/20 p-4">
          {loading ? (
            <p className="text-center text-sm text-zinc-500">Loading reminders...</p>
          ) : reminders.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No reminders yet</p>
          ) : (
            reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 break-words">{reminder.message}</p>
                    <p className="mt-1 text-xs text-zinc-500">{reminder.phone_number}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-xs text-zinc-400">{formatDate(reminder.remind_at)}</span>
                    {reminder.status && (
                      <span className={`mt-1 rounded px-1.5 py-0.5 text-xs ${
                        reminder.status === 'pending' 
                          ? 'bg-yellow-900/40 text-yellow-400'
                          : reminder.status === 'sent'
                          ? 'bg-green-900/40 text-green-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {reminder.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal Overlay */}
      {modal.type === 'open' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-50">Create Reminder</h3>
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="space-y-4">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  required
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>

              <div>
                <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Message
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What do you want to be reminded about?"
                  required
                  rows={3}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Date
                  </label>
                  <DatePicker
                    value={remindDate}
                    onChange={setRemindDate}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Time
                  </label>
                  <TimePicker
                    value={remindTime}
                    onChange={setRemindTime}
                    selectedDate={remindDate}
                  />
                </div>
              </div>

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
                  disabled={saving}
                  className="flex-1 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Reminder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
