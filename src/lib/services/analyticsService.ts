import { Link } from "@/lib/db/models/Link";
import { ClickStats } from "@/lib/db/models/ClickStats";
import { ReferrerStats } from "@/lib/db/models/ReferrerStats";
import { DrainMeta, LAST_DRAIN_DOC_ID } from "@/lib/db/models/DrainMeta";

const TIME_RANGE_DAYS = 30;
const TOP_REFERRERS_LIMIT = 5;

export interface DailyClicks {
  date: string;
  clicks: number;
}

export interface ReferrerBreakdown {
  referrer: string;
  clicks: number;
}

export interface LinkBreakdown {
  shortCode: string;
  longUrl: string;
  totalClicks: number;
}

export interface AnalyticsSummary {
  clicksOverTime: DailyClicks[];
  topReferrers: ReferrerBreakdown[];
  linkBreakdown: LinkBreakdown[];
  lastDrainedAt: string | null;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function zeroFillDateRange(counts: Map<string, number>, days: number): DailyClicks[] {
  const result: DailyClicks[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const key = toDateKey(date);
    result.push({ date: key, clicks: counts.get(key) ?? 0 });
  }
  return result;
}

export async function getAnalyticsForUser(userId: string): Promise<AnalyticsSummary> {
  const links = await Link.find({ userId }).select("shortCode longUrl");
  const shortCodes = links.map((link) => link.shortCode);

  if (shortCodes.length === 0) {
    const lastDrain = await DrainMeta.findById(LAST_DRAIN_DOC_ID);
    return {
      clicksOverTime: zeroFillDateRange(new Map(), TIME_RANGE_DAYS),
      topReferrers: [],
      linkBreakdown: [],
      lastDrainedAt: lastDrain?.lastDrainedAt.toISOString() ?? null,
    };
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (TIME_RANGE_DAYS - 1));
  const cutoffKey = toDateKey(cutoff);

  const [dailyRows, perLinkRows, referrerRows, lastDrain] = await Promise.all([
    ClickStats.aggregate<{ _id: string; clicks: number }>([
      { $match: { shortCode: { $in: shortCodes }, date: { $gte: cutoffKey } } },
      { $group: { _id: "$date", clicks: { $sum: "$clicks" } } },
    ]),
    ClickStats.aggregate<{ _id: string; totalClicks: number }>([
      { $match: { shortCode: { $in: shortCodes } } },
      { $group: { _id: "$shortCode", totalClicks: { $sum: "$clicks" } } },
    ]),
    ReferrerStats.aggregate<{ _id: string; clicks: number }>([
      { $match: { shortCode: { $in: shortCodes } } },
      { $group: { _id: "$referrer", clicks: { $sum: "$count" } } },
      { $sort: { clicks: -1 } },
      { $limit: TOP_REFERRERS_LIMIT },
    ]),
    DrainMeta.findById(LAST_DRAIN_DOC_ID),
  ]);

  const dailyCounts = new Map(dailyRows.map((row) => [row._id, row.clicks]));
  const clicksOverTime = zeroFillDateRange(dailyCounts, TIME_RANGE_DAYS);

  const totalsByShortCode = new Map(perLinkRows.map((row) => [row._id, row.totalClicks]));
  const linkBreakdown: LinkBreakdown[] = links
    .map((link) => ({
      shortCode: link.shortCode,
      longUrl: link.longUrl,
      totalClicks: totalsByShortCode.get(link.shortCode) ?? 0,
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks);

  const topReferrers: ReferrerBreakdown[] = referrerRows.map((row) => ({
    referrer: row._id,
    clicks: row.clicks,
  }));

  return {
    clicksOverTime,
    topReferrers,
    linkBreakdown,
    lastDrainedAt: lastDrain?.lastDrainedAt.toISOString() ?? null,
  };
}
