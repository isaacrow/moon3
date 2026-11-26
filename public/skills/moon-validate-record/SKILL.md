---
name: moon-validate-record
description: Check a BIBFRAME record against what Moon (mooon.site) requires before publishing, and against the BIBFRAME Interoperability Group's shapes, and explain the gaps in plain words. Use before saving a draft to Moon, or to review a record someone wrote.
---

# Check a BIBFRAME record for Moon

Moon's MCP server is at `https://mooon.site/resource/mcp` (Streamable HTTP, JSON-RPC 2.0 by POST). Checking is
read-only and needs no account.

## Steps

1. Make sure the document is JSON-LD with an `@graph` holding a `bf:Work` and a `bf:Instance`, the Instance
   linked to the Work with `bf:instanceOf`.
2. Call **`validate_record`** with `{ "document": … }`. The reply lists what is missing before Moon would publish
   it (LC's core requirements: main title, content, media and carrier types, mode of issuance, language, a
   contribution or a statement of responsibility, publication details …), or says nothing is missing.
3. Explain each gap to the person in their words. Arabic speakers get the explanation in Arabic.
4. Optionally compare with Moon's published records:
   - `search_records` and `get_record` show how a similar book was catalogued;
   - `sparql` answers questions across the catalogue, read-only (e.g. which records lack a subject).
5. For exchange with other BIBFRAME systems, Moon checks its published data against the BIBFRAME Interoperability
   Group's monograph shapes every day. See "Exchange" on https://mooon.site/score.html. A record that passes
   `validate_record` and has an LCCN, a date and a place of publication will usually meet them too.

## Rules

- Report problems; do not "fix" a record by inventing values.
- A Warning in BIG's shapes is a recommendation. Only a Violation means another system may refuse the record.
