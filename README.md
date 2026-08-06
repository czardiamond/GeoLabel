What the Project Does
Manual geospatial annotation for computer vision models (building extraction, solar PV detection, maritime tracking) is notoriously time-consuming and prone to human labeling errors.

Interactive Annotation Studio is a full-featured, human-in-the-loop geospatial labeling and quality assurance platform designed for AI engineers and GIS annotators. It combines AI-assisted pre-labeling with precision vector drawing tools, real-time spatial analytics, and automated SLA audit scoring to accelerate dataset preparation for satellite computer vision pipelines.

Key Features:
AI-Assisted Pre-Labeling ("Suggest AI"): Generates predicted bounding boxes and multi-class polygon masks using vision transformer models for rapid verification and manual adjustment.

Multi-Modal Labeling Modes:

Vector BBox & Polygon Layering: Orthogonal snapping, vertex handle editing, and vertex locking.

10×10 Semantic Segmentation: Pixel-grid brush painting for fine-grained coverage (roofs, water, solar, vegetation).

4×4 Grid Land-Use Classification: Macro-tile land-use categorization with real-time class assignments.

Real-Time Annotation Summary Sidebar: Live spatial statistics calculating total labeled area (
), percentage of satellite tile coverage, class object counts, and AI confidence distribution.

Density Heatmap Overlay: Visualizes spatial label density and identifies high-risk QA inspection zones.

Automated Senior SLA Audit Engine: Instant compliance scoring against ground-truth benchmarks for overlap detection, coordinate fidelity, and boundary completeness.

Multi-Format Machine Learning Export: Native export to GeoJSON, COCO JSON, YOLO (.txt), and CSV.

How to Use It

1. Select Task Mode & Satellite Tile
Choose a Task Mode from the top header:

Bounding Box / Polygon Detection (for object-level feature mapping)

Semantic Segmentation (for 10×10 grid pixel painting)

Grid Classification (for 4×4 macro land-use tagging)

Load Satellite Tiles: Click the tile selector or open the Batch Task Queue Manager (Q) to switch locations (e.g., Dubai Palm Jumeirah, Rotterdam Port Container Terminal, Amazon Canopy).

2. Generate & Edit Annotations
AI Pre-Labeling: Click "Suggest Annotations (GeoAI)" in the top toolbar or right sidebar. The system automatically populates predicted vector masks for instant review.

Manual Vector Drawing:

Select Polygon (P) or BBox (B) tool.

Click on the canvas to place coordinates.

Enable Ortho Snapping (O) for clean 90° architectural corners on buildings and solar arrays.

Click existing vertices to tweak shapes, drag corners, or lock layers (L).

3. Monitor Real-Time Spatial Analytics
Open the Annotation Summary sidebar tab on the right:

Labeled Area: Tracks total square meters (
) annotated in real-time.

Tile Coverage: Displays the percentage of the satellite tile mapped.

Class Breakdown: Monitors object counts and surface coverage per label class (Building Roofs, Solar PV, Cargo Vessels, Vegetation Canopy, etc.).

Toggle the Density Heatmap (H) overlay to spot label density clusters and unannotated gaps.

4. Run Quality Audit & Export Datasets
Run Senior Audit: Click "Submit for Senior Audit Scoring" to evaluate your annotations against precision SLA rulesets and receive instant score feedback (Pass, Escalate, or Fail).

Export Machine-Ready Datasets:

Switch to the Deliverable Payload tab or click "Export Sample".

Choose your target format: GeoJSON, COCO, YOLO, or CSV.

Copy the live payload directly to your clipboard or download the dataset file for model training.

