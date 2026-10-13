import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal"
import { anonymous } from "better-auth/plugins/anonymous"

import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import authConfig from "./auth.config"

declare const process: { env: Record<string, string | undefined> }

// Players: Better Auth users, stored in its Convex component. For now everyone plays as an
// anonymous guest; a sign-in provider can be added later and linked to it.
export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.SITE_URL,
    database: authComponent.adapter(ctx),
    trustedOrigins: process.env.SITE_URL ? [process.env.SITE_URL] : [],
    plugins: [anonymous(), convex({ authConfig })],
  } satisfies BetterAuthOptions)

// The signed-in player's stable Convex identity, or null for a visitor who hasn't started.
export const playerId = async (ctx: QueryCtx) =>
  (await ctx.auth.getUserIdentity())?.tokenIdentifier ?? null
