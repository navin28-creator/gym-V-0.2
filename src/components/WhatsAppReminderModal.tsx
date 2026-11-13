import React, { useState } from 'react';
import { Member, ReminderLogEntry } from '../types/gym';
import { formatINR, formatKolkataDate } from '../services/crypto';
import { dbService } from '../services/db';
import {
  X,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Send,
  BellRing,
  CheckCircle2,
} from 'lucide-react';

interface WhatsAppReminderModalProps {
  member: Member;
  outstandingBalanceInr: number;
  dueDate?: string;
  tier?: ReminderLogEntry['tier'];
  onClose: () => void;
}

export const WhatsAppReminderModal: React.FC<WhatsAppReminderModalProps> = ({
  member,
  outstandingBalanceInr,
  dueDate,
  tier = 'balance_due',
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [loggedNote, setLoggedNote] = useState<string | null>(null);
  const gymName = 'Flex & Flow Gym';
  const gymUpi = 'flexflow.gym@icici';

  const buildDefaultMessage = () => {
    const duePart = dueDate ? ` (Due: ${formatKolkataDate(dueDate)})` : '';
    const amountPart =
      outstandingBalanceInr > 0
        ? `of ${formatINR(outstandingBalanceInr)}`
        : 'for your upcoming membership renewal';

    if (tier === 'overdue') {
      return `Hi ${member.fullName}, greetings from ${gymName}!

Your gym membership has expired${duePart}, and a renewal / fee settlement ${amountPart} is overdue.

Please renew or clear your dues via UPI:
UPI ID: ${gymUpi}
Or settle at the front desk (Cash/Card).

Once paid, please share the transaction screenshot or UTR number so our staff can reactivate your access immediately.`;
    }

    if (tier === 'due_today') {
      return `Hi ${member.fullName}, greetings from ${gymName}!

Your gym membership is due for renewal today${duePart}. Amount due: ${
        outstandingBalanceInr > 0 ? formatINR(outstandingBalanceInr) : 'at current plan tariff'
      }.

Please complete your payment via UPI to:
UPI ID: ${gymUpi}
Or settle at the front desk (Cash/Card).

Share the UTR/reference ID once done so we can extend your membership without interruption!`;
    }

    if (tier === 'expiring_soon') {
      return `Hi ${member.fullName}, greetings from ${gymName}!

Heads up — your active gym membership is expiring soon${duePart}. Renew early to keep your workout streak uninterrupted!${
        outstandingBalanceInr > 0 ? `\nCurrent balance due: ${formatINR(outstandingBalanceInr)}.` : ''
      }

UPI ID: ${gymUpi} (or pay via Cash/Card at reception).

Share your UTR number once paid so we can update your receipt in gym.sqlite.`;
    }

    return `Hi ${member.fullName}, greetings from ${gymName}! 

This is a gentle reminder that your gym membership fee ${amountPart} is pending${duePart}.

Please complete your payment via UPI to:
UPI ID: ${gymUpi}
Or settle at the front desk (Cash/Card).

Once paid, please share the transaction screenshot or UTR number so our staff can record your receipt. See you at your workout today!`;
  };

  const [messageText, setMessageText] = useState(buildDefaultMessage);

  // Clean phone number for WhatsApp link (India +91)
  const cleanPhone = member.phone.replace(/[^0-9]/g, '');
  const waPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone.replace(/^0+/, '')}`;

  const whatsappUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`;
  const smsUrl = `sms:${member.phone}?body=${encodeURIComponent(messageText)}`;

  const logReminder = async (channel: ReminderLogEntry['channel']) => {
    try {
      await dbService.logReminderSentAsync({
        memberId: member.id,
        channel,
        tier,
        balanceInr: outstandingBalanceInr,
        dueDate,
        messagePreview: messageText.slice(0, 140),
      });
      setLoggedNote(`Logged ${channel.replace('_', ' ')} reminder to SQLite.`);
    } catch {
      // Non-fatal in UI
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    void logReminder('copy');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDesktopAlert = async () => {
    await dbService.triggerDesktopTestNotificationAsync(
      `Renewal Reminder: ${member.fullName}`,
      outstandingBalanceInr > 0
        ? `Outstanding balance ${formatINR(outstandingBalanceInr)}${dueDate ? ` · Due ${formatKolkataDate(dueDate)}` : ''}`
        : `Membership renewal due${dueDate ? ` on ${formatKolkataDate(dueDate)}` : ''}`
    );
    await logReminder('desktop_notification');
  };

  const tierLabel =
    tier === 'overdue'
      ? 'OVERDUE RENEWAL'
      : tier === 'due_today'
      ? 'DUE TODAY'
      : tier === 'expiring_soon'
      ? 'EXPIRING SOON'
      : 'BALANCE DUE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <span className="text-base font-semibold text-white">Smart Renewal & Payment Reminder</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
              {tierLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg text-xs">
            <div>
              <span className="text-neutral-400 block">Recipient Member:</span>
              <span className="font-semibold text-neutral-200 text-sm">{member.fullName}</span>
              <span className="text-neutral-400 font-mono block">{member.phone}</span>
            </div>
            <div className="text-right">
              <span className="text-neutral-400 block">Outstanding Balance:</span>
              <span className="font-bold text-amber-400 text-base font-mono tabular-nums">
                {formatINR(outstandingBalanceInr)}
              </span>
              {dueDate && (
                <span className="text-[11px] font-mono text-neutral-400 block">
                  Due: {formatKolkataDate(dueDate)}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1.5 uppercase">
              Prepared Message Text (Editable)
            </label>
            <textarea
              rows={8}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-200 focus:outline-none focus:border-amber-400 font-mono leading-relaxed"
            />
          </div>

          {loggedNote && (
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/70 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{loggedNote}</span>
            </div>
          )}

          <div className="text-xs text-neutral-400 bg-neutral-950/40 p-3 rounded-lg border border-neutral-800/80">
            <span className="font-semibold text-neutral-300 block mb-0.5">Note on privacy & reminder tracking:</span>
            Reminders are dispatched via your native WhatsApp, SMS, or Windows notifications, and every dispatch is recorded locally in SQLite so staff avoid duplicate follow-ups.
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
            <button
              type="button"
              onClick={handleDesktopAlert}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-300 hover:text-white bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/60 rounded-lg transition-colors"
              title="Send Windows desktop notification alert"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Desktop Alert</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={smsUrl}
              onClick={() => void logReminder('sms')}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              <span>SMS App</span>
            </a>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void logReminder('whatsapp')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors font-semibold shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>Open in WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
