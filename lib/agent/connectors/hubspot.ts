import "server-only";

export type HubSpotUpsertResult = { ok: true; contactId: string } | { ok: false; error: string };

/** Create or update a HubSpot contact by email. */
export async function upsertContact(
  accessToken: string,
  email: string,
  fields: Record<string, string>,
): Promise<HubSpotUpsertResult> {
  const properties = { email, ...fields };
  // Try to create; on conflict (409) update the existing contact.
  const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ properties }),
  });

  if (createRes.ok) {
    const json = (await createRes.json()) as { id?: string };
    return { ok: true, contactId: json.id ?? "" };
  }

  if (createRes.status === 409) {
    // Contact already exists — search by email and update.
    const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }] }),
    });
    if (!searchRes.ok) return { ok: false, error: `search HTTP ${searchRes.status}` };
    const results = (await searchRes.json()) as { results?: { id: string }[] };
    const id = results.results?.[0]?.id;
    if (!id) return { ok: false, error: "Contact not found after conflict" };

    const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ properties }),
    });
    if (!updateRes.ok) return { ok: false, error: `update HTTP ${updateRes.status}` };
    return { ok: true, contactId: id };
  }

  const err = (await createRes.json().catch(() => ({}))) as { message?: string };
  return { ok: false, error: err.message ?? `HTTP ${createRes.status}` };
}
