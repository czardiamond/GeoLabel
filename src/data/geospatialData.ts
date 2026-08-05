import { ServiceCategory, ComparisonPoint, HowItWorksStep, QualityMetric } from '../types';

export const GEO_SERVICES: ServiceCategory[] = [
  {
    id: 'ai-ml-training',
    title: 'AI/ML Model Training Data',
    subtitle: 'Computer vision training labels for satellite, drone & aerial models',
    iconName: 'Cpu',
    description: 'High-precision annotation tailored for deep learning frameworks (YOLO, Mask R-CNN, Segment Anything Geo, U-Net). We deliver pixel-accurate segmentation masks and tightly fitting oriented bounding boxes.',
    keyUseCases: [
      'Oriented Bounding Boxes (OBB) for angled vehicles, vessels & aircraft',
      'Semantic & Instance segmentation for land cover and building footprints',
      'Multispectral classification (NDVI, Burn Severity, Flood Inundation)',
      'Sub-pixel tree canopy delineation and counting'
    ],
    supportedFormats: ['COCO JSON', 'Pascal VOC', 'YOLO v8/v11 OBB', 'GeoTIFF Mask', 'TFRecord'],
    annotationTypes: ['Polygons', 'Oriented Bounding Boxes', 'Semantic Pixel Masks', 'Keypoints'],
    taxonomyExample: {
      label: 'Maritime Vessel Detection (OBB)',
      attributes: {
        vessel_class: 'Cargo / Container',
        heading_degrees: '142.5°',
        length_meters: '280m',
        confidence_sla: '99.5%'
      }
    },
    sampleStats: {
      typicalAccuracy: '99.4% IoU',
      sampleVolume: '500k+ objects/mo'
    }
  },
  {
    id: 'mapping-navigation',
    title: 'Mapping & Navigation',
    subtitle: 'HD maps, road networks, building footprints & address geocoding',
    iconName: 'Map',
    description: 'Detailed vector extraction for HD mapping, autonomous driving, and geospatial gazetteers. Our team ensures topological correctness with zero self-intersecting polygons or disconnected road segment gaps.',
    keyUseCases: [
      'HD lane line & road curb digitizing from sub-decimeter aerial imagery',
      'Building footprint extraction with sharp corner-regularization',
      'Complex intersection geometry and turn-restriction attributes',
      'Point of Interest (POI) & rooftop address geocoding validation'
    ],
    supportedFormats: ['GeoJSON', 'ESRI Shapefile', 'FlatGeobuf', 'OpenStreetMap XML', 'PostGIS Dump'],
    annotationTypes: ['3D Polylines', 'Regularized Polygons', 'Attribute-Rich Points', 'Topological Graphs'],
    taxonomyExample: {
      label: 'Building Footprint Regularization',
      attributes: {
        building_use: 'Commercial Industrial',
        roof_type: 'Flat / Photovoltaic',
        corner_regularity: 'Orthogonal 90° Guaranteed',
        height_estimate_m: '14.2m'
      }
    },
    sampleStats: {
      typicalAccuracy: '< 0.3m Root Mean Square Error',
      sampleVolume: '250,000 km² mapped'
    }
  },
  {
    id: 'urban-planning',
    title: 'Urban Planning & Infrastructure',
    subtitle: 'Zoning boundaries, land use, utility networks & sprawl tracking',
    iconName: 'Building2',
    description: 'Transform raw remote sensing imagery into actionable urban intelligence. We annotate utility corridors, informal settlement progression, transit corridors, and land-use change vectors over multi-temporal stacks.',
    keyUseCases: [
      'Zoning and land-use classification (Residential, Commercial, Industrial)',
      'Informal settlement density & temporal sprawl monitoring',
      'Right-of-way utility line (powerlines, pipelines) corridor inspection',
      'Pavement quality index and road condition classification'
    ],
    supportedFormats: ['GeoJSON', 'ESRI FileGeodatabase', 'GeoPackage (.gpkg)', 'KML/KMZ'],
    annotationTypes: ['MultiPolygons', 'Network Graphs', 'Change-Detection Pairs', 'Raster Masks'],
    taxonomyExample: {
      label: 'Urban Structure Quality',
      attributes: {
        density_index: 'High Density Informal',
        roof_material: 'Corrugated Metal',
        access_road_width: 'Sub-3 meters',
        temporal_delta: 'New Structure (+6 mos)'
      }
    },
    sampleStats: {
      typicalAccuracy: '98.8% Classification Precision',
      sampleVolume: '120+ Cities Processed'
    }
  },
  {
    id: 'agriculture-environment',
    title: 'Agriculture & Environmental Monitoring',
    subtitle: 'Crop boundaries, irrigation, crop health, deforestation & wetlands',
    iconName: 'Sprout',
    description: 'Decipher complex bio-physical signals using multispectral (Sentinel-2, Planet, Landsat) and high-res drone imagery. Our GIS analysts understand seasonal phenology, crop rotation, and index analysis.',
    keyUseCases: [
      'Cadastral field boundary extraction & crop type classification',
      'Center-pivot irrigation ring detection and efficiency scoring',
      'Deforestation, illegal logging tracks & canopy gap analysis',
      'Wetland boundary delineation and wildfire perimeter tracking'
    ],
    supportedFormats: ['GeoJSON', 'GeoTIFF Mask', 'Cloud-Optimized GeoTIFF (COG)', 'Shapefile'],
    annotationTypes: ['Field Polygons', 'Multispectral Masks', 'Time-Series BBoxes', 'Density Heatmaps'],
    taxonomyExample: {
      label: 'Field Boundary & Health',
      attributes: {
        crop_family: 'Zea mays (Corn)',
        irrigation_type: 'Center Pivot',
        ndvi_mean: '0.74 (Healthy)',
        anomaly_detected: 'Pest Infestation Spot'
      }
    },
    sampleStats: {
      typicalAccuracy: '99.1% Boundary Precision',
      sampleVolume: '1.2M Hectares Cataloged'
    }
  },
  {
    id: 'defense-disaster',
    title: 'Defense, Security & Disaster Response',
    subtitle: 'Terrain features, flood extent, damage assessment & change detection',
    iconName: 'ShieldAlert',
    description: 'Rapid-response and tactical annotation under strict security protocols. We specialize in post-disaster structural damage grading (FEMA scales), SAR radar feature interpretation, and camouflage detection.',
    keyUseCases: [
      'Post-disaster building damage classification (Destroyed, Major, Minor, Intact)',
      'Flood inundation polygon boundaries from Sentinel-1 SAR imagery',
      'Change detection matrices (Before / After event alignment)',
      'Helipad, runway & temporary logistics access route mapping'
    ],
    supportedFormats: ['GeoJSON', 'COCO JSON', 'NITF Metadata Annotation', 'GeoPackage'],
    annotationTypes: ['Damage Polygons', 'Temporal Change Boxes', 'SAR Feature Points', 'Terrain Polylines'],
    taxonomyExample: {
      label: 'Disaster Building Damage Grade',
      attributes: {
        damage_class: 'Destroyed (Level 4)',
        event_type: 'Hurricane Flood / Surge',
        debris_field_radius: '18.4m',
        imagery_type: '0.15m Drone RGB'
      }
    },
    sampleStats: {
      typicalAccuracy: '99.6% Emergency SLA',
      sampleVolume: '48hr Rapid Turnaround'
    }
  },
  {
    id: 'market-intelligence',
    title: 'Business & Market Intelligence',
    subtitle: 'Competitor site mapping, foot-traffic proxies, parking & supply chain',
    iconName: 'TrendingUp',
    description: 'Empower quantitative funds, retail real estate teams, and logistics leads with granular physical asset tracking. We count vehicles, measure shadow lengths for height, and trace parking occupancy.',
    keyUseCases: [
      'Retail parking lot vehicle counts & turnover velocity tracking',
      'Commercial roof solar panel footprint & capacity estimation',
      'Port container stack volume and distribution center activity',
      'Competitor store footprint geocoding and accessibility buffer mapping'
    ],
    supportedFormats: ['GeoJSON', 'Parquet / Geoparquet', 'CSV with WKT Geometry', 'GeoTIFF'],
    annotationTypes: ['Bounding Boxes', 'Point Counting', 'Rooftop Polygons', 'Heatmap Arrays'],
    taxonomyExample: {
      label: 'Retail Asset Occupancy',
      attributes: {
        facility_name: 'Distribution Center Hub',
        active_trailers_count: '42',
        dock_utilization: '78%',
        expansion_area_m2: '3,400m²'
      }
    },
    sampleStats: {
      typicalAccuracy: '99.7% Count Accuracy',
      sampleVolume: '3.5M Vehicles Tracked'
    }
  }
];

