---
name: moon-link-entities
description: Link the people, bodies, subjects and places in a BIBFRAME record to permanent addresses in Moon's authority file and at the Library of Congress, so the record carries linked entities instead of text. Use while cataloguing for Moon (mooon.site) or reviewing its records.
---

# Link names and subjects for Moon

Moon's MCP server is at `https://mooon.site/resource/mcp` (Streamable HTTP, JSON-RPC 2.0 by POST). Finding
entities is read-only and needs no account.

## Steps

1. For each person, body, subject or place in the record, call **`find_entities`** with its name and kind:
   `agent` for a person or body, `topic` for a subject, `place` for a place. Arabic-script and romanized names
   both work.
2. The reply lists Moon's own entities first, then LC's, each with a label and a permanent address (URI).
   **Prefer Moon's entity when there is one**: it already links to LC, VIAF or Wikidata, and it holds the
   Arabic-script name. LC often refuses requests from Moon's shared server addresses. When it does, the reply
   gives LC's own search address (`lcSearch`): ask it yourself, and use the `uri` of the hit you choose.
3. Choose only when the dates, the role or the subject leave no doubt. If two candidates could both be right,
   do not choose; say so in the note for the cataloguer.
4. Put the address in the record as `@id` on the agent, subject or place node. Keep its `rdfs:label`:
   ```json
   { "@type": "bf:Person", "@id": "http://id.loc.gov/authorities/names/n50052785", "rdfs:label": ["Ibn Khaldūn, 1332-1406", "ابن خلدون"] }
   ```
5. A name with no good match stays as text, with its label. A cataloguer makes the entity in Moon Studio.

## Rules

- A wrong link is worse than no link. When in doubt, leave the text and explain in the note.
- Never change an entity in Moon; agents only read the authority file.
