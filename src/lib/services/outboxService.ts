import { OutboxEvent } from "@/lib/db/models/OutboxEvent";

interface ClickRequestInfo {
  referrer: string | null;
  userAgent: string | null;
}

export async function recordClickEvent(
  shortCode: string,
  request: ClickRequestInfo,
): Promise<void> {
  await OutboxEvent.create({
    shortCode,
    referrer: request.referrer,
    userAgent: request.userAgent,
  });
}