export const COMPARISON_POINTS: ComparisonPoint[] = [
  {
    feature: 'Coordinate Reference Systems (CRS)',
    genericPlatforms: 'Treats imagery as 2D JPEG pixels; strips EPSG spatial headers causing projection drift.',
    geoLabelApproach: 'Native WGS84 (EPSG:4326), Web Mercator (EPSG:3857), and custom UTM projection support.',
    impact: 'Zero spatial distortion when reprojected into GIS enterprise pipelines.'
  },
  {
    feature: 'Annotator Background & Skillset',
    genericPlatforms: 'Crowdsourced micro-taskers with zero background in spatial geography or remote sensing.',
    geoLabelApproach: 'Degree-trained GIS analysts (B.Tech Surveying/Geoinformatics, Cartographers, Remote Sensing leads).',
    impact: '90% reduction in edge-case ambiguity questions and false positive classifications.'
  },
  {
    feature: 'Multispectral & SAR Imagery',
    genericPlatforms: 'Struggles with non-RGB bands (SWIR, NIR, Synthetic Aperture Radar speckle patterns).',
    geoLabelApproach: 'Native support for 12-band Sentinel-2, PlanetScope, LiDAR intensity, and SAR amplitude stacks.',
    impact: 'Accurate labelling for agricultural health, flood extents, and cloud-penetrating imagery.'
  },
  {
    feature: 'Topological Integrity Rules',
    genericPlatforms: 'Produces self-intersecting lines, overlapping adjacent polygons, and gap slivers.',
    geoLabelApproach: 'Automated topology QA engines enforcing strict non-overlapping, zero-sliver, and shared-boundary snapping rules.',
    impact: 'Directly importable into PostGIS / QGIS without costly manual spatial cleaning.'
  },
  {
    feature: 'Quality Assurance & Inter-Annotator SLA',
    genericPlatforms: 'Random spot-checking; low IoU thresholds; high variance between annotators.',
    geoLabelApproach: 'Dual-pass consensus annotation with explicit >0.88 IoU thresholds and senior GIS auditor sign-off.',
    impact: 'Consistent, production-grade ground truth for mission-critical ML deployment.'
  }
];

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    stepNumber: 1,
    title: 'Schema & Taxonomy Definition',
    subtitle: 'Co-designing strict labeling specs',
    description: 'We collaborate with your ML engineers and GIS team to define geometry types, class taxonomies, attribute trees, spatial resolutions (GSD), and coordinate reference systems (CRS).',
    details: [
      'Define edge cases (e.g. obscured buildings, shadows, cloud cover limits)',
      'Establish IoU (Intersection over Union) SLA thresholds (e.g., ≥0.88)',
      'Specify output formats (GeoJSON, COCO, Shapefile, GeoTIFF masks)'
    ],
    deliverables: ['Labeling Guidelines Spec Sheet', 'Edge-Case Decision Matrix', 'Sample Benchmark Dataset'],
    icon: 'FileCode2'
  },
  {
    stepNumber: 2,
    title: 'Pilot Batch & Calibration',
    subtitle: 'Proving accuracy on your real data',
    description: 'We assign a dedicated pod of GIS-trained annotators to execute a 100–500 image pilot batch. We iterate on feedback until 100% taxonomy alignment is achieved.',
    details: [
      'Dedicated lead GIS analyst managing your project',
      'Rapid feedback loop via shared inspection dashboard',
      'Speed and throughput calibration for volume scaling'
    ],
    deliverables: ['Pilot Annotation Batch', 'Accuracy & Consensus Report', 'Calibrated Speed Baseline'],
    icon: 'Sliders'
  },
  {
    stepNumber: 3,
    title: 'Dual-Pass Annotation & Consensus QA',
    subtitle: 'Rigorous 200% validation process',
    description: 'Primary annotation is completed by experienced GIS analysts. A secondary independent reviewer cross-validates geometry, topological snapping, and attribute metadata.',
    details: [
      'Automated topology scripts check for overlaps & sliver gaps',
      'Inter-annotator disagreement resolution algorithm',
      'Senior GIS auditor spot-checks 15% of all outputs'
    ],
    deliverables: ['Disagreement Audit Log', 'Real-time QA Progress Dashboard', 'Automated Topology Clean Log'],
    icon: 'ShieldCheck'
  },
  {
    stepNumber: 4,
    title: 'Enterprise Delivery & Support',
    subtitle: 'Plug-and-play into your ML pipeline',
    description: 'Data is delivered in your requested native GIS or ML format with full spatial CRS headers intact, complete lineage metadata, and zero post-processing required.',
    details: [
      'Direct sync to S3, Google Cloud Storage, or Azure Blob',
      'Versioned releases with changelog manifests',
      'Free 30-day warranty for edge-case label adjustments'
    ],
    deliverables: ['Native Geospatial Annotations', 'Data Lineage & Provenance Metadata', 'Signed Quality SLA Certificate'],
    icon: 'Truck'
  }
];

