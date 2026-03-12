import type { KiloClawEnv } from '../../types';
import type { FlyClientConfig } from '../../fly/client';
import type { FlyMachineConfig } from '../../fly/types';
import type { PersistedState } from '../../schemas/instance-config';
import * as fly from '../../fly/client';
import {
  SELF_HEAL_THRESHOLD,
  STARTUP_TIMEOUT_SECONDS,
  MIN_ENV_PATCH_CONTROLLER_VERSION,
  isCalverAtLeast,
  getProactiveRefreshThresholdMs,
} from '../../config';
import { ENCRYPTED_ENV_PREFIX, encryptEnvValue } from '../../utils/env-encryption';
import {
  METADATA_RECOVERY_COOLDOWN_MS,
  BOUND_MACHINE_RECOVERY_COOLDOWN_MS,
  TERMINAL_STOPPED_STATES,
  selectRecoveryCandidate,
  volumeIdFromMachine,
} from '../machine-recovery';
import { METADATA_KEY_USER_ID } from '../machine-config';
import type { InstanceMutableState, DestroyResult } from './types';
import { storageUpdate, resetMutableState } from './state';
import { reconcileLog } from './log';
import { ensureVolume, staleProvisionAgeMs } from './fly-machines';
import { mintFreshApiKey } from './config';
import * as gateway from './gateway';

/**
 * Check actual Fly state against DO state and fix drift.
 * Destroying instances only retry pending deletes; never recreate resources.
 */
export async function reconcileWithFly(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  env: KiloClawEnv,
  reason: string,
  /** Callback to trigger a full destroy (calls back into the DO). */
  triggerDestroy: () => Promise<void>,
  /** Callback for marking Postgres row destroyed during finalization. */
  markDestroyedInPostgres?: (userId: string, sandboxId: string) => Promise<boolean>
): Promise<void> {
  if (state.status === 'destroying') {
    await retryPendingDestroy(flyConfig, ctx, state, reason, markDestroyedInPostgres);
    return;
  }

  const machineReconciled = await reconcileMachine(flyConfig, ctx, state, reason);

  // Auto-destroy stale provisioned instances
  const staleAge = staleProvisionAgeMs(state);
  if (staleAge !== null && machineReconciled) {
    reconcileLog(reason, 'auto_destroy_stale_provision', {
      user_id: state.userId,
      provisioned_at: state.provisionedAt,
      age_hours: Math.round(staleAge / 3600000),
    });
    state.pendingPostgresMarkOnFinalize = true;
    await ctx.storage.put(storageUpdate({ pendingPostgresMarkOnFinalize: true }));
    await triggerDestroy();
    return;
  }

  await reconcileVolume(flyConfig, ctx, state, env, reason);
  await reconcileApiKeyExpiry(flyConfig, ctx, state, env, reason);
}

// ---- API key proactive refresh ----

const MINT_TIMEOUT_MS = 15_000;

