# Geospatial labeling QA rules

*A practical guide for reviewers and annotators. This is guidance, not a compliance certification.*

## The key distinction

Some checks come from published standards. Others are **project decisions**: they make a dataset useful and reviewable, but no cited standard chooses the value for you.

## Grounded in standards

- **GeoJSON coordinates:** For RFC 7946 GeoJSON, coordinates use **WGS 84 longitude, latitude** order. An optional altitude may be a third coordinate. Polygon rings are closed; the exterior ring is counterclockwise and interior rings are clockwise. However, parsers **SHOULD NOT reject** older winding order. See [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946).
- **Geometry model and reference systems:** [OGC Simple Feature Access](https://www.ogc.org/standard/sfa/) defines a common geometry model and association with a spatial reference system.
- **Quality reporting:** [ISO 19157-1:2023](https://www.iso.org/standard/78900.html) defines principles for describing, evaluating, and reporting geographic-data quality. It explicitly does **not** set universally acceptable minimum quality levels.
- **Reference metadata:** The official [geoBoundaries API metadata](https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/) identifies Nigeria ADM1 as 37 units, boundary year 2022, sourced from GRID3, with a CC BY 4.0 license. The [geoBoundaries site](https://www.geoboundaries.org/) requires attribution when using the data.

**Important CRS note:** GeoLabel’s internal API accepts an explicit CRS as an app-level extension. Do not describe projected-coordinate data as RFC 7946-compliant GeoJSON. Export or transform to CRS84/WGS 84 longitude-latitude when standard GeoJSON is required.

## Project-specific rules to decide and version

Write these choices into a versioned taxonomy or labeling specification. Do not silently change them between batches:

- **Identity and provenance:** stable label IDs; source dataset, boundary year, license, attribution, annotator, timestamp, and transformation history.
- **Schema:** required fields, allowed class values, null policy, naming/casing, and whether multipart features are allowed.
- **Geometry acceptance:** valid and non-empty geometry; permitted geometry types; overlap, gap, sliver, and connectivity policy; and tolerance values. Structural validity is necessary, not sufficient.
- **Semantics:** what each class means, inclusion/exclusion examples, boundary interpretation, and escalation rules for ambiguous imagery or source evidence.
- **Review design:** double annotation for a defined sample or all high-risk classes; a representative, versioned gold set; adjudication; per-class metrics; and geometry-appropriate spatial metrics (not only exact-match scores).
- **Thresholds:** establish acceptance thresholds through a pilot, then record dataset version, sample design, metric definitions, and rationale. ISO 19157-1 provides a quality framework, not these project thresholds.
- **Auditability:** preserve original labels, reviewer decisions, comments, evidence, revisions, and timestamps. Never auto-accept a label solely because structural validation passed. Structural or taxonomy checks do not establish agreement with ground truth; that requires verified reference labels and a representative evaluation design.

## A phone-friendly review sequence

1. **Identify:** confirm stable ID, class, required fields, source, and provenance.
2. **Reference:** confirm CRS is explicit. For standard GeoJSON output, confirm CRS84/WGS 84 longitude-latitude coordinates and the relevant ring convention.
3. **Structure:** check non-empty, valid geometry and project-specific topology rules.
4. **Meaning:** compare the label with the taxonomy, examples, imagery, and source context.
5. **Independence:** apply double annotation or gold-set review where the project requires it; adjudicate disagreements.
6. **Measure:** report per-class and geometry-appropriate metrics against pilot-established thresholds.
7. **Record:** save the decision, evidence, reviewer, timestamp, and taxonomy/dataset version.

## Prioritized rules

1. Preserve stable IDs, provenance, licensing, attribution, and review history.
2. Make CRS explicit; do not call projected data RFC 7946-compliant; export standard GeoJSON in CRS84/WGS 84 longitude-latitude order.
3. Reject empty or invalid geometry and enforce required fields and allowed class values.
4. Review human meaning independently of structural validation; never auto-accept on structure alone.
5. Use double annotation or a representative gold set, then report per-class, geometry-appropriate metrics.
6. Set and version thresholds through a pilot, with documented adjudication and taxonomy changes.