export const QUALITY_METRICS: QualityMetric[] = [
  {
    title: 'Target Intersection over Union',
    value: '≥ 0.88',
    unit: 'IoU',
    description: 'Enforced polygon tightness boundary threshold across all object classes.',
    icon: 'Target'
  },
  {
    title: 'Consensus Agreement Rate',
    value: '99.2%',
    unit: 'Accuracy',
    description: 'Inter-annotator agreement on class labeling and attribute assignment.',
    icon: 'CheckCircle2'
  },
  {
    title: 'Spatial Topology Slivers',
    value: '0',
    unit: 'Gaps',
    description: 'Guaranteed zero self-intersecting lines or accidental polygon gaps.',
    icon: 'Layers'
  },
  {
    title: 'GIS-Trained Annotator Ratio',
    value: '100%',
    unit: 'Specialists',
    description: 'Every team member holds a degree or professional certification in GIS/Surveying.',
    icon: 'GraduationCap'
  }
];

export const FOUNDER_INFO = {
  name: 'Surveying & Geoinformatics GIS Specialist Lead',
  credentials: 'B.Tech Surveying & Geoinformatics | GIS & Remote Sensing Analyst',
  title: 'Founder & Head of Annotation Operations',
  bio: 'With a formal background in Surveying and Geoinformatics (B.Tech) and years of hands-on experience in remote sensing production pipelines, our leadership built GeoLabel to bridge the gap between computer vision engineering and spatial science. Generic labeling platforms treat satellite imagery like internet memes; we treat it with the mathematical precision of spatial geodesy.',
  certifications: [
    'B.Tech Surveying & Geoinformatics',
    'Esri Certified GIS Professional (GISP)',
    'Remote Sensing & Photogrammetry Specialist',
    'ISO 27001 Data Security Compliant Lead'
  ],
  securityGuarantees: [
    'SOC 2 Type II Compliant Annotation Operations',
    'Air-Gapped / Isolated Secure Enclave Options',
    'Strict NDA & Client Data Confidentiality Agreement',
    'Zero Model Training on Client Imagery Data'
  ]
};