async function reconcileApiKeyExpiry(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  env: KiloClawEnv,
  reason: string
): Promise<void> {
  if (state.status !== 'running' || !state.flyMachineId) return;
  if (!state.kilocodeApiKeyExpiresAt || !state.userId) return;

  // Capture after guards so narrowing is explicit across awaits.
  const machineId = state.flyMachineId;
  const userId = state.userId;

  const expiresAtMs = Date.parse(state.kilocodeApiKeyExpiresAt);
  if (Number.isNaN(expiresAtMs)) return;

  const timeUntilExpiry = expiresAtMs - Date.now();
  const thresholdMs = getProactiveRefreshThresholdMs(env.PROACTIVE_REFRESH_THRESHOLD_HOURS);
  if (timeUntilExpiry > thresholdMs) return;

  reconcileLog(reason, 'api_key_expiry_approaching', {
    user_id: userId,
    expires_at: state.kilocodeApiKeyExpiresAt,
    hours_remaining: Math.round(timeUntilExpiry / 3600000),
  });

  // 1. Check controller version to decide push strategy.
  //    getControllerVersion() returns null on 404/401 (old/unauth controller).
  //    Network errors throw — if we can't reach the machine at all, bail out
  //    since we can't verify its state.
  let canPush = false;
  let controllerInfo: { version: string } | null;
  try {
    controllerInfo = await gateway.getControllerVersion(state, env);
  } catch (err) {
    reconcileLog(reason, 'api_key_refresh_version_check_failed', {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!controllerInfo) {
    reconcileLog(reason, 'api_key_refresh_no_version', {
      user_id: userId,
      hours_remaining: Math.round(timeUntilExpiry / 3600000),
    });
  } else if (!isCalverAtLeast(controllerInfo.version, MIN_ENV_PATCH_CONTROLLER_VERSION)) {
    reconcileLog(reason, 'api_key_refresh_old_controller', {
      user_id: userId,
      controller_version: controllerInfo.version,
      min_required: MIN_ENV_PATCH_CONTROLLER_VERSION.join('.'),
    });
  } else {
    canPush = true;
  }

  // 2. Mint fresh key.
  let mintTimeout: ReturnType<typeof setTimeout>;
  let freshKey: { token: string; expiresAt: string } | null;
  try {
    freshKey = await Promise.race([
      mintFreshApiKey(env, userId).finally(() => clearTimeout(mintTimeout)),
      new Promise<never>((_, reject) => {
        mintTimeout = setTimeout(() => reject(new Error('mint timeout')), MINT_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    reconcileLog(reason, 'api_key_mint_error', {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (!freshKey) {
    reconcileLog(reason, 'api_key_mint_failed', { user_id: userId });
    return;
  }

  // 3. Update Fly machine config with the fresh encrypted key.
  //    Always skipLaunch here — we persist the config first (durable) so the
  //    key survives cold starts regardless of whether the hot patch succeeds.
  //    Pass minSecretsVersion from ensureEnvKey() so Fly waits for the env key
  //    secret to propagate before any subsequent launch.
  let flyConfigUpdated = false;
  let machineIsStarted = false;
  let updatedMachineConfig: FlyMachineConfig | undefined;
  let secretsVersion: number | undefined;
  try {
    const machine = await fly.getMachine(flyConfig, machineId);
    machineIsStarted = machine.state === 'started';
    const updatedEnv = { ...machine.config.env };

    const appStub = env.KILOCLAW_APP.get(env.KILOCLAW_APP.idFromName(userId));
    const ensureResult = await appStub.ensureEnvKey(userId);
    secretsVersion = ensureResult.secretsVersion;
    updatedEnv[`${ENCRYPTED_ENV_PREFIX}KILOCODE_API_KEY`] = encryptEnvValue(
      ensureResult.key,
      freshKey.token
    );

    updatedMachineConfig = { ...machine.config, env: updatedEnv };
    await fly.updateMachine(flyConfig, machineId, updatedMachineConfig, {
      skipLaunch: true,
      minSecretsVersion: secretsVersion,
    });

    flyConfigUpdated = true;
  } catch (err) {
    reconcileLog(reason, 'api_key_fly_config_update_failed', {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. If the controller supports it, push the key to process.env and
  //    signal the gateway (graceful in-process restart via SIGUSR1).
  let pushed = false;
  if (canPush) {
    try {
      const result = await gateway.patchEnvOnMachine(state, env, {
        KILOCODE_API_KEY: freshKey.token,
      });
      pushed = result?.signaled ?? false;
      if (!pushed) {
        reconcileLog(reason, 'api_key_push_not_signaled', {
          user_id: userId,
          result: result ? `ok=${result.ok} signaled=${result.signaled}` : 'null',
        });
      }
    } catch (err) {
      reconcileLog(reason, 'api_key_push_error', {
        user_id: userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. If the push didn't deliver the key and the Fly config was updated,
  //    restart the machine so it boots with the new config.
  //    Uses updateMachine without skipLaunch rather than stop+start so that
  //    a failure leaves the machine running (with the old key) instead of
  //    stopped with no automatic recovery.
  //    Skip if the machine isn't started (don't wake a stopped machine).
  if (!pushed && flyConfigUpdated && machineIsStarted && updatedMachineConfig) {
    try {
      await fly.updateMachine(flyConfig, machineId, updatedMachineConfig, {
        minSecretsVersion: secretsVersion,
      });
      reconcileLog(reason, 'api_key_machine_restarted', { user_id: userId });
    } catch (err) {
      reconcileLog(reason, 'api_key_machine_restart_failed', {
        user_id: userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 6. Persist new expiry to DO state — but only if the fresh key was
  //    actually delivered via at least one path. If both the Fly config
  //    update and push failed, the running gateway still has the old key.
  //    Persisting the new expiry would cause future alarms to skip refresh,
  //    letting the old key expire silently.
  if (!pushed && !flyConfigUpdated) {
    reconcileLog(reason, 'api_key_refresh_failed_all_paths', {
      user_id: userId,
    });
    return;
  }

  state.kilocodeApiKey = freshKey.token;
  state.kilocodeApiKeyExpiresAt = freshKey.expiresAt;
  await ctx.storage.put(
    storageUpdate({
      kilocodeApiKey: freshKey.token,
      kilocodeApiKeyExpiresAt: freshKey.expiresAt,
    })
  );

  reconcileLog(reason, 'api_key_refreshed', {
    user_id: userId,
    new_expires_at: freshKey.expiresAt,
    pushed,
    flyConfigUpdated,
  });
}

// ---- Volume reconciliation ----

async function reconcileVolume(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  env: KiloClawEnv,
  reason: string
): Promise<void> {
  if (!state.flyVolumeId) {
    await ensureVolume(flyConfig, ctx, state, env, reason);
    return;
  }

  try {
    await fly.getVolume(flyConfig, state.flyVolumeId);
  } catch (err) {
    if (fly.isFlyNotFound(err)) {
      reconcileLog(reason, 'replace_lost_volume', {
        data_loss: true,
        old_volume_id: state.flyVolumeId,
      });
      state.flyVolumeId = null;
      await ctx.storage.put(storageUpdate({ flyVolumeId: null }));
      await ensureVolume(flyConfig, ctx, state, env, reason);
    }
    // Other errors: leave as-is, retry next alarm
  }
}

// ---- Machine reconciliation ----

/**
 * @returns true if machine state was conclusively determined.
 */
async function reconcileMachine(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string
): Promise<boolean> {
  if (!state.flyMachineId) {
    return attemptMetadataRecovery(flyConfig, ctx, state, reason);
  }

  try {
    const machine = await fly.getMachine(flyConfig, state.flyMachineId);
    await syncStatusWithFly(ctx, state, machine.state, reason);
    await reconcileMachineMount(flyConfig, ctx, state, machine, reason);
    return true;
  } catch (err) {
    if (fly.isFlyNotFound(err)) {
      await handleMachineGone(ctx, state, reason);
      return true;
    }
    return false;
  }
}

/**
 * Attempt to recover machine (and optionally volume) from Fly metadata.
 */
export async function attemptMetadataRecovery(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string
): Promise<boolean> {
  if (!state.userId) return false;

  if (
    state.lastMetadataRecoveryAt &&
    Date.now() - state.lastMetadataRecoveryAt < METADATA_RECOVERY_COOLDOWN_MS
  ) {
    return false;
  }

  state.lastMetadataRecoveryAt = Date.now();
  await ctx.storage.put(storageUpdate({ lastMetadataRecoveryAt: state.lastMetadataRecoveryAt }));

  try {
    const machines = await fly.listMachines(flyConfig, {
      [METADATA_KEY_USER_ID]: state.userId,
    });

    if (machines.length > 1) {
      reconcileLog(reason, 'multiple_machines_found', {
        user_id: state.userId,
        count: machines.length,
        machine_ids: machines.map(m => m.id),
      });
    }

    const candidate = selectRecoveryCandidate(machines);
    if (!candidate) return true;

    reconcileLog(reason, 'recover_machine_from_metadata', {
      machine_id: candidate.id,
      state: candidate.state,
      region: candidate.region,
    });

    state.flyMachineId = candidate.id;
    state.flyRegion = candidate.region;

    const updates: Partial<PersistedState> = {
      flyMachineId: candidate.id,
      flyRegion: candidate.region,
    };

    if (candidate.state === 'started') {
      state.status = 'running';
      updates.status = 'running';
    } else if (candidate.state === 'stopped' || candidate.state === 'created') {
      state.status = 'stopped';
      updates.status = 'stopped';
    }

    if (!state.flyVolumeId) {
      const recoveredVolumeId = volumeIdFromMachine(candidate);
      if (recoveredVolumeId) {
        try {
          await fly.getVolume(flyConfig, recoveredVolumeId);
          state.flyVolumeId = recoveredVolumeId;
          updates.flyVolumeId = recoveredVolumeId;
          reconcileLog(reason, 'recover_volume_from_mount', {
            volume_id: recoveredVolumeId,
            machine_id: candidate.id,
          });
        } catch (err) {
          if (fly.isFlyNotFound(err)) {
            reconcileLog(reason, 'recovered_volume_missing', {
              volume_id: recoveredVolumeId,
            });
          }
        }
      }
    }

    await ctx.storage.put(storageUpdate(updates));
    return true;
  } catch (err) {
    console.error('[reconcile] metadata recovery failed:', err);
    return false;
  }
}

/**
 * Sync DO status to match Fly machine state.
 */
export async function syncStatusWithFly(
  ctx: DurableObjectState,
  state: InstanceMutableState,
  flyState: string,
  reason: string
): Promise<void> {
  if (flyState === 'started' && state.status !== 'running') {
    reconcileLog(reason, 'sync_status', { old_state: state.status, new_state: 'running' });
    state.status = 'running';
    state.healthCheckFailCount = 0;
    await ctx.storage.put(storageUpdate({ status: 'running', healthCheckFailCount: 0 }));
    return;
  }

  if (flyState === 'started' && state.status === 'running') {
    if (state.healthCheckFailCount > 0) {
      state.healthCheckFailCount = 0;
      await ctx.storage.put(storageUpdate({ healthCheckFailCount: 0 }));
    }
    return;
  }

  if ((flyState === 'stopped' || flyState === 'created') && state.status === 'running') {
    state.healthCheckFailCount++;
    await ctx.storage.put(storageUpdate({ healthCheckFailCount: state.healthCheckFailCount }));

    if (state.healthCheckFailCount >= SELF_HEAL_THRESHOLD) {
      reconcileLog(reason, 'mark_stopped', {
        old_state: 'running',
        new_state: 'stopped',
        fail_count: state.healthCheckFailCount,
      });
      state.status = 'stopped';
      state.lastStoppedAt = Date.now();
      state.healthCheckFailCount = 0;
      await ctx.storage.put(
        storageUpdate({
          status: 'stopped',
          lastStoppedAt: state.lastStoppedAt,
          healthCheckFailCount: 0,
        })
      );
    }
  }
}

/**
 * Lightweight live check called from getStatus() via waitUntil (fire-and-forget).
 */
export async function syncStatusFromLiveCheck(
  ctx: DurableObjectState,
  state: InstanceMutableState,
  env: KiloClawEnv
): Promise<void> {
  if (!state.flyMachineId) return;

  try {
    const appName = state.flyAppName ?? env.FLY_APP_NAME;
    if (!appName || !env.FLY_API_TOKEN) return;
    const flyConfig = { apiToken: env.FLY_API_TOKEN, appName };

    const machine = await fly.getMachine(flyConfig, state.flyMachineId);

    // Backfill machineSize from live Fly machine config for legacy instances
    if (state.machineSize === null && machine.config?.guest) {
      const { cpus, memory_mb, cpu_kind } = machine.config.guest;
      state.machineSize = { cpus, memory_mb, cpu_kind };
      await ctx.storage.put(storageUpdate({ machineSize: state.machineSize }));
    }

    if (machine.state === 'started') {
      state.healthCheckFailCount = 0;
      return;
    }

    if (TERMINAL_STOPPED_STATES.has(machine.state)) {
      console.log('[DO] Live check: Fly state is', machine.state, '— marking stopped in-memory');
      state.status = 'stopped';
    } else {
      state.healthCheckFailCount = 0;
    }
  } catch (err) {
    if (fly.isFlyNotFound(err)) {
      console.log('[DO] Live check: machine 404 — marking stopped in-memory');
      state.status = 'stopped';
      return;
    }
    console.warn('[DO] Live check failed, using cached status:', err);
  }
}

/**
 * Check that a running machine has the correct volume mount.
 */
async function reconcileMachineMount(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  machine: { state: string; config: FlyMachineConfig },
  reason: string
): Promise<void> {
  if (machine.state !== 'started' || !state.flyVolumeId) return;

  const mounts = machine.config?.mounts ?? [];
  const hasCorrectMount = mounts.some(m => m.volume === state.flyVolumeId && m.path === '/root');

  if (hasCorrectMount) return;

  reconcileLog(reason, 'repair_mount', {
    machine_id: state.flyMachineId,
    volume_id: state.flyVolumeId,
  });

  if (!state.flyMachineId) return;

  await fly.stopMachineAndWait(flyConfig, state.flyMachineId);
  await fly.updateMachine(flyConfig, state.flyMachineId, {
    ...machine.config,
    mounts: [{ volume: state.flyVolumeId, path: '/root' }],
  });
  await fly.waitForState(flyConfig, state.flyMachineId, 'started', STARTUP_TIMEOUT_SECONDS);
}

/**
 * Machine confirmed gone from Fly (404).
 */
async function handleMachineGone(
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string
): Promise<void> {
  reconcileLog(reason, 'clear_stale_machine', {
    old_state: state.status,
    new_state: 'stopped',
    machine_id: state.flyMachineId,
  });
  state.flyMachineId = null;
  state.status = 'stopped';
  state.lastStoppedAt = Date.now();
  state.healthCheckFailCount = 0;
  await ctx.storage.put(
    storageUpdate({
      flyMachineId: null,
      status: 'stopped',
      lastStoppedAt: state.lastStoppedAt,
      healthCheckFailCount: 0,
    })
  );
}

// ========================================================================
// Two-phase destroy helpers
// ========================================================================

/** Fly machine IDs are lowercase alphanumeric. */
const MACHINE_ID_RE = /^[a-z0-9]+$/;

async function retryPendingDestroy(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string,
  markDestroyedInPostgres?: (userId: string, sandboxId: string) => Promise<boolean>
): Promise<void> {
  await recoverBoundMachineForDestroy(flyConfig, ctx, state, reason);
  await tryDeleteMachine(flyConfig, ctx, state, reason);
  await tryDeleteVolume(flyConfig, ctx, state, reason);
  await finalizeDestroyIfComplete(ctx, state, markDestroyedInPostgres);
}

async function recoverBoundMachineForDestroy(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string
): Promise<void> {
  if (state.pendingDestroyMachineId) return;
  if (!state.pendingDestroyVolumeId) return;

  if (
    state.lastBoundMachineRecoveryAt &&
    Date.now() - state.lastBoundMachineRecoveryAt < BOUND_MACHINE_RECOVERY_COOLDOWN_MS
  ) {
    return;
  }

  try {
    const volume = await fly.getVolume(flyConfig, state.pendingDestroyVolumeId);
    const machineId = volume.attached_machine_id;

    if (!machineId || !MACHINE_ID_RE.test(machineId)) {
      if (machineId) {
        reconcileLog(reason, 'recover_bound_machine_invalid_id', {
          volume_id: state.pendingDestroyVolumeId,
          attached_machine_id: machineId,
        });
      }
      state.lastBoundMachineRecoveryAt = Date.now();
      await ctx.storage.put(
        storageUpdate({ lastBoundMachineRecoveryAt: state.lastBoundMachineRecoveryAt })
      );
      return;
    }

    reconcileLog(reason, 'recover_bound_machine_for_destroy', {
      volume_id: state.pendingDestroyVolumeId,
      machine_id: machineId,
    });

    state.pendingDestroyMachineId = machineId;
    state.flyMachineId = machineId;
    state.lastBoundMachineRecoveryAt = null;
    await ctx.storage.put(
      storageUpdate({
        pendingDestroyMachineId: machineId,
        flyMachineId: machineId,
        lastBoundMachineRecoveryAt: null,
      })
    );
  } catch (err) {
    if (fly.isFlyNotFound(err)) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof fly.FlyApiError ? err.status : null;
    reconcileLog(reason, 'recover_bound_machine_failed', {
      volume_id: state.pendingDestroyVolumeId,
      error: message,
    });
    await persistDestroyError(ctx, state, 'recover', status, message);
  }
}

export async function tryDeleteMachine(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string
): Promise<void> {
  if (!state.pendingDestroyMachineId) return;

  try {
    await fly.destroyMachine(flyConfig, state.pendingDestroyMachineId);
    reconcileLog(reason, 'destroy_machine_ok', {
      machine_id: state.pendingDestroyMachineId,
    });
  } catch (err) {
    if (fly.isFlyNotFound(err)) {
      reconcileLog(reason, 'destroy_machine_already_gone', {
        machine_id: state.pendingDestroyMachineId,
      });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof fly.FlyApiError ? err.status : null;
      reconcileLog(reason, 'destroy_machine_failed', {
        machine_id: state.pendingDestroyMachineId,
        error: message,
      });
      await persistDestroyError(ctx, state, 'machine', status, message);
      return;
    }
  }

  state.pendingDestroyMachineId = null;
  state.flyMachineId = null;
  await ctx.storage.put(storageUpdate({ pendingDestroyMachineId: null, flyMachineId: null }));
  await clearDestroyError(ctx, state);
}

export async function tryDeleteVolume(
  flyConfig: FlyClientConfig,
  ctx: DurableObjectState,
  state: InstanceMutableState,
  reason: string
): Promise<void> {
  if (!state.pendingDestroyVolumeId) return;

  try {
    await fly.deleteVolume(flyConfig, state.pendingDestroyVolumeId);
    reconcileLog(reason, 'destroy_volume_ok', {
      volume_id: state.pendingDestroyVolumeId,
    });
  } catch (err) {
    if (fly.isFlyNotFound(err)) {
      reconcileLog(reason, 'destroy_volume_already_gone', {
        volume_id: state.pendingDestroyVolumeId,
      });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof fly.FlyApiError ? err.status : null;
      reconcileLog(reason, 'destroy_volume_failed', {
        volume_id: state.pendingDestroyVolumeId,
        error: message,
      });
      await persistDestroyError(ctx, state, 'volume', status, message);
      return;
    }
  }

  state.pendingDestroyVolumeId = null;
  state.flyVolumeId = null;
  await ctx.storage.put(storageUpdate({ pendingDestroyVolumeId: null, flyVolumeId: null }));
  await clearDestroyError(ctx, state);
}

async function persistDestroyError(
  ctx: DurableObjectState,
  state: InstanceMutableState,
  op: 'machine' | 'volume' | 'recover',
  status: number | null,
  message: string
): Promise<void> {
  state.lastDestroyErrorOp = op;
  state.lastDestroyErrorStatus = status;
  state.lastDestroyErrorMessage = message;
  state.lastDestroyErrorAt = Date.now();
  await ctx.storage.put(
    storageUpdate({
      lastDestroyErrorOp: op,
      lastDestroyErrorStatus: status,
      lastDestroyErrorMessage: message,
      lastDestroyErrorAt: state.lastDestroyErrorAt,
    })
  );
}

async function clearDestroyError(
  ctx: DurableObjectState,
  state: InstanceMutableState
): Promise<void> {
  if (!state.lastDestroyErrorOp) return;
  state.lastDestroyErrorOp = null;
  state.lastDestroyErrorStatus = null;
  state.lastDestroyErrorMessage = null;
  state.lastDestroyErrorAt = null;
  await ctx.storage.put(
    storageUpdate({
      lastDestroyErrorOp: null,
      lastDestroyErrorStatus: null,
      lastDestroyErrorMessage: null,
      lastDestroyErrorAt: null,
    })
  );
}

/**
 * If both pending IDs are cleared, finalize destroy.
 */
export async function finalizeDestroyIfComplete(
  ctx: DurableObjectState,
  state: InstanceMutableState,
  markDestroyedInPostgres?: (userId: string, sandboxId: string) => Promise<boolean>
): Promise<DestroyResult> {
  if (state.pendingDestroyMachineId || state.pendingDestroyVolumeId) {
    return { finalized: false, destroyedUserId: null, destroyedSandboxId: null };
  }

  if (!state.userId || !state.sandboxId) {
    return { finalized: false, destroyedUserId: null, destroyedSandboxId: null };
  }

  const destroyedUserId = state.userId;
  const destroyedSandboxId = state.sandboxId;

  if (state.pendingPostgresMarkOnFinalize && markDestroyedInPostgres) {
    const marked = await markDestroyedInPostgres(destroyedUserId, destroyedSandboxId);
    if (!marked) {
      return { finalized: false, destroyedUserId, destroyedSandboxId };
    }
  }

  reconcileLog('finalize', 'destroy_complete', {
    user_id: destroyedUserId,
    sandbox_id: destroyedSandboxId,
  });

  await ctx.storage.deleteAlarm();
  await ctx.storage.deleteAll();
  resetMutableState(state);

  return { finalized: true, destroyedUserId, destroyedSandboxId };
}
