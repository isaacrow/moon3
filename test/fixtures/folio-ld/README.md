# FOLIO linked-data export samples

These files are copied unchanged from FOLIO's
[lib-linked-data-rdf4ld](https://github.com/folio-org/lib-linked-data-rdf4ld) at tag `v1.0.0`
(commit `50e919c4823fb3cd26e7d9300d85ea30b24a5233`), `src/test/resources/rdf/`. That release is the one
[mod-data-export](https://github.com/folio-org/mod-data-export) `v5.4.8` uses for its "Default linked data
export profile". Licence: Apache License 2.0, © The Open Library Foundation.

Each file is the exact output of `Rdf4LdMapper.mapLdToBibframe2Rdf` for one Instance: FOLIO's end-to-end tests
(`src/test/java/org/folio/rdf4ld/e2e/**/*MappingIT.java`) compare it as a string with the mapper's JSON-LD.
Those tests first replace the placeholders (`INSTANCE_ID`, `WORK_ID`, `CREATOR_ID` …) with the resources' numeric
ids. `test/folioLdImport.test.ts` does the same. It also sets the base address to the one mod-data-export
writes (`<FOLIO base URL>/linked-data-editor/resources/<id>`, from `ResourceUrlProvider`) and puts the files on one
line each, as a FOLIO export file has them.
