import type { SessionMessageAssistant, SessionMessageInfo, TokenUsageInfo } from "@opencode/client"
import type { Context } from "@opencode/plugin/tui/context"
import { isPeak, readConfig } from "./config"
import { share } from "./format"
import { costOf, ratesFor } from "./pricing"
import type { Bucket, Counts, Usage } from "./types"

const ZERO: Counts = { input: 0, output: 0, reasoning: 0, cacheRead: 0 }

const FIELDS: Array<[keyof Counts, string]> = [
  ["input", "input"],
  ["output", "output"],
  ["reasoning", "reasoning"],
  ["cacheRead", "cache read"],
]

const MESSAGE_PAGE = 200

export type ReadResult = {
  models: Usage[]
  cost: number
  surcharge: number
  hasPeak: boolean
  context: { tokens: number; percent: number | null }
}

export const EMPTY_READ: ReadResult = {
  models: [],
  cost: 0,
  surcharge: 0,
  hasPeak: false,
  context: { tokens: 0, percent: null },
}

function counts(tokens: TokenUsageInfo): Counts {
  return {
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cacheRead: tokens.cache.read,
  }
}

function merge(a: Counts, b: Counts): Counts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    cacheRead: a.cacheRead + b.cacheRead,
  }
}

function total(value: Counts): number {
  return value.input + value.output + value.reasoning + value.cacheRead
}

function isAssistantWithOutput(
  m: SessionMessageInfo,
): m is SessionMessageAssistant & { tokens: NonNullable<SessionMessageAssistant["tokens"]> } {
  return m.type === "assistant" && (m.tokens?.output ?? 0) > 0
}

// Full pages through the client, not data.session.message.sync: that call
// replaces the host transcript cache with a single short page, and the host
// does not keep the plugin-visible message cache populated on every build.
async function listAllMessages(context: Context, sessionID: string): Promise<readonly SessionMessageInfo[]> {
  const collected: SessionMessageInfo[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await context.client.message.list({
      sessionID,
      limit: MESSAGE_PAGE,
      ...(cursor ? { cursor } : { order: "asc" as const }),
    })
    collected.push(...page.data)
    const next = page.cursor.next ?? undefined
    if (!next || seen.has(next)) break
    seen.add(next)
    cursor = next
  }
  return collected
}

async function sessionMessages(context: Context, sessionID: string): Promise<readonly SessionMessageInfo[]> {
  try {
    return await listAllMessages(context, sessionID)
  } catch {
    // Fall back to whatever the host transcript has cached for this session.
    try {
      return context.data.session.message.list(sessionID) ?? []
    } catch {
      return []
    }
  }
}

function contextOf(
  context: Context,
  messages: readonly SessionMessageInfo[],
): { tokens: number; percent: number | null } {
  const last = messages.findLast(isAssistantWithOutput)
  if (!last) return { tokens: 0, percent: null }
  const tokens =
    last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
  const location = context.location ?? context.data.location.default()
  const models = context.data.location.model.list(location) ?? []
  const model = models.find((item) => item.providerID === last.model.providerID && item.modelID === last.model.id)
  return { tokens, percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null }
}

export async function read(
  context: Context,
  sessionID: string,
  options: Record<string, unknown> | undefined,
): Promise<ReadResult> {
  if (!sessionID) return EMPTY_READ
  const config = readConfig(options)
  const buckets = new Map<string, Bucket>()
  let surcharge = 0

  const messages = await sessionMessages(context, sessionID)

  for (const message of messages) {
    if (message.type !== "assistant") continue
    if (!message.tokens) continue
    const value = counts(message.tokens)
    if (total(value) === 0) continue

    const key = `${message.model.providerID}/${message.model.id}`
    let bucket = buckets.get(key)
    if (!bucket) {
      const info = ratesFor(context, message.model.providerID, message.model.id, config)
      bucket = {
        key,
        name: info.name,
        explicit: info.explicit,
        known: false,
        off: info.off,
        peak: info.peak,
        tokens: ZERO,
        cost: 0,
      }
      buckets.set(key, bucket)
    }

    bucket.tokens = merge(bucket.tokens, value)

    if (bucket.explicit) {
      const onPeak = bucket.peak !== undefined && isPeak(config, message.time.created)
      const rates = onPeak && bucket.peak ? bucket.peak : bucket.off
      const actual = costOf(value, rates)
      bucket.cost += actual
      if (onPeak) surcharge += actual - costOf(value, bucket.off)
    } else {
      bucket.cost += message.cost ?? 0
    }

    if (bucket.explicit || (message.cost ?? 0) > 0) bucket.known = true
  }

  const models = [...buckets.values()]
    .sort((a, b) => b.cost - a.cost || total(b.tokens) - total(a.tokens))
    .map<Usage>((bucket) => ({
      key: bucket.key,
      name: bucket.name,
      known: bucket.known,
      peak: bucket.peak !== undefined,
      cost: bucket.cost,
      tokens: total(bucket.tokens),
      rows: [
        { label: "Tokens", value: total(bucket.tokens), percent: "" },
        ...FIELDS.map(([field, label]) => ({
          label,
          value: bucket.tokens[field],
          percent: share(bucket.tokens[field], total(bucket.tokens)),
        })),
      ],
    }))

  return {
    models,
    cost: models.reduce((sum, model) => sum + model.cost, 0),
    surcharge,
    hasPeak: models.some((model) => model.peak),
    context: contextOf(context, messages),
  }
}
