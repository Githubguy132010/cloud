'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { useWastelandTRPC } from '@/lib/wasteland/trpc';
import type { WantedItem } from './types';

export function SendToTownAction({ wastelandId, item }: { wastelandId: string; item: WantedItem }) {
  const trpc = useWastelandTRPC();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTownId, setSelectedTownId] = useState<string | null>(null);
  const [sentToTown, setSentToTown] = useState<string | null>(null);

  const { data: towns, isLoading } = useQuery(
    trpc.wasteland.listConnectedTowns.queryOptions({ wastelandId })
  );

  const sendMutation = useMutation({
    ...trpc.wasteland.sendWantedItemToTown.mutationOptions(),
    onSuccess: (_, variables) => {
      toast.success('Item sent to town');
      setSentToTown(variables.townId);
      setIsExpanded(false);
      void queryClient.invalidateQueries({
        queryKey: trpc.wasteland.listConnectedTowns.queryKey({ wastelandId }),
      });
    },
    onError: err => {
      toast.error(err.message || 'Failed to send item to town');
    },
  });

  if (isLoading || !towns || towns.length === 0) {
    return null;
  }

  if (sentToTown) {
    return <p className="text-xs text-emerald-400">Sent to {sentToTown}</p>;
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
      >
        <Send className="size-3.5" />
        Send to Town
      </button>
    );
  }

  if (towns.length === 1) {
    const town = towns[0];
    return (
      <div className="flex flex-col gap-2 rounded-md border border-sky-500/20 bg-sky-500/[0.04] p-3">
        <p className="text-xs leading-relaxed text-white/70">Send this item to {town.town_id}?</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={sendMutation.isPending}
            onClick={() =>
              sendMutation.mutate({ wastelandId, itemId: item.id, townId: town.town_id })
            }
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-500/20 px-3 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/30 disabled:opacity-50"
          >
            {sendMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Yes, send it
          </button>
          <button
            type="button"
            disabled={sendMutation.isPending}
            onClick={() => setIsExpanded(false)}
            className="inline-flex items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-sky-500/20 bg-sky-500/[0.04] p-3">
      <p className="text-xs leading-relaxed text-white/70">Select a town to send this item to:</p>
      <select
        value={selectedTownId ?? ''}
        onChange={e => setSelectedTownId(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 focus:border-sky-500/40 focus:outline-none"
      >
        <option value="">Select a town...</option>
        {towns.map(town => (
          <option key={town.town_id} value={town.town_id}>
            {town.town_id}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={sendMutation.isPending || !selectedTownId}
          onClick={() => {
            if (selectedTownId) {
              sendMutation.mutate({ wastelandId, itemId: item.id, townId: selectedTownId });
            }
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-500/20 px-3 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/30 disabled:opacity-50"
        >
          {sendMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Send
        </button>
        <button
          type="button"
          disabled={sendMutation.isPending}
          onClick={() => {
            setIsExpanded(false);
            setSelectedTownId(null);
          }}
          className="inline-flex items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
