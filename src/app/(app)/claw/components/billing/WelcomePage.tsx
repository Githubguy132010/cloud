'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Wallet } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTRPC } from '@/lib/trpc/utils';

type ClawPlan = 'commit' | 'standard';

const PLAN_COST_MICRODOLLARS: Record<ClawPlan, number> = {
  standard: 9_000_000,
  commit: 48_000_000,
};

const COMMIT_FEATURES = ['Best value', 'Auto-renews every 6 months', 'Lower monthly equivalent'];
const STANDARD_FEATURES = ['Cancel anytime', 'No commitment', 'Pay monthly'];

function formatMicrodollars(microdollars: number): string {
  return `$${(microdollars / 1_000_000).toFixed(2)}`;
}

type PlanCardProps = {
  plan: ClawPlan;
  isSelected: boolean;
  onSelect: () => void;
};

function PlanCard({ plan, isSelected, onSelect }: PlanCardProps) {
  const isCommit = plan === 'commit';
  const features = isCommit ? COMMIT_FEATURES : STANDARD_FEATURES;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-72 cursor-pointer flex-col rounded-lg border-2 p-6 text-left transition-all',
        isSelected
          ? 'border-blue-500/30 bg-blue-500/10'
          : 'border-border bg-secondary hover:border-muted-foreground/30 opacity-50'
      )}
    >
      {isCommit && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/60">
          RECOMMENDED
        </Badge>
      )}

      <h3 className="text-foreground mb-1 text-center text-xl font-semibold">
        {isCommit ? 'Commit Plan' : 'Standard Plan'}
      </h3>
      <p className="text-muted-foreground mb-4 text-center text-sm">
        {isCommit ? '6 months' : 'Monthly'}
      </p>

      <div className="mb-6 text-center">
        <div className="text-foreground text-4xl font-bold">
          {isCommit ? '$8' : '$9'}
          <span className="text-muted-foreground text-lg font-normal">/month</span>
        </div>
        {!isCommit && (
          <div className="mt-2 text-sm font-medium text-emerald-400">$4 first month</div>
        )}
      </div>

      <ul className="mb-6 space-y-3">
        {features.map(feature => (
          <li key={feature} className="text-muted-foreground flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          'flex items-center justify-center gap-2 text-sm font-medium text-blue-400',
          !isSelected && 'invisible'
        )}
      >
        <Check className="h-4 w-4" />
        Selected
      </div>
    </button>
  );
}

