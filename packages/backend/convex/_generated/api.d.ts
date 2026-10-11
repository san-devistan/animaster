/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as animals from "../animals.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as ingest from "../ingest.js";
import type * as playback from "../playback.js";
import type * as rarity from "../rarity.js";
import type * as releases from "../releases.js";
import type * as songs__lib_audiometa from "../songs/_lib/audiometa.js";
import type * as songs__lib_crawl from "../songs/_lib/crawl.js";
import type * as songs__lib_dedupe from "../songs/_lib/dedupe.js";
import type * as songs__lib_deezer from "../songs/_lib/deezer.js";
import type * as songs__lib_rarity from "../songs/_lib/rarity.js";
import type * as songs__lib_validators from "../songs/_lib/validators.js";
import type * as species__lib_col from "../species/_lib/col.js";
import type * as species__lib_flow from "../species/_lib/flow.js";
import type * as species__lib_rarity from "../species/_lib/rarity.js";
import type * as species__lib_wikimedia from "../species/_lib/wikimedia.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  animals: typeof animals;
  catalog: typeof catalog;
  crons: typeof crons;
  ingest: typeof ingest;
  playback: typeof playback;
  rarity: typeof rarity;
  releases: typeof releases;
  "songs/_lib/audiometa": typeof songs__lib_audiometa;
  "songs/_lib/crawl": typeof songs__lib_crawl;
  "songs/_lib/dedupe": typeof songs__lib_dedupe;
  "songs/_lib/deezer": typeof songs__lib_deezer;
  "songs/_lib/rarity": typeof songs__lib_rarity;
  "songs/_lib/validators": typeof songs__lib_validators;
  "species/_lib/col": typeof species__lib_col;
  "species/_lib/flow": typeof species__lib_flow;
  "species/_lib/rarity": typeof species__lib_rarity;
  "species/_lib/wikimedia": typeof species__lib_wikimedia;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
