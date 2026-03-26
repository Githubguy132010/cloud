'use client';

import { useState } from 'react';
import { ExternalLink, Info, Key, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  isValidCustomSecretKey,
  MAX_CUSTOM_SECRET_VALUE_LENGTH,
} from '@kilocode/kiloclaw-secret-catalog';
import type { useKiloClawMutations } from '@/hooks/useKiloClaw';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { ChannelTokenInput } from './ChannelTokenInput';

type ClawMutations = ReturnType<typeof useKiloClawMutations>;

export function CustomSecretsSection({
  customSecretKeys,
  mutations,
  onRedeploy,
}: {
  customSecretKeys: string[];
  mutations: ClawMutations;
  onRedeploy?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [envVarName, setEnvVarName] = useState('');
  const [envVarValue, setEnvVarValue] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const isSaving = mutations.patchSecrets.isPending;

  const nameError = envVarName.length > 0 && !isValidCustomSecretKey(envVarName);

  function handleAdd() {
    const name = envVarName.trim();
    const value = envVarValue.trim();

    if (!name || !value) {
      toast.error('Both name and value are required.');
      return;
    }

    if (!isValidCustomSecretKey(name)) {
      toast.error(
        'Invalid env var name. Use A-Z, 0-9, _ only. Cannot start with a number or use KILOCLAW_ prefix.'
      );
      return;
    }

    if (customSecretKeys.includes(name)) {
      toast.error(`Secret "${name}" already exists. Remove it first to replace.`);
      return;
    }

    mutations.patchSecrets.mutate(
      { secrets: { [name]: value } },
      {
        onSuccess: () => {
          toast.success(`Secret "${name}" saved. Redeploy to apply.`, {
            duration: 8000,
            ...(onRedeploy && {
              action: { label: 'Redeploy', onClick: onRedeploy },
            }),
          });
          setEnvVarName('');
          setEnvVarValue('');
          setShowForm(false);
        },
        onError: err => toast.error(`Failed to save: ${err.message}`),
      }
    );
  }

  function handleRemove(name: string) {
    mutations.patchSecrets.mutate(
      { secrets: { [name]: null } },
      {
        onSuccess: () => {
          toast.success(`Secret "${name}" removed. Redeploy to apply.`, {
            duration: 8000,
            ...(onRedeploy && {
              action: { label: 'Redeploy', onClick: onRedeploy },
            }),
          });
        },
        onError: err => toast.error(`Failed to remove: ${err.message}`),
      }
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-foreground text-base font-semibold">Custom Secrets</h2>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4">
          {customSecretKeys.length} secret{customSecretKeys.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="space-y-3">
        {/* Help / SecretRef info */}
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <div className="rounded-lg border">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 transition-colors"
              >
                <Info className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="text-muted-foreground text-xs">
                  Add encrypted environment variables for API keys, tokens, and credentials.
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Separator />
              <div className="space-y-2 px-4 py-3 text-xs">
                <p className="text-muted-foreground">
                  Custom secrets are injected as encrypted environment variables into your
                  container. To reference a secret in your{' '}
                  <code className="bg-muted rounded px-1">openclaw.json</code> config, use
                  OpenClaw&apos;s SecretRef syntax:
                </p>
                <pre className="bg-muted rounded-md p-2 text-[11px]">
                  <code>{`{ "source": "env", "provider": "default", "id": "YOUR_KEY_NAME" }`}</code>
                </pre>
                <p className="text-muted-foreground">
                  This works for any of OpenClaw&apos;s{' '}
                  <a
                    href="https://docs.openclaw.ai/reference/secretref-credential-surface"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline"
                  >
                    supported credential paths
                    <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  (e.g. <code className="bg-muted rounded px-1">models.providers.*.apiKey</code>).
                  Secrets are also available as plain env vars for MCP servers and custom tools.
                </p>
                <p className="text-muted-foreground">
                  <a
                    href="https://docs.openclaw.ai/gateway/secrets"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline"
                  >
                    Learn more about OpenClaw secrets
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Existing secrets list */}
        {customSecretKeys.map(name => (
          <div key={name} className="flex items-center gap-3 rounded-lg border px-4 py-3">
            <Key className="text-muted-foreground h-4 w-4 shrink-0" />
            <code className="min-w-0 flex-1 truncate text-sm">{name}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(name)}
              disabled={isSaving}
              className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {/* Add new secret form */}
        {showForm ? (
          <div className="space-y-3 rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="custom-secret-name" className="mb-1 block text-xs">
                Environment Variable Name
              </Label>
              <Input
                id="custom-secret-name"
                type="text"
                placeholder="MY_API_KEY"
                value={envVarName}
                onChange={e => setEnvVarName(e.target.value.toUpperCase())}
                disabled={isSaving}
                maxLength={128}
                autoComplete="off"
                className={nameError ? 'border-red-500' : ''}
              />
              {nameError && (
                <p className="mt-1 text-[11px] text-red-400">
                  Must be a valid env var name (A-Z, 0-9, _). Cannot use KILOCLAW_ prefix or collide
                  with built-in secrets.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="custom-secret-value" className="mb-1 block text-xs">
                Value
              </Label>
              <ChannelTokenInput
                id="custom-secret-value"
                placeholder="sk-..."
                value={envVarValue}
                onChange={setEnvVarValue}
                disabled={isSaving}
                maxLength={MAX_CUSTOM_SECRET_VALUE_LENGTH}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={isSaving || !envVarName.trim() || !envVarValue.trim() || nameError}
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setEnvVarName('');
                  setEnvVarValue('');
                }}
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full">
            <Plus className="h-4 w-4" />
            Add Secret
          </Button>
        )}
      </div>
    </div>
  );
}
