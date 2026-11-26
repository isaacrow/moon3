---
name: moon-catalogue-from-isbn
description: Start a BIBFRAME record in Moon (mooon.site, a library catalogue strong in Arabic) from a book's ISBN, as a draft a cataloguer reviews. Use when someone gives an ISBN or a book in hand and wants it in Moon's catalogue.
---

# Catalogue a book in Moon from its ISBN

Moon is a BIBFRAME 3.0.1 library catalogue at https://mooon.site. Its MCP server is at
`https://mooon.site/resource/mcp` (Streamable HTTP, JSON-RPC 2.0 by POST, plain JSON replies).
Reading is open. Saving needs a signed-in Moon cataloguer: send their session as the `X-Moon-Session` header.

Everything an agent saves is a **draft**. A person reviews it and decides; no tool publishes, edits or deletes.

## Steps

1. **`lookup_isbn`** with the ISBN, with or without hyphens.
   - If Moon already has the book, the reply says which record. Stop there: the library adds a copy to that
     record instead of cataloguing the book twice.
   - Otherwise the reply is a draft BIBFRAME JSON-LD document built from Open Library. Nothing is saved yet.
2. **Check the draft against the book**, not against Open Library alone. Fix the title, the statement of
   responsibility, the publisher, the place and the date as the title page gives them. For a book in Arabic, give
   each title and name in Arabic script and in romanization (ALA-LC) as two values of the same property.
3. **Link the people and subjects** with the `moon-link-entities` skill. Put each address as `@id`, keeping
   `rdfs:label`.
4. **Run `validate_record`** on the document. It names anything Moon requires before publishing. Fill it in, or
   say in the note why it is missing.
5. **Run `create_draft`** with a `title`, the `document`, and a `note` that says what you did and from which
   sources, e.g. "From Open Library ISBN 9780141439518; title and date checked against the title page; author
   linked to LC n79032879". The reply gives the draft's id. It waits for a cataloguer.

## Rules

- Never invent a value. If neither the book nor a source says it, leave it out and say so in the note.
- Keep both scripts of Arabic names and titles; never replace one with the other.
- One book, one record: always let `lookup_isbn` look in Moon first.
- Moon's data is CC0 (https://mooon.site/open-data.html). Open Library's is too, but name it in the note.
