"use server";

import { track, type EventName } from "@/lib/analytics";
import { getUser } from "@/lib/supabase/server";

// The only events the browser may report; everything else is recorded server-side.
const CLIENT_EVENTS = new Set<EventName>(["autofix_clicked"]);

export async function trackClientEvent(name: EventName, projectId?: string) {
  if (!CLIENT_EVENTS.has(name)) return;
  const { supabase, user } = await getUser();
  if (user) await track(supabase, name, {}, projectId);
}
