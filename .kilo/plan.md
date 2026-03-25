# Plan: Admin UI for KiloClaw Region Management

## Goal

Add a "Regions" tab to the KiloClaw admin dashboard with a text input for setting the comma-separated region list, a reference table of valid regions, and a mixing warning. The worker gets new API routes for reading/writing the `fly-regions` KV key with Zod validation. The GitHub Actions workflow remains as an operational escape hatch.

## Architecture

```
Admin UI (text input + reference table)
    ↓ tRPC mutation
Next.js backend
    ↓ KiloClawInternalClient.getRegions() / .updateRegions()
Worker: GET/PUT /api/platform/regions
    ↓ reads/writes KV_CLAW_CACHE("fly-regions")
```

## Region Constants

**Worker** (`kiloclaw/src/durable-objects/regions.ts`) — already has `FLY_META_REGIONS`. Add:

```ts
export const FLY_SPECIFIC_REGIONS = [
  'arn',
  'cdg',
  'iad',
  'ams',
  'fra',
  'lhr',
  'lax',
  'ewr',
  'sjc',
  'ord',
  'dfw',
  'yyz',
] as const;

export const ALL_VALID_REGIONS = ['eu', 'us', ...FLY_SPECIFIC_REGIONS] as const;
```

**Next.js UI** (`src/app/admin/components/KiloclawRegions/region-constants.ts`) — same codes plus display labels/scores for the reference table.

## Validation Schema (Worker)

```ts
const UpdateRegionsSchema = z.object({
  regions: z
    .array(z.enum(ALL_VALID_REGIONS))
    .min(2, 'At least 2 regions required')
    .refine(
      regions => new Set(regions).size >= 2,
      'Must include at least 2 distinct regions (duplicates bias the shuffle, but need 2+ unique for fallback)'
    ),
});
```

Enforces: allowlist validation, minimum 2 total, minimum 2 distinct, duplicates allowed.

## Changes

### 1. Worker: Region constants (`kiloclaw/src/durable-objects/regions.ts`)

Add exported `FLY_SPECIFIC_REGIONS` and `ALL_VALID_REGIONS` constants.

### 2. Worker: Region API routes (`kiloclaw/src/routes/platform.ts`)

**`GET /api/platform/regions`** — Returns current config with source info:

```ts
Response: { regions: string[], source: 'kv' | 'env' | 'default', raw: string }
```

**`PUT /api/platform/regions`** — Validates with Zod schema, writes to KV:

```ts
Request:  { regions: string[] }
Response: { ok: true, regions: string[], raw: string }
```

### 3. Internal client (`src/lib/kiloclaw/kiloclaw-internal-client.ts`)

Add `getRegions()` and `updateRegions(regions: string[])` methods.

### 4. Types (`src/lib/kiloclaw/types.ts`)

Add `RegionsResponse` type.

### 5. tRPC router (`src/routers/admin-kiloclaw-regions-router.ts`)

New router with `getRegions` query and `updateRegions` mutation (both delegate to `KiloClawInternalClient`).

### 6. Register router (`src/routers/admin-router.ts`)

Add `kiloclawRegions: adminKiloclawRegionsRouter` at ~line 1311.

### 7. Admin UI (`src/app/admin/components/KiloclawRegions/`)

**`region-constants.ts`** — Region definitions with display metadata:

```ts
export const REGION_DEFINITIONS = {
  meta: [
    { code: 'eu', label: 'Europe', description: 'Fly meta-region — all EU datacenters' },
    { code: 'us', label: 'United States', description: 'Fly meta-region — all US datacenters' },
  ],
  specific: [
    { code: 'arn', label: 'Stockholm', score: 15.04 },
    { code: 'cdg', label: 'Paris', score: 14.63 },
    { code: 'iad', label: 'Ashburn', score: 13.85 },
    { code: 'ams', label: 'Amsterdam', score: 13.58 },
    { code: 'fra', label: 'Frankfurt', score: 13.16 },
    { code: 'lhr', label: 'London', score: 12.25 },
    { code: 'lax', label: 'Los Angeles', score: 9.68 },
    { code: 'ewr', label: 'Newark', score: 9.07 },
    { code: 'sjc', label: 'San Jose', score: 8.4 },
    { code: 'ord', label: 'Chicago', score: 8.2 },
    { code: 'dfw', label: 'Dallas', score: 6.8 },
    { code: 'yyz', label: 'Toronto', score: 5.17 },
  ],
} as const;
```

**`KiloclawRegionsPage.tsx`** — `RegionsTab` component:

Layout:

1. **Current config card** — Shows current regions as `Badge` pills, source indicator (KV/env/default), shuffle behavior note
2. **Reference table** — Two-section table listing all valid regions:
   - Meta regions (eu, us) with description
   - Specific regions with city, code, and score columns
3. **Text input** — Comma-separated region list input (e.g. `eu,us` or `dfw,dfw,ord`)
4. **Mixing warning** — Yellow alert banner shown when input contains both meta and specific regions: "Mixing meta and specific regions causes all regions to be shuffled, including the meta ones."
5. **Shuffle info** — Subtle note explaining: meta-only = ordered, specific = shuffled, duplicates = bias
6. **Save button** — Calls mutation, toast on success/error, refetches current config

Uses: `Card`, `Table`, `Input`, `Button`, `Badge`, `Alert` (shadcn), `toast` (sonner), `useQuery`/`useMutation` (tRPC + react-query pattern from `KiloclawVersionsPage`).

### 8. Dashboard tab (`src/app/admin/components/KiloclawDashboard.tsx`)

- Add `'regions'` to `VALID_TABS` and `Tab` type
- Add `<TabsTrigger value="regions">Regions</TabsTrigger>`
- Add `<TabsContent value="regions"><RegionsTab /></TabsContent>`

## File Change Summary

| File                                                               | Action                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `kiloclaw/src/durable-objects/regions.ts`                          | Add `FLY_SPECIFIC_REGIONS`, `ALL_VALID_REGIONS` exports                |
| `kiloclaw/src/routes/platform.ts`                                  | Add `GET /api/platform/regions` and `PUT /api/platform/regions` routes |
| `src/lib/kiloclaw/kiloclaw-internal-client.ts`                     | Add `getRegions()` and `updateRegions()` methods                       |
| `src/lib/kiloclaw/types.ts`                                        | Add `RegionsResponse` type                                             |
| `src/routers/admin-kiloclaw-regions-router.ts`                     | **New**: tRPC router with `getRegions` + `updateRegions`               |
| `src/routers/admin-router.ts`                                      | Register `kiloclawRegions` router                                      |
| `src/app/admin/components/KiloclawRegions/region-constants.ts`     | **New**: region definitions with labels/scores                         |
| `src/app/admin/components/KiloclawRegions/KiloclawRegionsPage.tsx` | **New**: `RegionsTab` component                                        |
| `src/app/admin/components/KiloclawDashboard.tsx`                   | Add "Regions" tab                                                      |

## Verification Plan

1. `pnpm typecheck` in kiloclaw/ — worker types
2. `pnpm test` in kiloclaw/ — add tests for new worker routes
3. `pnpm lint` in kiloclaw/
4. `pnpm typecheck` in root — Next.js types
5. Manual: open admin UI → Regions tab → verify reference table, enter regions, save, confirm toast + refetch