export const SAMPLE_ANNOTATION_DEMOS = [
  {
    id: 'demo-1',
    name: 'Sub-meter Urban Building Footprint Extraction',
    location: 'San Francisco, CA (0.15m Aerial RGB)',
    imageUrl: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1600&q=80',
    crs: 'EPSG:3857 (Web Mercator)',
    gsd: '0.15 m/px',
    objectsCount: 18,
    type: 'Building Footprint (Regularized)',
    presetPolygons: [
      { id: 'poly-1', label: 'Commercial Complex A', color: '#14b8a6', points: [{x: 18, y: 22}, {x: 46, y: 22}, {x: 46, y: 55}, {x: 18, y: 55}] },
      { id: 'poly-2', label: 'Residential Block B', color: '#3b82f6', points: [{x: 52, y: 28}, {x: 88, y: 28}, {x: 88, y: 48}, {x: 52, y: 48}] },
      { id: 'poly-3', label: 'Office Tower C', color: '#ec4899', points: [{x: 25, y: 62}, {x: 75, y: 62}, {x: 75, y: 88}, {x: 25, y: 88}] }
    ],
    sampleJson: `{
  "type": "FeatureCollection",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "bldg_sf_9041",
        "class": "Commercial_Complex_A",
        "roof_type": "Flat_Gravel",
        "height_est_m": 18.4,
        "orthogonality_snapped": true,
        "confidence": 0.998
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-122.4194, 37.7749],
          [-122.4170, 37.7749],
          [-122.4170, 37.7725],
          [-122.4194, 37.7725],
          [-122.4194, 37.7749]
        ]]
      }
    }
  ]
}`
  },
  {
    id: 'demo-2',
    name: 'Photovoltaic Solar Panel Array Segmentation',
    location: 'Mojave Solar Farm, NV (0.10m Aerial RGB)',
    imageUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1600&q=80',
    crs: 'EPSG:32611 (UTM Zone 11N)',
    gsd: '0.10 m/px',
    objectsCount: 42,
    type: 'Oriented BBox + Sub-Panel Polygon',
    presetPolygons: [
      { id: 'poly-solar-1', label: 'Solar Array West Tier', color: '#f59e0b', points: [{x: 12, y: 15}, {x: 48, y: 15}, {x: 48, y: 45}, {x: 12, y: 45}] },
      { id: 'poly-solar-2', label: 'Solar Array East Tier', color: '#10b981', points: [{x: 54, y: 15}, {x: 90, y: 15}, {x: 90, y: 45}, {x: 54, y: 45}] },
      { id: 'poly-solar-3', label: 'Inverter Station Central', color: '#ef4444', points: [{x: 35, y: 58}, {x: 65, y: 58}, {x: 65, y: 82}, {x: 35, y: 82}] }
    ],
    sampleJson: `{
  "type": "FeatureCollection",
  "crs": { "type": "name", "properties": { "name": "EPSG:32611" } },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "solar_array_nv_001",
        "class": "solar_pv_array",
        "capacity_kw": 450,
        "tilt_angle_deg": 28.5,
        "soiling_pct": 0.015,
        "confidence": 0.996
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [682100, 3991000],
          [682900, 3991000],
          [682900, 3990200],
          [682100, 3990200],
          [682100, 3991000]
        ]]
      }
    }
  ]
}`
  },
  {
    id: 'demo-3',
    name: 'Oriented Bounding Box (OBB) Maritime Vessel Detection',
    location: 'Port of Rotterdam (0.3m Satellite RGB)',
    imageUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1600&q=80',
    crs: 'EPSG:4326 (WGS84)',
    gsd: '0.30 m/px',
    objectsCount: 24,
    type: 'Oriented Bounding Box (YOLO v11 OBB)',
    presetPolygons: [
      { id: 'poly-vessel-1', label: 'Cargo Vessel Alpha', color: '#8b5cf6', points: [{x: 20, y: 25}, {x: 80, y: 35}, {x: 75, y: 60}, {x: 15, y: 50}] },
      { id: 'poly-vessel-2', label: 'Container Pier Berth', color: '#06b6d4', points: [{x: 10, y: 68}, {x: 90, y: 68}, {x: 90, y: 90}, {x: 10, y: 90}] }
    ],
    sampleJson: `{
  "version": "GeoLabel_OBB_1.0",
  "image": "rotterdam_port_band_rgb.tif",
  "crs": "EPSG:4326",
  "annotations": [
    {
      "class": "Cargo_Container_Ship",
      "bbox_obb": [
        {"x": 1240, "y": 820},
        {"x": 1580, "y": 890},
        {"x": 1540, "y": 1040},
        {"x": 1200, "y": 970}
      ],
      "heading_deg": 11.6,
      "length_m": 310,
      "beam_m": 45,
      "docked_state": "Moored"
    }
  ]
}`
  }
];
