import type { CodeReviewAgentConfig } from '@/lib/agent-config/core/types';
import { resolveTemplate, generateReviewPrompt } from './generate-prompt';
import type { PromptTemplate } from './generate-prompt';

// --- Fixtures ---

const localTemplate = {
  version: 'local-v1',
  systemRole: 'local system role',
  hardConstraints: 'local constraints',
  workflow: 'local workflow',
  whatToReview: 'local what',
  commentFormat: 'local comment format',
  summaryFormatIssuesFound: 'local issues',
  summaryFormatNoIssues: 'local no issues',
  summaryMarkerNote: 'local marker',
  summaryCommandCreate: 'local create',
  summaryCommandUpdate: 'local update',
  inlineCommentsApi: 'local api',
  fixLinkTemplate: 'local fix',
  styleGuidance: { roast: 'ROAST MODE ACTIVATED' },
  commentFormatOverrides: { roast: 'roast comment format' },
  summaryFormatOverrides: { roast: { issuesFound: 'roast issues', noIssues: 'roast no issues' } },
} satisfies PromptTemplate;

const remoteTemplateWithoutStyleOverrides = {
  version: 'remote-v1',
  systemRole: 'remote system role',
  hardConstraints: 'remote constraints',
  workflow: 'remote workflow',
  whatToReview: 'remote what',
  commentFormat: 'remote comment format',
  summaryFormatIssuesFound: 'remote issues',
  summaryFormatNoIssues: 'remote no issues',
  summaryMarkerNote: 'remote marker',
  summaryCommandCreate: 'remote create',
  summaryCommandUpdate: 'remote update',
  inlineCommentsApi: 'remote api',
  fixLinkTemplate: 'remote fix',
} satisfies PromptTemplate;

const remoteTemplateWithStyleOverrides = {
  ...remoteTemplateWithoutStyleOverrides,
  styleGuidance: { roast: 'REMOTE ROAST GUIDANCE' },
  commentFormatOverrides: { roast: 'remote roast comment format' },
  summaryFormatOverrides: {
    roast: { issuesFound: 'remote roast issues', noIssues: 'remote roast no issues' },
  },
} satisfies PromptTemplate;

// --- resolveTemplate ---

describe('resolveTemplate', () => {
  it('returns local template with source "local" when remote is undefined', () => {
    const result = resolveTemplate(undefined, localTemplate);

    expect(result.template).toBe(localTemplate);
    expect(result.source).toBe('local');
  });

  it('merges local style overrides into remote template when remote omits them', () => {
    const result = resolveTemplate(remoteTemplateWithoutStyleOverrides, localTemplate);

    expect(result.template.version).toBe('remote-v1');
    expect(result.template.systemRole).toBe('remote system role');
    // Style overrides should come from local
    expect(result.template.styleGuidance).toBe(localTemplate.styleGuidance);
    expect(result.template.commentFormatOverrides).toBe(localTemplate.commentFormatOverrides);
    expect(result.template.summaryFormatOverrides).toBe(localTemplate.summaryFormatOverrides);
  });

  it('preserves remote style overrides when remote includes them', () => {
    const result = resolveTemplate(remoteTemplateWithStyleOverrides, localTemplate);

    expect(result.template.styleGuidance).toBe(remoteTemplateWithStyleOverrides.styleGuidance);
    expect(result.template.commentFormatOverrides).toBe(
      remoteTemplateWithStyleOverrides.commentFormatOverrides
    );
    expect(result.template.summaryFormatOverrides).toBe(
      remoteTemplateWithStyleOverrides.summaryFormatOverrides
    );
  });

  it('returns source "posthog" when remote template is provided', () => {
    const result = resolveTemplate(remoteTemplateWithoutStyleOverrides, localTemplate);

    expect(result.source).toBe('posthog');
  });
});

// --- generateReviewPrompt (integration) ---

const baseConfig = {
  review_style: 'balanced' as const,
  focus_areas: [],
  custom_instructions: '',
  model_slug: 'test-model',
  max_review_time_minutes: 30,
} satisfies CodeReviewAgentConfig;

describe('generateReviewPrompt', () => {
  it('includes roast style guidance when review_style is "roast"', async () => {
    const roastConfig = { ...baseConfig, review_style: 'roast' as const };
    const { prompt } = await generateReviewPrompt(roastConfig, 'owner/repo', 1);

    expect(prompt).toContain('ROAST MODE ACTIVATED');
  });

  it('includes roast comment format when review_style is "roast"', async () => {
    const roastConfig = { ...baseConfig, review_style: 'roast' as const };
    const { prompt } = await generateReviewPrompt(roastConfig, 'owner/repo', 1);

    expect(prompt).toContain('🔥 **The Roast**');
  });

  it('includes roast summary format when review_style is "roast"', async () => {
    const roastConfig = { ...baseConfig, review_style: 'roast' as const };
    const { prompt } = await generateReviewPrompt(roastConfig, 'owner/repo', 1);

    expect(prompt).toContain('Code Review Roast 🔥');
  });

  it('does not include roast guidance when review_style is "balanced"', async () => {
    const { prompt } = await generateReviewPrompt(baseConfig, 'owner/repo', 1);

    expect(prompt).not.toContain('ROAST MODE ACTIVATED');
  });
});