function CreditEnrollmentBanner({
  selectedPlan,
  creditBalanceMicrodollars,
  onEnroll,
  isPending,
}: {
  selectedPlan: ClawPlan;
  creditBalanceMicrodollars: number;
  onEnroll: () => void;
  isPending: boolean;
}) {
  const planCost = PLAN_COST_MICRODOLLARS[selectedPlan];
  const hasSufficientBalance = creditBalanceMicrodollars >= planCost;
  const shortfall = planCost - creditBalanceMicrodollars;
  const planLabel = selectedPlan === 'commit' ? 'Commit' : 'Standard';
  const planPriceLabel = selectedPlan === 'commit' ? '$48.00 for 6 months' : '$9.00/month';

  if (hasSufficientBalance) {
    return (
      <div className="w-full max-w-[600px] rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-300">Pay with credits</span>
        </div>
        <p className="text-muted-foreground mb-1 text-sm">
          {planLabel} Plan — {planPriceLabel} from your credit balance
        </p>
        <p className="mb-3 text-xs text-emerald-400/80">
          Balance: {formatMicrodollars(creditBalanceMicrodollars)}
        </p>
        <Button
          onClick={onEnroll}
          disabled={isPending}
          variant="primary"
          className="w-full py-3 font-semibold"
        >
          {isPending ? 'Activating…' : `Pay ${formatMicrodollars(planCost)} with Credits`}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[600px] rounded-lg border border-amber-500/20 bg-amber-500/5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold text-amber-300">Insufficient credits</span>
      </div>
      <div className="text-muted-foreground space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Balance</span>
          <span className="text-foreground">{formatMicrodollars(creditBalanceMicrodollars)}</span>
        </div>
        <div className="flex justify-between">
          <span>{planLabel} plan cost</span>
          <span className="text-foreground">{formatMicrodollars(planCost)}</span>
        </div>
        <div className="flex justify-between border-t border-amber-500/20 pt-1 font-medium text-amber-400">
          <span>Shortfall</span>
          <span>{formatMicrodollars(shortfall)}</span>
        </div>
      </div>
      <Link
        href="/credits"
        className="mt-3 block text-center text-sm font-medium text-blue-400 hover:text-blue-300"
      >
        Add credits to your balance
      </Link>
    </div>
  );
}

export function WelcomePage() {
  const [selectedPlan, setSelectedPlan] = useState<ClawPlan>('commit');
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: billing } = useQuery(trpc.kiloclaw.getBillingStatus.queryOptions());
  const checkoutMutation = useMutation(trpc.kiloclaw.createSubscriptionCheckout.mutationOptions());
  const enrollWithCredits = useMutation(
    trpc.kiloclaw.enrollWithCredits.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.kiloclaw.getBillingStatus.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.kiloclaw.getStatus.queryKey(),
        });
        toast.success('Subscription activated with credits');
      },
    })
  );

  const creditBalance = billing?.creditBalanceMicrodollars ?? null;
  const hasCredits = creditBalance !== null && creditBalance > 0;

  async function handleSubscribe() {
    try {
      const result = await checkoutMutation.mutateAsync({ plan: selectedPlan });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      toast.error('Failed to start checkout. Please try again.');
    }
  }

  async function handleEnrollWithCredits() {
    try {
      await enrollWithCredits.mutateAsync({ plan: selectedPlan });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to activate with credits. Please try again.';
      toast.error(message, { duration: 10000 });
    }
  }

  const planName = selectedPlan === 'commit' ? 'Commit' : 'Standard';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-foreground text-3xl font-bold">Welcome to KiloClaw 🦀</h1>
        <p className="text-muted-foreground mt-3 max-w-lg text-lg">
          Choose a plan to get started with KiloClaw.
        </p>
      </div>

      {/* Plan selection */}
      <div className="mb-8 flex flex-wrap items-stretch justify-center gap-6">
        <PlanCard
          plan="commit"
          isSelected={selectedPlan === 'commit'}
          onSelect={() => setSelectedPlan('commit')}
        />
        <PlanCard
          plan="standard"
          isSelected={selectedPlan === 'standard'}
          onSelect={() => setSelectedPlan('standard')}
        />
      </div>

      {/* Credit enrollment option — shown when user has credits */}
      {hasCredits && (
        <div className="mb-6 flex w-full justify-center">
          <CreditEnrollmentBanner
            selectedPlan={selectedPlan}
            creditBalanceMicrodollars={creditBalance}
            onEnroll={handleEnrollWithCredits}
            isPending={enrollWithCredits.isPending}
          />
        </div>
      )}

      {/* "or" divider when credit option is shown */}
      {hasCredits && (
        <div className="mb-6 flex w-full max-w-[600px] items-center gap-3">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs">or pay with Stripe</span>
          <div className="bg-border h-px flex-1" />
        </div>
      )}

      {/* Stripe checkout */}
      <div className="flex w-full max-w-[600px] flex-col items-center gap-3">
        <Button
          onClick={handleSubscribe}
          disabled={checkoutMutation.isPending}
          variant={hasCredits ? 'outline' : 'primary'}
          className={cn(
            'w-full max-w-md py-4 text-lg font-semibold',
            hasCredits && 'text-base'
          )}
        >
          {checkoutMutation.isPending
            ? 'Redirecting to Stripe…'
            : `Subscribe to ${planName} Plan – ${selectedPlan === 'commit' ? '$48' : '$9'}`}
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          You&apos;ll be redirected to Stripe to pay
        </p>
      </div>
    </div>
  );
}
