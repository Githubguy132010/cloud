import { getUserFromAuthOrRedirect } from '@/lib/user.server';
import { CodeReviewDetailClient } from './CodeReviewDetailClient';

export default async function CodeReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  await getUserFromAuthOrRedirect('/users/sign_in?callbackPath=/code-reviews');
  const { reviewId } = await params;

  return <CodeReviewDetailClient reviewId={reviewId} />;
}
