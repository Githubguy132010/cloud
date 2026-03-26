import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { captureException } from '@sentry/nextjs';
import type { OpenRouterModelsResponse } from '@/lib/organizations/organization-types';
import { getEnhancedOpenRouterModels } from '@/lib/providers/openrouter';
import { getUserFromAuth } from '@/lib/user.server';
import { getCodingPlanModelsForUser } from '@/lib/providers/coding-plans';

/**
 * Test using:
 * curl -vvv 'http://localhost:3000/api/openrouter/models'
 */
export async function GET(
  _request: NextRequest
): Promise<NextResponse<{ error: string; message: string } | OpenRouterModelsResponse>> {
  try {
    const data = await getEnhancedOpenRouterModels();
    const { user } = await getUserFromAuth({ adminOnly: false });
    return NextResponse.json(
      user ? { data: data.data.concat(await getCodingPlanModelsForUser(user.id)) } : data
    );
  } catch (error) {
    captureException(error, {
      tags: { endpoint: 'openrouter/models' },
      extra: {
        action: 'fetching_models',
      },
    });
    return NextResponse.json(
      { error: 'Failed to fetch models', message: 'Error from OpenRouter API' },
      { status: 500 }
    );
  }
}
