import React, { useState, useRef } from 'react';
import { SAMPLE_ANNOTATION_DEMOS } from '../data/geospatialData';
import {
  scoreBoundingBoxTask,
  scoreSemanticSegmentationTask,
  scoreGridClassificationTask,
  ScoringResult,
  TaskType
} from '../utils/scoringEngine';
import {
  Code2,
  Copy,
  Check,
  MousePointer,
  Square,
  PenTool,
  MapPin,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Download,
  Send,
  Sparkles,
  Layers,
  FileJson,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Undo2,
  Redo2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Paintbrush,
  Grid,
  Play,
  Award,
  BarChart3,
  HelpCircle,
  X,
  FileSpreadsheet,
  FileCode,
  Keyboard,
  Users,
  ZoomIn,
  ZoomOut,
  Move,
  Maximize2,
  RotateCcw,
  ListChecks,
  Plus,
  Wand2,
  Tag,
  Ruler,
  Sliders,
  MessageSquare,
  Building2,
  Globe,
  Compass,
  Flame,
  Save,
  Clock,
  Filter,
  SlidersHorizontal,
  PieChart,
  Activity,
  TrendingUp,
  Bot
} from 'lucide-react';

interface DrawnPolygon {
  id: string;
  label: string;
  color: string;
  toolType: 'polygon' | 'bbox' | 'point';
  points: { x: number; y: number }[]; // coordinates as percentage 0-100
  visible?: boolean;
  locked?: boolean;
  material?: string;
  condition?: string;
  confidence?: number;
  notes?: string;
}

export const InteractiveAnnotationStudio: React.FC = () => {
  // Navigation for 3 Core Task Types
  const [activeTaskType, setActiveTaskType] = useState<TaskType>('bbox_detection');

  const [selectedDemoIndex, setSelectedDemoIndex] = useState<number>(0);
  const currentDemo = SAMPLE_ANNOTATION_DEMOS[selectedDemoIndex];

  // Coordinate Reference System (CRS) & Real-World Map Extents Metadata State
  const [crsMetadata, setCrsMetadata] = useState<string>('EPSG:3857 (Web Mercator)');
  const [mapBounds, setMapBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }>({
    minLat: 37.7725,
    maxLat: 37.7749,
    minLon: -122.4194,
    maxLon: -122.4170,
  });

  // Convert canvas pixel percentages (0-100%) to real-world Geographic Coordinates (Lat/Lon)
  const getRealWorldCoords = (pctX: number, pctY: number) => {
    const lat = mapBounds.maxLat - (pctY / 100) * (mapBounds.maxLat - mapBounds.minLat);
    const lon = mapBounds.minLon + (pctX / 100) * (mapBounds.maxLon - mapBounds.minLon);
    return {
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      formattedLat: `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`,
      formattedLon: `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`,
    };
  };

  // Convert canvas pixel percentages to local projected metric offset (Easting & Northing in meters)
  const getProjectedCoords = (pctX: number, pctY: number) => {
    const meanLat = (mapBounds.minLat + mapBounds.maxLat) / 2;
    const latRad = (meanLat * Math.PI) / 180;
    const totalWidthMeters = Math.abs(mapBounds.maxLon - mapBounds.minLon) * 111320 * Math.cos(latRad);
    const totalHeightMeters = Math.abs(mapBounds.maxLat - mapBounds.minLat) * 111320;
    const eastingMeters = +((pctX / 100) * totalWidthMeters).toFixed(1);
    const northingMeters = +(((100 - pctY) / 100) * totalHeightMeters).toFixed(1);
    return {
      eastingMeters,
      northingMeters,
      totalWidthMeters: +totalWidthMeters.toFixed(1),
      totalHeightMeters: +totalHeightMeters.toFixed(1),
    };
  };

  // Tool State for Task 1: Bounding Box & Vector Polygon
  const [activeTool, setActiveTool] = useState<'polygon' | 'bbox' | 'point' | 'select'>('polygon');
  const [activeClass, setActiveClass] = useState<string>('building_footprint');
  const [orthoSnapping, setOrthoSnapping] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  // AI Segment Anything (SAM 2) Assist State
  const [isAiSegmenting, setIsAiSegmenting] = useState<boolean>(false);

  // QA Audit Workflow State for Current Tile
  const [tileQaStatus, setTileQaStatus] = useState<'approved' | 'needs_review' | 'in_audit'>('in_audit');

  // Polygons for Task 1
  const [polygons, setPolygons] = useState<DrawnPolygon[]>([
    {
      id: 'poly-1',
      label: 'building_footprint',
      color: '#14b8a6',
      toolType: 'polygon',
      points: [
        { x: 18, y: 22 },
        { x: 46, y: 22 },
        { x: 46, y: 55 },
        { x: 18, y: 55 },
      ],
      material: 'Reinforced Concrete Roof',
      condition: 'Intact',
      confidence: 0.98,
      notes: 'Verified against 15cm RGB Orthophoto',
    },
    {
      id: 'poly-2',
      label: 'solar_pv_array',
      color: '#f59e0b',
      toolType: 'bbox',
      points: [
        { x: 52, y: 28 },
        { x: 88, y: 28 },
        { x: 88, y: 48 },
        { x: 52, y: 48 },
      ],
      material: 'Monocrystalline Silicon PV',
      condition: 'Intact',
      confidence: 0.96,
      notes: 'High reflectivity spectral signature',
    },
  ]);

  // Task 2: Semantic Segmentation Region Painting State (8x8 Grid)
  const [segmentationClass, setSegmentationClass] = useState<string>('building_footprint');
  const [paintedGrid, setPaintedGrid] = useState<Record<string, string>>({
    '1_1': 'building_footprint',
    '1_2': 'building_footprint',
    '2_1': 'building_footprint',
    '2_2': 'building_footprint',
    '3_4': 'solar_pv_array',
    '3_5': 'solar_pv_array',
    '4_4': 'solar_pv_array',
    '4_5': 'solar_pv_array',
  });
  const [isBrushDown, setIsBrushDown] = useState<boolean>(false);

  // Ground Truth for Segmentation Task 2
  const gtSegmentationGrid: Record<string, string> = {
    '1_1': 'building_footprint',
    '1_2': 'building_footprint',
    '1_3': 'building_footprint',
    '2_1': 'building_footprint',
    '2_2': 'building_footprint',
    '2_3': 'building_footprint',
    '3_4': 'solar_pv_array',
    '3_5': 'solar_pv_array',
    '4_4': 'solar_pv_array',
    '4_5': 'solar_pv_array',
    '5_6': 'water_body',
    '5_7': 'water_body',
    '6_6': 'water_body',
    '6_7': 'water_body',
  };

  // Task 3: Grid Cell Classification State (4x4 Grid)
  const [selectedGridClass, setSelectedGridClass] = useState<string>('Urban High-Density');
  const [userGridLabels, setUserGridLabels] = useState<Record<string, string>>({
    'cell_0_0': 'Urban High-Density',
    'cell_0_1': 'Urban High-Density',
    'cell_0_2': 'Industrial Port',
    'cell_0_3': 'Industrial Port',
    'cell_1_0': 'Urban High-Density',
    'cell_1_1': 'Urban High-Density',
    'cell_1_2': 'Industrial Port',
    'cell_1_3': 'Solar PV Farm',
    'cell_2_0': 'Vegetation Canopy',
    'cell_2_1': 'Vegetation Canopy',
    'cell_2_2': 'Solar PV Farm',
    'cell_2_3': 'Solar PV Farm',
    'cell_3_0': 'Vegetation Canopy',
    'cell_3_1': 'Vegetation Canopy',
    'cell_3_2': 'Water Body',
    'cell_3_3': 'Water Body',
  });

  // Ground Truth for Grid Task 3
  const gtGridLabels: Record<string, string> = {
    'cell_0_0': 'Urban High-Density',
    'cell_0_1': 'Urban High-Density',
    'cell_0_2': 'Industrial Port',
    'cell_0_3': 'Industrial Port',
    'cell_1_0': 'Urban High-Density',
    'cell_1_1': 'Urban High-Density',
    'cell_1_2': 'Industrial Port',
    'cell_1_3': 'Solar PV Farm',
    'cell_2_0': 'Vegetation Canopy',
    'cell_2_1': 'Vegetation Canopy',
    'cell_2_2': 'Solar PV Farm',
    'cell_2_3': 'Solar PV Farm',
    'cell_3_0': 'Vegetation Canopy',
    'cell_3_1': 'Vegetation Canopy',
    'cell_3_2': 'Water Body',
    'cell_3_3': 'Water Body',
  };

  // Current Vector Drawing Draft State
  const [currentDraftPoints, setCurrentDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingBBox, setIsDraggingBBox] = useState<boolean>(false);
  const [selectedPolyId, setSelectedPolyId] = useState<string | null>('poly-1');

  // Live Scoring Engine Result State
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [isScoringRunning, setIsScoringRunning] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Export Sample Modal & Formats State
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'geojson' | 'coco' | 'csv' | 'yolo'>('geojson');
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  // Keyboard Shortcuts Cheatsheet Modal State
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);

  // Navigator Viewport Control (Pan & Zoom) State
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  // Collaborative Cursor Feature State
  const [isCollabActive, setIsCollabActive] = useState<boolean>(true);
  const [peerCursors, setPeerCursors] = useState<
    { id: string; name: string; role: string; color: string; x: number; y: number; status: string }[]
  >([
    {
      id: 'peer-1',
      name: 'Elena Rostova',
      role: 'Lead Auditor (Zurich)',
      color: '#10b981',
      x: 34,
      y: 41,
      status: 'Verifying Roof Bounds',
    },
    {
      id: 'peer-2',
      name: 'Marcus Vance',
      role: 'Senior QA (San Francisco)',
      color: '#a855f7',
      x: 72,
      y: 35,
      status: 'Auditing Solar Arrays',
    },
  ]);

  // Batch Queue Processing State
  const [batchQueue, setBatchQueue] = useState<
    {
      id: string;
      demoIndex: number;
      name: string;
      location: string;
      taskType: TaskType;
      status: 'completed' | 'in_progress' | 'queued';
      polygonsCount: number;
    }[]
  >([
    {
      id: 'batch-1',
      demoIndex: 0,
      name: 'San Francisco Rooftops',
      location: 'San Francisco, CA',
      taskType: 'bbox_detection',
      status: 'in_progress',
      polygonsCount: 2,
    },
    {
      id: 'batch-2',
      demoIndex: 1,
      name: 'Mojave Desert Solar Farm',
      location: 'Mojave Desert, CA',
      taskType: 'bbox_detection',
      status: 'queued',
      polygonsCount: 3,
    },
    {
      id: 'batch-3',
      demoIndex: 2,
      name: 'Port of Rotterdam',
      location: 'Rotterdam, Netherlands',
      taskType: 'bbox_detection',
      status: 'completed',
      polygonsCount: 4,
    },
    {
      id: 'batch-4',
      demoIndex: 3,
      name: 'Amazon Rainforest Canopy',
      location: 'Manaus, Brazil',
      taskType: 'grid_classification',
      status: 'queued',
      polygonsCount: 16,
    },
  ]);

  // Density Heatmap Overlay Visualization State
  const [showDensityHeatmap, setShowDensityHeatmap] = useState<boolean>(false);

  // AI Suggest Annotations API State
  const [isSuggestingAi, setIsSuggestingAi] = useState<boolean>(false);

  // Right Panel Tab Switcher State (Annotation Summary vs Deliverable Payload)
  const [rightPanelTab, setRightPanelTab] = useState<'summary' | 'deliverable'>('summary');
  const [summaryClassFilter, setSummaryClassFilter] = useState<string | null>(null);

  // Auto-Save & Session Recovery State
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const [autoSaveNotification, setAutoSaveNotification] = useState<string | null>(null);
  const [isRestoredFromAutoSave, setIsRestoredFromAutoSave] = useState<boolean>(false);

  // Batch Task Queue Modal & Automation Pipeline State
  const [isBatchQueueModalOpen, setIsBatchQueueModalOpen] = useState<boolean>(false);
  const [batchFilterStatus, setBatchFilterStatus] = useState<'all' | 'completed' | 'in_progress' | 'queued'>('all');
  const [isBatchPipelineRunning, setIsBatchPipelineRunning] = useState<boolean>(false);
  const [batchPipelineProgress, setBatchPipelineProgress] = useState<number>(0);
  const [newTileName, setNewTileName] = useState<string>('');
  const [newTileLocation, setNewTileLocation] = useState<string>('');
  const [isAddTileFormOpen, setIsAddTileFormOpen] = useState<boolean>(false);

  // Undo/Redo Stack State
  const [history, setHistory] = useState<
    { polygons: DrawnPolygon[]; paintedGrid: Record<string, string>; userGridLabels: Record<string, string> }[]
  >([
    {
      polygons: [
        {
          id: 'poly-1',
          label: 'building_footprint',
          color: '#14b8a6',
          toolType: 'polygon',
          points: [
            { x: 18, y: 22 },
            { x: 46, y: 22 },
            { x: 46, y: 55 },
            { x: 18, y: 55 },
          ],
          visible: true,
          locked: false,
        },
        {
          id: 'poly-2',
          label: 'solar_pv_array',
          color: '#f59e0b',
          toolType: 'bbox',
          points: [
            { x: 52, y: 28 },
            { x: 88, y: 28 },
            { x: 88, y: 48 },
            { x: 52, y: 48 },
          ],
          visible: true,
          locked: false,
        },
      ],
      paintedGrid: {
        '1_1': 'building_footprint',
        '1_2': 'building_footprint',
        '2_1': 'building_footprint',
        '2_2': 'building_footprint',
        '3_4': 'solar_pv_array',
        '3_5': 'solar_pv_array',
        '4_4': 'solar_pv_array',
        '4_5': 'solar_pv_array',
      },
      userGridLabels: {
        'cell_0_0': 'Urban High-Density',
        'cell_0_1': 'Urban High-Density',
        'cell_0_2': 'Industrial Port',
        'cell_0_3': 'Industrial Port',
        'cell_1_0': 'Urban High-Density',
        'cell_1_1': 'Urban High-Density',
        'cell_1_2': 'Industrial Port',
        'cell_1_3': 'Solar PV Farm',
        'cell_2_0': 'Vegetation Canopy',
        'cell_2_1': 'Vegetation Canopy',
        'cell_2_2': 'Solar PV Farm',
        'cell_2_3': 'Solar PV Farm',
        'cell_3_0': 'Vegetation Canopy',
        'cell_3_1': 'Vegetation Canopy',
        'cell_3_2': 'Water Body',
        'cell_3_3': 'Water Body',
      },
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Class colors
  const CLASS_COLORS: Record<string, string> = {
    building_footprint: '#14b8a6', // teal
    solar_pv_array: '#f59e0b', // amber
    cargo_vessel: '#8b5cf6', // purple
    tree_canopy: '#10b981', // green
    water_body: '#3b82f6', // blue
  };

  const pushHistorySnapshot = (
    nextPolygons: DrawnPolygon[],
    nextPaintedGrid: Record<string, string>,
    nextUserGridLabels: Record<string, string>
  ) => {
    const trimmed = history.slice(0, historyIndex + 1);
    const snapshot = {
      polygons: nextPolygons,
      paintedGrid: nextPaintedGrid,
      userGridLabels: nextUserGridLabels,
    };
    setHistory([...trimmed, snapshot]);
    setHistoryIndex(trimmed.length);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const snap = history[prevIdx];
      setPolygons(snap.polygons);
      setPaintedGrid(snap.paintedGrid);
      setUserGridLabels(snap.userGridLabels);
      setHistoryIndex(prevIdx);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const snap = history[nextIdx];
      setPolygons(snap.polygons);
      setPaintedGrid(snap.paintedGrid);
      setUserGridLabels(snap.userGridLabels);
      setHistoryIndex(nextIdx);
    }
  };

  // Extended Keyboard Shortcuts Listener (U=Undo, R=Redo, L=Lock, V=Visibility, P=Polygon, B=BBox, S=Score, E=Export, K=Cheatsheet, Zoom: +/-/0)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      const key = e.key.toLowerCase();

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        handleRedo();
        return;
      }

      // Single key shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === 'u') {
          handleUndo();
        } else if (key === 'r') {
          handleRedo();
        } else if (key === 'l' && selectedPolyId) {
          handleTogglePolygonLock(selectedPolyId);
        } else if (key === 'v' && selectedPolyId) {
          handleTogglePolygonVisibility(selectedPolyId);
        } else if (key === 'p') {
          setActiveTool('polygon');
        } else if (key === 'b') {
          setActiveTool('bbox');
        } else if (key === 's') {
          handleRunScoringEngine();
        } else if (key === 'e') {
          setIsExportModalOpen(true);
        } else if (key === 'h') {
          setShowDensityHeatmap((prev) => !prev);
        } else if (key === 'q') {
          setIsBatchQueueModalOpen((prev) => !prev);
        } else if (key === 'o') {
          setOrthoSnapping((prev) => !prev);
        } else if (key === 'k' || key === '?') {
          setIsShortcutsModalOpen((prev) => !prev);
        } else if (key === '+' || key === '=') {
          setZoomLevel((z) => Math.min(3, +(z + 0.25).toFixed(2)));
        } else if (key === '-' || key === '_') {
          setZoomLevel((z) => Math.max(1, +(z - 0.25).toFixed(2)));
        } else if (key === '0') {
          setZoomLevel(1);
          setPanOffset({ x: 0, y: 0 });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, selectedPolyId, polygons, paintedGrid, userGridLabels]);

  // AUTO-SAVE & SESSION RECOVERY STORAGE HANDLERS
  const AUTOSAVE_STORAGE_KEY = 'SAT_ANNOTATION_AUTOSAVE_CACHE_V2';

  // Restore Session on Mount
  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.polygons)) {
          setPolygons(parsed.polygons);
          if (parsed.crsMetadata) setCrsMetadata(parsed.crsMetadata);
          if (parsed.mapBounds) setMapBounds(parsed.mapBounds);
          if (parsed.paintedGrid) setPaintedGrid(parsed.paintedGrid);
          if (parsed.userGridLabels) setUserGridLabels(parsed.userGridLabels);
          if (parsed.tileQaStatus) setTileQaStatus(parsed.tileQaStatus);
          if (typeof parsed.selectedDemoIndex === 'number') setSelectedDemoIndex(parsed.selectedDemoIndex);
          if (parsed.activeTaskType) setActiveTaskType(parsed.activeTaskType);

          setIsRestoredFromAutoSave(true);
          setAutoSaveNotification('Session automatically restored from local cache');
          setTimeout(() => setAutoSaveNotification(null), 4000);
        }
      }
    } catch (err) {
      console.error('Auto-save restoration failed:', err);
    }
  }, []);

  // Debounced Auto-Save Writer
  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const payload = {
          polygons,
          crsMetadata,
          mapBounds,
          paintedGrid,
          userGridLabels,
          tileQaStatus,
          selectedDemoIndex,
          activeTaskType,
          timestamp: Date.now(),
        };
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(payload));
        setLastAutoSavedAt(Date.now());
      } catch (e) {
        console.warn('Auto-save write error:', e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [polygons, crsMetadata, mapBounds, paintedGrid, userGridLabels, tileQaStatus, selectedDemoIndex, activeTaskType]);

  const handleClearSavedSession = () => {
    try {
      localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
      setPolygons([
        {
          id: 'poly-1',
          label: 'building_footprint',
          color: '#14b8a6',
          toolType: 'polygon',
          points: [
            { x: 18, y: 22 },
            { x: 46, y: 22 },
            { x: 46, y: 55 },
            { x: 18, y: 55 },
          ],
          material: 'Reinforced Concrete Roof',
          condition: 'Intact',
          confidence: 0.98,
          notes: 'Verified against 15cm RGB Orthophoto',
        },
      ]);
      setIsRestoredFromAutoSave(false);
      setAutoSaveNotification('Auto-save cache cleared. Reset to factory preset.');
      setTimeout(() => setAutoSaveNotification(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  // AUTOMATED BATCH PROCESSING QA PIPELINE HANDLER
  const handleRunBatchPipeline = () => {
    if (isBatchPipelineRunning) return;
    setIsBatchPipelineRunning(true);
    setBatchPipelineProgress(0);

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setBatchPipelineProgress(current);

      setBatchQueue((prev) =>
        prev.map((item, idx) => {
          if (idx === current - 1) return { ...item, status: 'completed' };
          if (idx === current) return { ...item, status: 'in_progress' };
          return item;
        })
      );

      if (current >= batchQueue.length) {
        clearInterval(interval);
        setIsBatchPipelineRunning(false);
        setAutoSaveNotification('Automated Enterprise Batch QA Pipeline Finished! All tiles validated.');
        setTimeout(() => setAutoSaveNotification(null), 4000);
      }
    }, 1200);
  };

  const handleAddTileToQueue = () => {
    if (!newTileName.trim()) return;
    const newTile = {
      id: `batch-${Date.now()}`,
      demoIndex: 0,
      name: newTileName.trim(),
      location: newTileLocation.trim() || 'Custom Geospatial Region',
      taskType: activeTaskType,
      status: 'queued' as const,
      polygonsCount: polygons.length,
    };
    setBatchQueue((prev) => [...prev, newTile]);
    setNewTileName('');
    setNewTileLocation('');
    setIsAddTileFormOpen(false);
  };

  // Peer Cursors Simulated Real-Time Movement
  React.useEffect(() => {
    if (!isCollabActive) return;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.08;
      setPeerCursors([
        {
          id: 'peer-1',
          name: 'Elena Rostova',
          role: 'Lead Auditor (Zurich)',
          color: '#10b981',
          x: Math.round(35 + Math.sin(t) * 12),
          y: Math.round(42 + Math.cos(t * 0.8) * 8),
          status: Math.sin(t) > 0 ? 'Verifying Roof Bounds' : 'Annotating Structural Edge',
        },
        {
          id: 'peer-2',
          name: 'Marcus Vance',
          role: 'Senior QA (San Francisco)',
          color: '#a855f7',
          x: Math.round(70 + Math.cos(t * 0.9) * 10),
          y: Math.round(36 + Math.sin(t * 0.7) * 9),
          status: Math.cos(t) > 0 ? 'Auditing Solar Arrays' : 'Inspecting PV Panel Efficiency',
        },
      ]);
    }, 1200);

    return () => clearInterval(interval);
  }, [isCollabActive]);

  // Layer Management Sidebar Actions
  const handleTogglePolygonVisibility = (id: string) => {
    const updated = polygons.map((p) => (p.id === id ? { ...p, visible: p.visible === false ? true : false } : p));
    setPolygons(updated);
    pushHistorySnapshot(updated, paintedGrid, userGridLabels);
  };

  const handleTogglePolygonLock = (id: string) => {
    const updated = polygons.map((p) => (p.id === id ? { ...p, locked: !p.locked } : p));
    setPolygons(updated);
    pushHistorySnapshot(updated, paintedGrid, userGridLabels);
  };

  const handleToggleClassVisibility = (classLabel: string) => {
    const targetPolys = polygons.filter((p) => p.label === classLabel);
    if (targetPolys.length === 0) return;
    const shouldHideAll = targetPolys.some((p) => p.visible !== false);
    const updated = polygons.map((p) => (p.label === classLabel ? { ...p, visible: !shouldHideAll } : p));
    setPolygons(updated);
    pushHistorySnapshot(updated, paintedGrid, userGridLabels);
  };

  const handleToggleClassLock = (classLabel: string) => {
    const targetPolys = polygons.filter((p) => p.label === classLabel);
    if (targetPolys.length === 0) return;
    const shouldLockAll = targetPolys.some((p) => !p.locked);
    const updated = polygons.map((p) => (p.label === classLabel ? { ...p, locked: shouldLockAll } : p));
    setPolygons(updated);
    pushHistorySnapshot(updated, paintedGrid, userGridLabels);
  };

  const handleDeletePolygon = (id: string) => {
    const target = polygons.find((p) => p.id === id);
    if (target?.locked) return;
    const updated = polygons.filter((p) => p.id !== id);
    setPolygons(updated);
    if (selectedPolyId === id) setSelectedPolyId(null);
    pushHistorySnapshot(updated, paintedGrid, userGridLabels);
  };

  // AI Auto-Segment (SAM 2) Assist Handler
  const handleAiAutoSegment = () => {
    setIsAiSegmenting(true);
    setTimeout(() => {
      const newAiPoly: DrawnPolygon = {
        id: `poly-sam-${Date.now()}`,
        label: activeClass,
        color: activeClass === 'building_footprint' ? '#14b8a6' : activeClass === 'solar_pv_array' ? '#f59e0b' : '#3b82f6',
        toolType: 'polygon',
        points: [
          { x: 12, y: 64 },
          { x: 38, y: 62 },
          { x: 42, y: 86 },
          { x: 14, y: 88 },
        ],
        material: activeClass === 'building_footprint' ? 'Structural Metal Deck' : 'Monocrystalline Silicon PV',
        condition: 'Intact',
        confidence: 0.974,
        notes: 'Auto-segmented via SAM 2 Vision Transformer (97.4% confidence)',
      };
      const updated = [...polygons, newAiPoly];
      setPolygons(updated);
      setSelectedPolyId(newAiPoly.id);
      pushHistorySnapshot(updated, paintedGrid, userGridLabels);
      setIsAiSegmenting(false);
    }, 600);
  };

  // SUGGEST ANNOTATIONS VIA MOCK AI API HANDLER
  const handleSuggestAiAnnotations = () => {
    if (isSuggestingAi) return;
    setIsSuggestingAi(true);

    setTimeout(() => {
      if (activeTaskType === 'bbox_detection') {
        const aiSuggestedPolys: DrawnPolygon[] = [
          {
            id: `ai-suggest-${Date.now()}-1`,
            label: 'building_footprint',
            color: '#14b8a6',
            toolType: 'polygon',
            points: [
              { x: 55, y: 58 },
              { x: 84, y: 58 },
              { x: 84, y: 84 },
              { x: 55, y: 84 },
            ],
            material: 'Structural Reinforced Deck',
            condition: 'Intact',
            confidence: 0.965,
            notes: 'AI Suggested via GeoAI-v4.2 Vision Transformer',
            visible: true,
            locked: false,
          },
          {
            id: `ai-suggest-${Date.now()}-2`,
            label: 'solar_pv_array',
            color: '#f59e0b',
            toolType: 'bbox',
            points: [
              { x: 14, y: 68 },
              { x: 44, y: 68 },
              { x: 44, y: 92 },
              { x: 14, y: 92 },
            ],
            material: 'Monocrystalline Silicon PV',
            condition: 'Intact',
            confidence: 0.942,
            notes: 'AI Suggested via GeoAI-v4.2 Vision Transformer',
            visible: true,
            locked: false,
          },
          {
            id: `ai-suggest-${Date.now()}-3`,
            label: 'cargo_vessel',
            color: '#3b82f6',
            toolType: 'polygon',
            points: [
              { x: 60, y: 12 },
              { x: 92, y: 12 },
              { x: 92, y: 30 },
              { x: 60, y: 30 },
            ],
            material: 'Steel Hull Container Vessel',
            condition: 'Intact',
            confidence: 0.978,
            notes: 'AI Suggested via GeoAI-v4.2 Vision Transformer',
            visible: true,
            locked: false,
          },
        ];

        const updated = [...polygons, ...aiSuggestedPolys];
        setPolygons(updated);
        setSelectedPolyId(aiSuggestedPolys[0].id);
        pushHistorySnapshot(updated, paintedGrid, userGridLabels);
        setAutoSaveNotification('AI Vision API generated 3 suggested annotations! Verify or adjust on canvas.');
      } else if (activeTaskType === 'semantic_segmentation') {
        const updatedGrid = { ...paintedGrid };
        for (let r = 5; r < 9; r++) {
          for (let c = 5; c < 9; c++) {
            updatedGrid[`${r}_${c}`] = 'solar_pv_array';
          }
        }
        for (let r = 1; r < 4; r++) {
          for (let c = 6; c < 9; c++) {
            updatedGrid[`${r}_${c}`] = 'building_footprint';
          }
        }
        setPaintedGrid(updatedGrid);
        pushHistorySnapshot(polygons, updatedGrid, userGridLabels);
        setAutoSaveNotification('AI Vision API suggested multi-class semantic masks across the grid!');
      } else if (activeTaskType === 'grid_classification') {
        const updatedUserGrid = { ...userGridLabels };
        updatedUserGrid['cell_2_2'] = 'Solar PV Farm';
        updatedUserGrid['cell_2_3'] = 'Solar PV Farm';
        updatedUserGrid['cell_3_2'] = 'Water Body';
        updatedUserGrid['cell_3_3'] = 'Water Body';
        setUserGridLabels(updatedUserGrid);
        pushHistorySnapshot(polygons, paintedGrid, updatedUserGrid);
        setAutoSaveNotification('AI Vision API predicted land-use labels for unassigned grid cells!');
      }

      setIsSuggestingAi(false);
      setTimeout(() => setAutoSaveNotification(null), 4500);
    }, 1100);
  };

  // REAL-TIME ANNOTATION SUMMARY STATISTICS CALCULATOR
  const annotationStats = React.useMemo(() => {
    const meanLat = (mapBounds.minLat + mapBounds.maxLat) / 2;
    const latRad = (meanLat * Math.PI) / 180;
    const totalWidthMeters = Math.abs(mapBounds.maxLon - mapBounds.minLon) * 111320 * Math.cos(latRad);
    const totalHeightMeters = Math.abs(mapBounds.maxLat - mapBounds.minLat) * 111320;
    const totalTileAreaMeters = totalWidthMeters * totalHeightMeters;

    const classStatsMap: Record<
      string,
      { label: string; name: string; color: string; count: number; areaMeters: number; percentTile: number; aiCount: number }
    > = {
      building_footprint: { label: 'building_footprint', name: 'Building Roofs', color: '#14b8a6', count: 0, areaMeters: 0, percentTile: 0, aiCount: 0 },
      solar_pv_array: { label: 'solar_pv_array', name: 'Solar PV Arrays', color: '#f59e0b', count: 0, areaMeters: 0, percentTile: 0, aiCount: 0 },
      cargo_vessel: { label: 'cargo_vessel', name: 'Cargo Vessels', color: '#3b82f6', count: 0, areaMeters: 0, percentTile: 0, aiCount: 0 },
      water_body: { label: 'water_body', name: 'Water Features', color: '#06b6d4', count: 0, areaMeters: 0, percentTile: 0, aiCount: 0 },
      vegetation_canopy: { label: 'vegetation_canopy', name: 'Vegetation Canopy', color: '#10b981', count: 0, areaMeters: 0, percentTile: 0, aiCount: 0 },
      road_network: { label: 'road_network', name: 'Road Infrastructure', color: '#64748b', count: 0, areaMeters: 0, percentTile: 0, aiCount: 0 },
    };

    let totalLabeledAreaMeters = 0;
    let totalObjectCount = 0;
    let totalAiCount = 0;
    let totalConfidenceSum = 0;
    let confidenceCount = 0;

    if (activeTaskType === 'bbox_detection') {
      polygons.forEach((p) => {
        if (p.visible === false) return;
        totalObjectCount += 1;
        if (p.confidence) {
          totalConfidenceSum += p.confidence;
          confidenceCount += 1;
        }
        if (p.notes?.toLowerCase().includes('ai') || p.notes?.toLowerCase().includes('sam') || p.id.includes('ai-')) {
          totalAiCount += 1;
        }

        let areaPctSq = 0;
        const pts = p.points;
        const n = pts.length;
        if (n >= 3) {
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            areaPctSq += pts[i].x * pts[j].y;
            areaPctSq -= pts[j].x * pts[i].y;
          }
          areaPctSq = Math.abs(areaPctSq) / 2;
        } else if (n === 2) {
          areaPctSq = Math.abs((pts[1].x - pts[0].x) * (pts[1].y - pts[0].y));
        }

        const polyAreaMeters = (areaPctSq / 10000) * totalTileAreaMeters;
        totalLabeledAreaMeters += polyAreaMeters;

        if (!classStatsMap[p.label]) {
          classStatsMap[p.label] = {
            label: p.label,
            name: p.label.replace(/_/g, ' '),
            color: p.color || '#a855f7',
            count: 0,
            areaMeters: 0,
            percentTile: 0,
            aiCount: 0,
          };
        }

        classStatsMap[p.label].count += 1;
        classStatsMap[p.label].areaMeters += polyAreaMeters;
        if (p.notes?.toLowerCase().includes('ai') || p.notes?.toLowerCase().includes('sam') || p.id.includes('ai-')) {
          classStatsMap[p.label].aiCount += 1;
        }
      });
    } else if (activeTaskType === 'semantic_segmentation') {
      const cellAreaMeters = totalTileAreaMeters / 100;
      Object.values(paintedGrid).forEach((cls) => {
        if (!cls) return;
        const clsStr = cls as string;
        totalObjectCount += 1;
        totalLabeledAreaMeters += cellAreaMeters;
        if (!classStatsMap[clsStr]) {
          classStatsMap[clsStr] = {
            label: clsStr,
            name: clsStr.replace(/_/g, ' '),
            color: '#38bdf8',
            count: 0,
            areaMeters: 0,
            percentTile: 0,
            aiCount: 0,
          };
        }
        classStatsMap[clsStr].count += 1;
        classStatsMap[clsStr].areaMeters += cellAreaMeters;
      });
    } else if (activeTaskType === 'grid_classification') {
      const cellAreaMeters = totalTileAreaMeters / 16;
      Object.values(userGridLabels).forEach((cls) => {
        if (!cls) return;
        const clsStr = cls as string;
        totalObjectCount += 1;
        totalLabeledAreaMeters += cellAreaMeters;
        const key = clsStr.toLowerCase().replace(/\s+/g, '_');
        if (!classStatsMap[key]) {
          classStatsMap[key] = {
            label: key,
            name: clsStr,
            color: '#a855f7',
            count: 0,
            areaMeters: 0,
            percentTile: 0,
            aiCount: 0,
          };
        }
        classStatsMap[key].count += 1;
        classStatsMap[key].areaMeters += cellAreaMeters;
      });
    }

    Object.keys(classStatsMap).forEach((k) => {
      const c = classStatsMap[k];
      c.percentTile = totalTileAreaMeters > 0 ? (c.areaMeters / totalTileAreaMeters) * 100 : 0;
    });

    const totalLabeledPercentTile = totalTileAreaMeters > 0 ? (totalLabeledAreaMeters / totalTileAreaMeters) * 100 : 0;
    const avgConfidence = confidenceCount > 0 ? totalConfidenceSum / confidenceCount : 0.95;

    return {
      totalTileAreaMeters: +totalTileAreaMeters.toFixed(1),
      totalLabeledAreaMeters: +totalLabeledAreaMeters.toFixed(1),
      totalLabeledPercentTile: +Math.min(100, totalLabeledPercentTile).toFixed(1),
      totalObjectCount,
      totalAiCount,
      avgConfidence: +(avgConfidence * 100).toFixed(1),
      classStatsList: Object.values(classStatsMap).filter((cs) => cs.count > 0 || cs.areaMeters > 0),
    };
  }, [polygons, paintedGrid, userGridLabels, mapBounds, activeTaskType]);

  // Metadata Attribute Update Handler
  const handleUpdatePolygonMetadata = (id: string, updates: Partial<DrawnPolygon>) => {
    const updated = polygons.map((p) => (p.id === id ? { ...p, ...updates } : p));
    setPolygons(updated);
  };

  // Preset Tile Extents & CRS Metadata Map
  const DEMO_EXTENTS = [
    { crs: 'EPSG:3857 (Web Mercator)', minLat: 37.7725, maxLat: 37.7749, minLon: -122.4194, maxLon: -122.4170 },
    { crs: 'EPSG:32611 (UTM Zone 11N)', minLat: 35.6020, maxLat: 35.6120, minLon: -115.4780, maxLon: -115.4650 },
    { crs: 'EPSG:4326 (WGS84)', minLat: 51.9420, maxLat: 51.9540, minLon: 4.1220, maxLon: 4.1380 },
    { crs: 'EPSG:31980 (SIRGAS 2000 / UTM 20S)', minLat: -3.1070, maxLat: -3.0950, minLon: -60.0250, maxLon: -60.0100 },
  ];

  // Switch Dataset Preset
  const handleSelectDemo = (idx: number) => {
    setSelectedDemoIndex(idx);
    const demo = SAMPLE_ANNOTATION_DEMOS[idx];
    const extent = DEMO_EXTENTS[idx] || DEMO_EXTENTS[0];
    setCrsMetadata(extent.crs);
    setMapBounds({
      minLat: extent.minLat,
      maxLat: extent.maxLat,
      minLon: extent.minLon,
      maxLon: extent.maxLon,
    });
    if (demo.presetPolygons) {
      setPolygons(
        demo.presetPolygons.map((p, i) => ({
          id: `poly-preset-${i}`,
          label: p.label.toLowerCase().replace(/\s+/g, '_'),
          color: p.color,
          toolType: 'polygon',
          points: p.points,
        }))
      );
    }
    setCurrentDraftPoints([]);
    setScoringResult(null);
  };

  // Normalized Canvas Coordinates with Zoom & Pan Offset Compensation
  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const unzoomedX = (rawX - centerX - panOffset.x) / zoomLevel + centerX;
    const unzoomedY = (rawY - centerY - panOffset.y) / zoomLevel + centerY;

    let x = Math.round((unzoomedX / rect.width) * 100);
    let y = Math.round((unzoomedY / rect.height) * 100);

    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    return { x, y };
  };

  // Canvas Click Handler for Vector Task 1
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTaskType !== 'bbox_detection' || isPanMode || isPanning || !canvasRef.current) return;
    const { x, y } = getNormalizedCoords(e);

    if (activeTool === 'point') {
      const newPointShape: DrawnPolygon = {
        id: `point-${Date.now()}`,
        label: activeClass,
        color: CLASS_COLORS[activeClass] || '#14b8a6',
        toolType: 'point',
        points: [{ x, y }],
        visible: true,
        locked: false,
      };
      const updatedPolys = [...polygons, newPointShape];
      setPolygons(updatedPolys);
      setSelectedPolyId(newPointShape.id);
      pushHistorySnapshot(updatedPolys, paintedGrid, userGridLabels);
      return;
    }

    if (activeTool === 'polygon') {
      if (currentDraftPoints.length > 2) {
        const first = currentDraftPoints[0];
        const dist = Math.hypot(x - first.x, y - first.y);
        if (dist < 5) {
          finishPolygon(currentDraftPoints);
          return;
        }
      }
      setCurrentDraftPoints((prev) => [...prev, { x, y }]);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && panStart) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (!canvasRef.current) return;
    const { x, y } = getNormalizedCoords(e);
    setMousePos({ x, y });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanMode || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    if (activeTaskType !== 'bbox_detection' || activeTool !== 'bbox' || !canvasRef.current) return;
    const { x, y } = getNormalizedCoords(e);
    setDragStart({ x, y });
    setIsDraggingBBox(true);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }

    if (activeTaskType === 'bbox_detection' && activeTool === 'bbox' && isDraggingBBox && dragStart && canvasRef.current) {
      const { x: endX, y: endY } = getNormalizedCoords(e);

      const minX = Math.min(dragStart.x, endX);
      const maxX = Math.max(dragStart.x, endX);
      const minY = Math.min(dragStart.y, endY);
      const maxY = Math.max(dragStart.y, endY);

      if (maxX - minX > 3 && maxY - minY > 3) {
        const newBBox: DrawnPolygon = {
          id: `bbox-${Date.now()}`,
          label: activeClass,
          color: CLASS_COLORS[activeClass] || '#f59e0b',
          toolType: 'bbox',
          points: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ],
          visible: true,
          locked: false,
        };
        const updatedPolys = [...polygons, newBBox];
        setPolygons(updatedPolys);
        setSelectedPolyId(newBBox.id);
        pushHistorySnapshot(updatedPolys, paintedGrid, userGridLabels);
      }
      setIsDraggingBBox(false);
      setDragStart(null);
    }
  };

  const finishPolygon = (ptsToUse?: { x: number; y: number }[]) => {
    const pts = ptsToUse || currentDraftPoints;
    if (pts.length < 3) return;

    let finalPoints = pts;
    if (orthoSnapping) {
      finalPoints = pts.map((p, i) => {
        if (i === 0) return p;
        const prev = pts[i - 1];
        const dx = Math.abs(p.x - prev.x);
        const dy = Math.abs(p.y - prev.y);
        if (dx < 3) return { x: prev.x, y: p.y };
        if (dy < 3) return { x: p.x, y: prev.y };
        return p;
      });
    }

    const newPoly: DrawnPolygon = {
      id: `poly-${Date.now()}`,
      label: activeClass,
      color: CLASS_COLORS[activeClass] || '#14b8a6',
      toolType: 'polygon',
      points: finalPoints,
      visible: true,
      locked: false,
    };

    const updatedPolys = [...polygons, newPoly];
    setPolygons(updatedPolys);
    setSelectedPolyId(newPoly.id);
    setCurrentDraftPoints([]);
    pushHistorySnapshot(updatedPolys, paintedGrid, userGridLabels);
  };

  // Task 2: Paint Cell in Segmentation Grid
  const handlePaintCell = (r: number, c: number) => {
    const key = `${r}_${c}`;
    const nextPainted = {
      ...paintedGrid,
      [key]: paintedGrid[key] === segmentationClass ? 'background' : segmentationClass,
    };
    setPaintedGrid(nextPainted);
    pushHistorySnapshot(polygons, nextPainted, userGridLabels);
  };

  // Task 3: Classify Cell in 4x4 Grid
  const handleClassifyGridCell = (cellKey: string) => {
    const nextGrid = {
      ...userGridLabels,
      [cellKey]: selectedGridClass,
    };
    setUserGridLabels(nextGrid);
    pushHistorySnapshot(polygons, paintedGrid, nextGrid);
  };

  // RUN SCORING ENGINE
  const handleRunScoringEngine = () => {
    setIsScoringRunning(true);
    setScoringResult(null);

    setTimeout(() => {
      let result: ScoringResult;

      if (activeTaskType === 'bbox_detection') {
        const gtPolygons = [
          {
            label: 'building_footprint',
            points: [
              { x: 18, y: 22 },
              { x: 46, y: 22 },
              { x: 46, y: 55 },
              { x: 18, y: 55 },
            ],
          },
          {
            label: 'solar_pv_array',
            points: [
              { x: 52, y: 28 },
              { x: 88, y: 28 },
              { x: 88, y: 48 },
              { x: 52, y: 48 },
            ],
          },
        ];
        result = scoreBoundingBoxTask(polygons, gtPolygons);
      } else if (activeTaskType === 'semantic_segmentation') {
        result = scoreSemanticSegmentationTask(paintedGrid, gtSegmentationGrid);
      } else {
        result = scoreGridClassificationTask(userGridLabels, gtGridLabels);
      }

      setScoringResult(result);
      setIsScoringRunning(false);
    }, 600);
  };

  const handleClearCurrent = () => {
    if (activeTaskType === 'bbox_detection') {
      setPolygons([]);
      setCurrentDraftPoints([]);
    } else if (activeTaskType === 'semantic_segmentation') {
      setPaintedGrid({});
    } else {
      setUserGridLabels({});
    }
    setScoringResult(null);
  };

  // Generate GeoJSON dynamically with real-world CRS and Lat/Lon coordinates
  const generateDynamicGeoJson = () => {
    if (activeTaskType === 'bbox_detection') {
      const features = polygons.map((poly) => {
        const geoCoords = poly.points.map((p) => {
          const coords = getRealWorldCoords(p.x, p.y);
          return [coords.lon, coords.lat];
        });
        if (geoCoords.length > 0) {
          const first = geoCoords[0];
          const last = geoCoords[geoCoords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            geoCoords.push([first[0], first[1]]);
          }
        }

        return {
          type: 'Feature',
          properties: {
            id: poly.id,
            class: poly.label,
            vertex_count: poly.points.length,
            ortho_snapped: orthoSnapping,
            qa_status: tileQaStatus.toUpperCase(),
            crs: crsMetadata,
            material: poly.material || null,
            condition: poly.condition || null,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [geoCoords],
          },
        };
      });

      return JSON.stringify(
        {
          type: 'FeatureCollection',
          crs: {
            type: 'name',
            properties: {
              name: crsMetadata,
            },
          },
          bbox: [mapBounds.minLon, mapBounds.minLat, mapBounds.maxLon, mapBounds.maxLat],
          features,
        },
        null,
        2
      );
    } else if (activeTaskType === 'semantic_segmentation') {
      return JSON.stringify(
        {
          task: 'Semantic_Segmentation_Mask',
          crs: crsMetadata,
          bbox: [mapBounds.minLon, mapBounds.minLat, mapBounds.maxLon, mapBounds.maxLat],
          image_dimensions: { width: 800, height: 800, channels: 3 },
          paintedCellCount: Object.keys(paintedGrid).length,
          paintedGrid,
          scoringVerdict: scoringResult?.verdict || 'UNSCORED',
        },
        null,
        2
      );
    } else {
      return JSON.stringify(
        {
          task: 'Grid_Cell_LandUse_Classification',
          crs: crsMetadata,
          bbox: [mapBounds.minLon, mapBounds.minLat, mapBounds.maxLon, mapBounds.maxLat],
          classifiedCells: userGridLabels,
          scoringVerdict: scoringResult?.verdict || 'UNSCORED',
        },
        null,
        2
      );
    }
  };

  // Generate MS COCO Format JSON
  const generateCOCOJson = () => {
    const categories = [
      { id: 1, name: 'building_footprint', supercategory: 'infrastructure' },
      { id: 2, name: 'solar_pv_array', supercategory: 'cleantech' },
      { id: 3, name: 'cargo_vessel', supercategory: 'maritime' },
      { id: 4, name: 'water_body', supercategory: 'hydrology' },
    ];

    if (activeTaskType === 'bbox_detection') {
      const annotations = polygons.map((p, idx) => {
        const xs = p.points.map((pt) => pt.x * 8); // Scaled to 800px canvas
        const ys = p.points.map((pt) => pt.y * 8);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const width = maxX - minX;
        const height = maxY - minY;

        const segPoints: number[] = [];
        p.points.forEach((pt) => {
          segPoints.push(Math.round(pt.x * 8), Math.round(pt.y * 8));
        });

        const catObj = categories.find((c) => c.name === p.label) || categories[0];

        return {
          id: idx + 1,
          image_id: 1001,
          category_id: catObj.id,
          segmentation: [segPoints],
          area: Math.round(width * height),
          bbox: [Math.round(minX), Math.round(minY), Math.round(width), Math.round(height)],
          iscrowd: 0,
        };
      });

      return JSON.stringify(
        {
          info: {
            description: `GeoLabel ML Export - ${currentDemo.name}`,
            url: 'https://geolabel.ai',
            version: '1.0',
            year: 2026,
            contributor: 'GeoLabel Enterprise QA',
            date_created: new Date().toISOString(),
          },
          licenses: [{ id: 1, name: 'Commercial SLA Data License', url: '' }],
          images: [
            {
              id: 1001,
              width: 800,
              height: 800,
              file_name: `${currentDemo.name.toLowerCase().replace(/\s+/g, '_')}_gsd_${currentDemo.gsd.replace(/\s+/g, '')}.tif`,
              license: 1,
              date_captured: new Date().toISOString(),
            },
          ],
          annotations,
          categories,
        },
        null,
        2
      );
    } else {
      return JSON.stringify(
        {
          info: { description: `GeoLabel Task Export - ${activeTaskType}` },
          task_type: activeTaskType,
          grid_data: activeTaskType === 'semantic_segmentation' ? paintedGrid : userGridLabels,
        },
        null,
        2
      );
    }
  };

  // Generate CSV Attribute Table Format with Real-World Spatial Positioning
  const generateCsvExport = () => {
    if (activeTaskType === 'bbox_detection') {
      const header = 'id,label,vertex_count,crs,center_lon,center_lat,wkt_geometry\n';
      const rows = polygons.map((p) => {
        const centerPctX = p.points.reduce((acc, pt) => acc + pt.x, 0) / (p.points.length || 1);
        const centerPctY = p.points.reduce((acc, pt) => acc + pt.y, 0) / (p.points.length || 1);
        const center = getRealWorldCoords(centerPctX, centerPctY);

        const wktCoords = p.points
          .map((pt) => {
            const c = getRealWorldCoords(pt.x, pt.y);
            return `${c.lon} ${c.lat}`;
          })
          .join(', ');
        const wkt = `"POLYGON ((${wktCoords}))"`;

        return `${p.id},${p.label},${p.points.length},"${crsMetadata}",${center.lon},${center.lat},${wkt}`;
      });
      return header + rows.join('\n');
    } else {
      const header = 'cell_key,assigned_label,crs\n';
      const data = activeTaskType === 'semantic_segmentation' ? paintedGrid : userGridLabels;
      const rows = Object.entries(data).map(([k, v]) => `${k},${v},"${crsMetadata}"`);
      return header + rows.join('\n');
    }
  };

  // Generate YOLO Format TXT Labels
  const generateYoloExport = () => {
    if (activeTaskType === 'bbox_detection') {
      const classMap: Record<string, number> = {
        building_footprint: 0,
        solar_pv_array: 1,
        cargo_vessel: 2,
      };

      return polygons
        .map((p) => {
          const xs = p.points.map((pt) => pt.x / 100);
          const ys = p.points.map((pt) => pt.y / 100);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const w = maxX - minX;
          const h = maxY - minY;

          const classId = classMap[p.label] ?? 0;
          return `${classId} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`;
        })
        .join('\n');
    } else {
      return '# YOLO format supports Bounding Box / Segment labels\n0 0.500000 0.500000 0.250000 0.250000';
    }
  };

  // Handle actual browser file download
  const handleDownloadSampleFile = (formatToUse?: 'geojson' | 'coco' | 'csv' | 'yolo') => {
    const format = formatToUse || exportFormat;
    let content = '';
    let filename = `geolabel_sample_${currentDemo.name.toLowerCase().replace(/\s+/g, '_')}`;
    let mimeType = 'text/plain';

    if (format === 'geojson') {
      content = generateDynamicGeoJson();
      filename += '.geojson';
      mimeType = 'application/geo+json';
    } else if (format === 'coco') {
      content = generateCOCOJson();
      filename += '_coco.json';
      mimeType = 'application/json';
    } else if (format === 'csv') {
      content = generateCsvExport();
      filename += '_attribute_table.csv';
      mimeType = 'text/csv';
    } else if (format === 'yolo') {
      content = generateYoloExport();
      filename += '_yolo_labels.txt';
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccessMessage(`Downloaded ${filename} successfully!`);
    setTimeout(() => setDownloadSuccessMessage(null), 4000);
  };

  const handleCopyGeoJson = () => {
    const contentToCopy =
      exportFormat === 'geojson'
        ? generateDynamicGeoJson()
        : exportFormat === 'coco'
        ? generateCOCOJson()
        : exportFormat === 'csv'
        ? generateCsvExport()
        : generateYoloExport();

    navigator.clipboard.writeText(contentToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <section id="interactive-studio" className="py-20 bg-slate-900 border-b border-slate-800 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>LIVE SCORING ENGINE & ANNOTATION WORKSPACE</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Interactive Annotation Workspace & Live Scoring Engine
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Switch between three task modes (Bounding Boxes, Segmentation Region Painting, and Grid Classification), annotate real satellite imagery, and hit <strong className="text-teal-400">"Submit for Scoring"</strong> to run our live evaluation engine.
          </p>
        </div>

        {/* TASK MODE SWITCHER NAV */}
        <div className="flex justify-center">
          <div className="inline-flex p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-mono shadow-xl">
            <button
              onClick={() => {
                setActiveTaskType('bbox_detection');
                setScoringResult(null);
              }}
              className={`px-4 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                activeTaskType === 'bbox_detection'
                  ? 'bg-teal-700 text-white shadow-lg border border-teal-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-4 h-4 text-teal-300" />
              <span>Task 1: Bounding Box & Vector OBB</span>
            </button>

            <button
              onClick={() => {
                setActiveTaskType('semantic_segmentation');
                setScoringResult(null);
              }}
              className={`px-4 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                activeTaskType === 'semantic_segmentation'
                  ? 'bg-teal-700 text-white shadow-lg border border-teal-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Paintbrush className="w-4 h-4 text-amber-300" />
              <span>Task 2: Semantic Segmentation Painting</span>
            </button>

            <button
              onClick={() => {
                setActiveTaskType('grid_classification');
                setScoringResult(null);
              }}
              className={`px-4 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                activeTaskType === 'grid_classification'
                  ? 'bg-teal-700 text-white shadow-lg border border-teal-500'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-4 h-4 text-purple-300" />
              <span>Task 3: Grid Cell Classification</span>
            </button>
          </div>
        </div>

        {/* AUTO-SAVE RESTORATION & STATUS TOAST */}
        {autoSaveNotification && (
          <div className="bg-emerald-950/90 border border-emerald-600/60 p-3 rounded-xl shadow-xl font-mono text-xs text-emerald-300 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <Save className="w-4 h-4 text-emerald-400" />
              <span className="font-bold">{autoSaveNotification}</span>
            </div>
            {isRestoredFromAutoSave && (
              <button
                onClick={handleClearSavedSession}
                className="px-2.5 py-1 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 rounded text-[10px] font-bold transition-colors cursor-pointer"
              >
                Reset to Default Preset
              </button>
            )}
          </div>
        )}

        {/* BATCH PROCESSING TILE QUEUE BAR */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3 font-mono text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-teal-400" />
              <span className="font-bold text-white text-xs uppercase tracking-wider">Enterprise Batch Processing Queue</span>
              <span className="bg-teal-950 text-teal-300 border border-teal-800 px-2 py-0.5 rounded text-[10px] font-bold">
                {batchQueue.filter((b) => b.status === 'completed').length}/{batchQueue.length} Tiles Validated
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsBatchQueueModalOpen(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-teal-300 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 shadow border border-slate-700 cursor-pointer"
                title="Open Batch Task Queue Summary View & Automation Pipeline (Key: Q)"
              >
                <Maximize2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Queue Manager Summary</span>
                <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 text-[9px] text-slate-300 rounded font-bold">Q</kbd>
              </button>

              <button
                onClick={() => handleDownloadSampleFile('coco')}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 shadow border border-teal-400 cursor-pointer"
                title="Batch Export All Queued Annotation Payloads"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Batch Export All ({batchQueue.length} Tiles)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {batchQueue.map((item) => {
              const isActive = selectedDemoIndex === item.demoIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectDemo(item.demoIndex)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-800 border-teal-500 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="font-bold truncate text-[11px] flex items-center gap-1.5">
                      <span>{item.name}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 truncate">{item.location}</div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Done
                      </span>
                    )}
                    {item.status === 'in_progress' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 text-[9px] font-bold">
                        <RefreshCw className="w-3 h-3 text-teal-400 animate-spin" /> Active
                      </span>
                    )}
                    {item.status === 'queued' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-800 text-[9px]">
                        Queued
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Studio Workbench Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-6">
          
          {/* Left Panel: Tools per Task */}
          <div className="lg:col-span-3 space-y-4 font-mono text-xs">
            
            {/* TASK 1 CONTROLS */}
            {activeTaskType === 'bbox_detection' && (
              <>
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider">
                    1. Vector Tool Selection
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setActiveTool('polygon')}
                      className={`p-2.5 rounded-lg border flex items-center gap-2 transition-all ${
                        activeTool === 'polygon'
                          ? 'bg-teal-900/90 text-white border-teal-500 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <PenTool className="w-4 h-4 text-teal-400" />
                      <span>Polygon</span>
                    </button>

                    <button
                      onClick={() => setActiveTool('bbox')}
                      className={`p-2.5 rounded-lg border flex items-center gap-2 transition-all ${
                        activeTool === 'bbox'
                          ? 'bg-teal-900/90 text-white border-teal-500 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Square className="w-4 h-4 text-amber-400" />
                      <span>BBox / OBB</span>
                    </button>
                  </div>

                  <button
                    onClick={handleAiAutoSegment}
                    disabled={isAiSegmenting}
                    className="w-full p-2.5 rounded-lg border border-purple-800 bg-purple-950/80 hover:bg-purple-900 text-purple-200 flex items-center justify-center gap-2 transition-all font-bold shadow cursor-pointer disabled:opacity-50"
                    title="Run AI Segment Anything Model 2 on ROI"
                  >
                    {isAiSegmenting ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                        <span>SAM 2 Segmenting...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 text-purple-400" />
                        <span>AI Auto-Segment (SAM 2)</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSuggestAiAnnotations}
                    disabled={isSuggestingAi}
                    className="w-full p-2.5 rounded-lg border border-amber-600/80 bg-amber-950/90 hover:bg-amber-900 text-amber-200 flex items-center justify-center gap-2 transition-all font-bold shadow cursor-pointer disabled:opacity-50"
                    title="Run AI GeoVision Predictor to generate suggested masks and bounding boxes"
                  >
                    {isSuggestingAi ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                        <span>Suggesting Annotations...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span>Suggest Annotations (GeoAI)</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider">
                    2. Polygon Class Taxonomy
                  </span>
                  <select
                    value={activeClass}
                    onChange={(e) => setActiveClass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-teal-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-500"
                  >
                    <option value="building_footprint">building_footprint</option>
                    <option value="solar_pv_array">solar_pv_array</option>
                    <option value="cargo_vessel">cargo_vessel</option>
                  </select>
                </div>

                {/* LAYER & CLASS MANAGEMENT SIDEBAR */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-teal-400" />
                      <span>Layer & Class Management</span>
                    </span>
                    <span className="text-[10px] text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800 font-mono">
                      {polygons.length} {polygons.length === 1 ? 'layer' : 'layers'}
                    </span>
                  </div>

                  {/* Class-level Visibility & Lock Toggles */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-800">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Class Toggles</span>
                    {[
                      { label: 'building_footprint', name: 'Building Roofs', color: '#14b8a6' },
                      { label: 'solar_pv_array', name: 'Solar PV Panels', color: '#f59e0b' },
                      { label: 'cargo_vessel', name: 'Cargo Vessels', color: '#3b82f6' },
                    ].map((cls) => {
                      const clsPolys = polygons.filter((p) => p.label === cls.label);
                      const isAllHidden = clsPolys.length > 0 && clsPolys.every((p) => p.visible === false);
                      const isAllLocked = clsPolys.length > 0 && clsPolys.every((p) => p.locked === true);

                      return (
                        <div key={cls.label} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                          <div className="flex items-center gap-2 text-[11px]">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cls.color }} />
                            <span className="text-slate-300 font-semibold">{cls.name}</span>
                            <span className="text-[9px] text-slate-500">({clsPolys.length})</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleClassVisibility(cls.label)}
                              disabled={clsPolys.length === 0}
                              className={`p-1 rounded transition-colors ${
                                clsPolys.length === 0
                                  ? 'text-slate-700 cursor-not-allowed'
                                  : isAllHidden
                                  ? 'text-slate-600 hover:text-slate-400'
                                  : 'text-teal-400 hover:text-teal-300'
                              }`}
                              title={isAllHidden ? 'Show Class' : 'Hide Class'}
                            >
                              {isAllHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              onClick={() => handleToggleClassLock(cls.label)}
                              disabled={clsPolys.length === 0}
                              className={`p-1 rounded transition-colors ${
                                clsPolys.length === 0
                                  ? 'text-slate-700 cursor-not-allowed'
                                  : isAllLocked
                                  ? 'text-amber-400 hover:text-amber-300'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                              title={isAllLocked ? 'Unlock Class' : 'Lock Class'}
                            >
                              {isAllLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Individual Vector Shapes Layer List */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Vector Objects</span>

                    {polygons.length === 0 ? (
                      <div className="p-3 text-center text-slate-500 text-[11px] italic">
                        No vector shapes. Draw with Polygon or BBox tool.
                      </div>
                    ) : (
                      <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1">
                        {polygons.map((poly) => {
                          const isSelected = selectedPolyId === poly.id;
                          const isVisible = poly.visible !== false;
                          const isLocked = poly.locked === true;

                          return (
                            <div
                              key={poly.id}
                              onClick={() => !isLocked && setSelectedPolyId(poly.id)}
                              className={`p-2 rounded-lg border flex items-center justify-between text-[11px] transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-800 border-teal-500 text-white font-semibold'
                                  : 'bg-slate-950 border-slate-850 text-slate-400 hover:bg-slate-900'
                              } ${!isVisible ? 'opacity-50' : ''}`}
                            >
                              <div className="flex items-center gap-2 truncate pr-1">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: poly.color }} />
                                <span className="truncate">{poly.label}</span>
                                <span className="text-[9px] text-slate-500 font-mono">({poly.points.length}pts)</span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePolygonVisibility(poly.id);
                                  }}
                                  className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                                    isVisible ? 'text-teal-400' : 'text-slate-600'
                                  }`}
                                  title={isVisible ? 'Hide Layer' : 'Show Layer'}
                                >
                                  {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePolygonLock(poly.id);
                                  }}
                                  className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                                    isLocked ? 'text-amber-400' : 'text-slate-600'
                                  }`}
                                  title={isLocked ? 'Unlock Layer' : 'Lock Layer'}
                                >
                                  {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) handleDeletePolygon(poly.id);
                                  }}
                                  disabled={isLocked}
                                  className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                                    isLocked ? 'text-slate-700 cursor-not-allowed' : 'text-rose-400 hover:text-rose-300'
                                  }`}
                                  title={isLocked ? 'Locked (Cannot Delete)' : 'Delete Layer'}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* OBJECT ATTRIBUTE TAGGING INSPECTOR */}
                {selectedPolyId && (
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                    <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      <span>Object Attribute Tagging</span>
                    </span>

                    {(() => {
                      const selectedPoly = polygons.find((p) => p.id === selectedPolyId);
                      if (!selectedPoly) return null;

                      return (
                        <div className="space-y-2 text-[11px]">
                          <div>
                            <label className="text-slate-500 font-bold block text-[10px] uppercase mb-1">
                              Structural Material
                            </label>
                            <select
                              value={selectedPoly.material || 'Reinforced Concrete Roof'}
                              onChange={(e) =>
                                handleUpdatePolygonMetadata(selectedPoly.id, { material: e.target.value })
                              }
                              className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-teal-500"
                            >
                              <option value="Reinforced Concrete Roof">Reinforced Concrete Roof</option>
                              <option value="Monocrystalline Silicon PV">Monocrystalline Silicon PV</option>
                              <option value="Structural Metal Deck">Structural Metal Deck</option>
                              <option value="Asphalt Shingle">Asphalt Shingle</option>
                              <option value="Steel Cargo Hull">Steel Cargo Hull</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-500 font-bold block text-[10px] uppercase mb-1">
                              Physical Condition
                            </label>
                            <select
                              value={selectedPoly.condition || 'Intact'}
                              onChange={(e) =>
                                handleUpdatePolygonMetadata(selectedPoly.id, { condition: e.target.value })
                              }
                              className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-teal-500"
                            >
                              <option value="Intact">Intact / Prime</option>
                              <option value="Minor Degradation">Minor Degradation</option>
                              <option value="Severe Damage">Severe Damage / Anomaly</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-slate-500 font-bold block text-[10px] uppercase mb-1">
                              QA Audit Note
                            </label>
                            <textarea
                              rows={2}
                              value={selectedPoly.notes || ''}
                              onChange={(e) =>
                                handleUpdatePolygonMetadata(selectedPoly.id, { notes: e.target.value })
                              }
                              placeholder="Add QA inspection comments..."
                              className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-lg p-2 text-[11px] focus:outline-none focus:border-teal-500 resize-none font-sans"
                            />
                          </div>

                          {selectedPoly.confidence && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                              <span className="text-slate-400">AI Confidence:</span>
                              <span className="text-emerald-400 font-bold font-mono">
                                {(selectedPoly.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* TILE QA AUDIT WORKFLOW CARD */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                      <span>Tile QA Audit Workflow</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        tileQaStatus === 'approved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : tileQaStatus === 'needs_review'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-950 text-teal-400 border border-slate-800'
                      }`}
                    >
                      {tileQaStatus.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTileQaStatus('approved')}
                      className={`p-2 rounded-lg border flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer ${
                        tileQaStatus === 'approved'
                          ? 'bg-emerald-900 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Approve</span>
                    </button>

                    <button
                      onClick={() => setTileQaStatus('needs_review')}
                      className={`p-2 rounded-lg border flex items-center justify-center gap-1 text-[11px] font-bold transition-all cursor-pointer ${
                        tileQaStatus === 'needs_review'
                          ? 'bg-amber-900 border-amber-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Flag QA</span>
                    </button>
                  </div>
                </div>

                {/* CRS METADATA & MAP BOUNDS EXTENTS CARD */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-teal-400" />
                      <span>CRS & Map Extents</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-teal-950 text-teal-300 border border-teal-800 font-bold">
                      SPATIAL
                    </span>
                  </div>

                  {/* CRS Reference Selector */}
                  <div>
                    <label className="text-slate-500 font-bold block text-[10px] uppercase mb-1 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-amber-400" />
                      <span>Coordinate Reference System</span>
                    </label>
                    <select
                      value={crsMetadata}
                      onChange={(e) => setCrsMetadata(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-mono rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-teal-500"
                    >
                      <option value="EPSG:4326 (WGS84)">EPSG:4326 (WGS84 Lat/Lon)</option>
                      <option value="EPSG:3857 (Web Mercator)">EPSG:3857 (Web Mercator Spherical)</option>
                      <option value="EPSG:32611 (UTM Zone 11N)">EPSG:32611 (UTM Zone 11N Meter)</option>
                      <option value="EPSG:26910 (NAD83 / UTM 10N)">EPSG:26910 (NAD83 / UTM 10N)</option>
                      <option value="EPSG:31980 (SIRGAS 2000 / UTM 20S)">EPSG:31980 (SIRGAS 2000 UTM 20S)</option>
                    </select>
                  </div>

                  {/* Geographic Extents Bounds */}
                  <div className="space-y-1.5">
                    <label className="text-slate-500 font-bold block text-[10px] uppercase flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-teal-400" />
                      <span>Map Bounding Box Extents</span>
                    </label>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div>
                        <span className="text-slate-400 block mb-0.5">North (Max Lat)</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={mapBounds.maxLat}
                          onChange={(e) =>
                            setMapBounds((prev) => ({ ...prev, maxLat: parseFloat(e.target.value) || prev.maxLat }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      <div>
                        <span className="text-slate-400 block mb-0.5">South (Min Lat)</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={mapBounds.minLat}
                          onChange={(e) =>
                            setMapBounds((prev) => ({ ...prev, minLat: parseFloat(e.target.value) || prev.minLat }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      <div>
                        <span className="text-slate-400 block mb-0.5">West (Min Lon)</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={mapBounds.minLon}
                          onChange={(e) =>
                            setMapBounds((prev) => ({ ...prev, minLon: parseFloat(e.target.value) || prev.minLon }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      <div>
                        <span className="text-slate-400 block mb-0.5">East (Max Lon)</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={mapBounds.maxLon}
                          onChange={(e) =>
                            setMapBounds((prev) => ({ ...prev, maxLon: parseFloat(e.target.value) || prev.maxLon }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 text-teal-300 font-bold rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                    <span>Tile Span:</span>
                    <span className="text-teal-300 font-bold">
                      {Math.abs(mapBounds.maxLat - mapBounds.minLat).toFixed(4)}° × {Math.abs(mapBounds.maxLon - mapBounds.minLon).toFixed(4)}°
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* TASK 2 CONTROLS */}
            {activeTaskType === 'semantic_segmentation' && (
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Paintbrush className="w-3.5 h-3.5 text-amber-400" />
                  <span>Paint Brush Class Palette</span>
                </span>
                <p className="text-[11px] text-slate-400 font-sans">
                  Click grid cells on the satellite image to paint or erase segmentation masks.
                </p>

                <div className="space-y-2">
                  {[
                    { id: 'building_footprint', name: 'Building Roof', color: '#14b8a6' },
                    { id: 'solar_pv_array', name: 'Solar PV Array', color: '#f59e0b' },
                    { id: 'water_body', name: 'Water Channel', color: '#3b82f6' },
                  ].map((cls) => (
                    <button
                      key={cls.id}
                      onClick={() => setSegmentationClass(cls.id)}
                      className={`w-full p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                        segmentationClass === cls.id
                          ? 'bg-slate-800 border-teal-500 text-white font-bold'
                          : 'bg-slate-950 border-slate-850 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                        <span>{cls.name}</span>
                      </div>
                      {segmentationClass === cls.id && <Check className="w-3.5 h-3.5 text-teal-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TASK 3 CONTROLS */}
            {activeTaskType === 'grid_classification' && (
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Grid className="w-3.5 h-3.5 text-purple-400" />
                  <span>Land-Use Grid Classifier</span>
                </span>
                <p className="text-[11px] text-slate-400 font-sans">
                  Select a category below, then click a tile in the 4x4 grid to assign classification.
                </p>

                <div className="space-y-2">
                  {[
                    'Urban High-Density',
                    'Industrial Port',
                    'Solar PV Farm',
                    'Vegetation Canopy',
                    'Water Body',
                  ].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedGridClass(cat)}
                      className={`w-full p-2 rounded-lg border flex items-center justify-between text-left transition-all ${
                        selectedGridClass === cat
                          ? 'bg-slate-800 border-teal-500 text-white font-bold'
                          : 'bg-slate-950 border-slate-850 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      <span>{cat}</span>
                      {selectedGridClass === cat && <Check className="w-3.5 h-3.5 text-teal-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scoring Action & Clear Buttons */}
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
              <button
                onClick={handleRunScoringEngine}
                disabled={isScoringRunning}
                className="w-full py-3 bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs rounded-xl border border-teal-500 shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isScoringRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Scoring Engine...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                    <span>Submit for Live Scoring</span>
                  </>
                )}
              </button>

              <button
                onClick={handleClearCurrent}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Annotations</span>
              </button>
            </div>

          </div>

          {/* Center Column: Interactive Canvas for active task */}
          <div className="lg:col-span-6 space-y-4">
            
            {/* Top Toolbar Info, Shortcuts, Live Collab, and Undo/Redo Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-teal-400" />
                  <span className="font-bold text-white">{currentDemo.location}</span>
                </div>
                <span className="text-slate-700">|</span>
                <div className="text-slate-400">
                  GSD: <strong className="text-teal-300">{currentDemo.gsd}</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* AI Suggest Annotations Toolbar Action */}
                <button
                  onClick={handleSuggestAiAnnotations}
                  disabled={isSuggestingAi}
                  className="px-2.5 py-1.5 bg-purple-950/90 hover:bg-purple-900 border border-purple-700/80 text-purple-200 rounded-lg flex items-center gap-1.5 text-[11px] font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                  title="Run AI Vision Model to suggest bounding boxes or masks for current tile"
                >
                  {isSuggestingAi ? (
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                  )}
                  <span className="hidden sm:inline">Suggest AI</span>
                </button>

                {/* Density Heatmap Toggle Button */}
                <button
                  onClick={() => setShowDensityHeatmap((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all ${
                    showDensityHeatmap
                      ? 'bg-amber-950/90 border-amber-600 text-amber-300 shadow-md ring-1 ring-amber-500/40'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle Density Heatmap Visualization of Annotation Frequency & Overlap (Key: H)"
                >
                  <Flame className={`w-3.5 h-3.5 ${showDensityHeatmap ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
                  <span className="hidden sm:inline">Heatmap</span>
                  <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 text-[9px] text-slate-300 rounded font-bold">H</kbd>
                </button>

                {/* Keyboard Shortcuts Trigger Button */}
                <button
                  onClick={() => setIsShortcutsModalOpen(true)}
                  className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-teal-300 rounded-lg border border-slate-800 flex items-center gap-1.5 text-[11px] transition-colors"
                  title="Keyboard Shortcuts Cheatsheet (Press K or ?)"
                >
                  <Keyboard className="w-3.5 h-3.5 text-teal-400" />
                  <span className="hidden sm:inline">Shortcuts</span>
                  <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 text-[9px] text-slate-300 rounded font-bold">K</kbd>
                </button>

                {/* Live Peer Collaboration Toggle */}
                <button
                  onClick={() => setIsCollabActive((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold transition-all ${
                    isCollabActive
                      ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle Real-Time Collaborative Peer Cursors"
                >
                  <Users className={`w-3.5 h-3.5 ${isCollabActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="hidden sm:inline">{isCollabActive ? 'Collab: Live (2)' : 'Collab: Off'}</span>
                </button>

                {/* Undo / Redo buttons */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={handleUndo}
                    disabled={historyIndex === 0}
                    className={`p-1.5 rounded transition-colors flex items-center gap-1 text-[11px] ${
                      historyIndex === 0
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Undo (Key: U or Ctrl+Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-teal-400" />
                    <span className="hidden sm:inline">Undo</span>
                  </button>

                  <button
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className={`p-1.5 rounded transition-colors flex items-center gap-1 text-[11px] ${
                      historyIndex >= history.length - 1
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Redo (Key: R or Ctrl+Y)"
                  >
                    <Redo2 className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Redo</span>
                  </button>
                </div>

                {/* Export Sample Quick Button */}
                <button
                  onClick={() => setIsExportModalOpen(true)}
                  className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold transition-all flex items-center gap-1.5 text-[11px] shadow border border-teal-400 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* TASK 1: VECTOR CANVAS */}
            {activeTaskType === 'bbox_detection' && (
              <>
                <div
                  ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                className={`relative h-[440px] rounded-2xl border-2 border-slate-800 bg-slate-950 overflow-hidden shadow-2xl select-none group ${
                  isPanMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
                }`}
              >
                {/* Scalable & Pannable Container Layer */}
                <div
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                  }}
                  className="w-full h-full relative"
                >
                  <img
                    src={currentDemo.imageUrl}
                    alt={currentDemo.name}
                    className="w-full h-full object-cover opacity-90 transition-opacity"
                    referrerPolicy="no-referrer"
                  />

                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <defs>
                      <radialGradient id="densityHeatGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
                        <stop offset="35%" stopColor="#f97316" stopOpacity="0.65" />
                        <stop offset="65%" stopColor="#eab308" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Density Heatmap Visualization Layer */}
                    {showDensityHeatmap && (
                      <g className="transition-opacity duration-300">
                        {polygons.map((poly) => {
                          if (poly.visible === false) return null;
                          const cx = poly.points.reduce((acc, p) => acc + p.x, 0) / (poly.points.length || 1);
                          const cy = poly.points.reduce((acc, p) => acc + p.y, 0) / (poly.points.length || 1);

                          return (
                            <g key={`heat-group-${poly.id}`}>
                              {/* Centroid Heat Spot */}
                              <circle
                                cx={`${cx}%`}
                                cy={`${cy}%`}
                                r="22%"
                                fill="url(#densityHeatGradient)"
                              />
                              {/* Vertex Heat Spots */}
                              {poly.points.map((pt, ptIdx) => (
                                <circle
                                  key={`heat-pt-${ptIdx}`}
                                  cx={`${pt.x}%`}
                                  cy={`${pt.y}%`}
                                  r="8%"
                                  fill="url(#densityHeatGradient)"
                                  opacity="0.6"
                                />
                              ))}
                            </g>
                          );
                        })}
                      </g>
                    )}

                    {polygons.map((poly) => {
                      if (poly.visible === false) return null;
                      const isLocked = poly.locked === true;
                      const isSelected = selectedPolyId === poly.id;
                      const pointsString = poly.points.map((p) => `${p.x}%,${p.y}%`).join(' ');

                      return (
                        <g key={poly.id} className={isLocked ? 'opacity-80' : ''}>
                          <polygon
                            points={pointsString}
                            fill={`${poly.color}${isSelected ? '66' : '33'}`}
                            stroke={poly.color}
                            strokeWidth={isSelected ? '3' : '2.5'}
                            strokeDasharray={isLocked ? '4 2' : undefined}
                          />
                          {poly.points.map((p, idx) => (
                            <circle
                              key={idx}
                              cx={`${p.x}%`}
                              cy={`${p.y}%`}
                              r={isSelected ? '5' : '3.5'}
                              fill={isLocked ? '#f59e0b' : '#ffffff'}
                              stroke={poly.color}
                              strokeWidth="2"
                            />
                          ))}
                        </g>
                      );
                    })}

                    {/* Active Polygon Draft Line */}
                    {currentDraftPoints.length > 0 && (
                      <g>
                        <polyline
                          points={currentDraftPoints.map((p) => `${p.x}%,${p.y}%`).join(' ')}
                          fill="none"
                          stroke="#14b8a6"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                        {mousePos && (
                          <line
                            x1={`${currentDraftPoints[currentDraftPoints.length - 1].x}%`}
                            y1={`${currentDraftPoints[currentDraftPoints.length - 1].y}%`}
                            x2={`${mousePos.x}%`}
                            y2={`${mousePos.y}%`}
                            stroke="#14b8a6"
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                          />
                        )}
                      </g>
                    )}
                  </svg>

                  {/* Collaborative Peer Cursors Overlay */}
                  {isCollabActive &&
                    peerCursors.map((peer) => (
                      <div
                        key={peer.id}
                        style={{
                          left: `${peer.x}%`,
                          top: `${peer.y}%`,
                        }}
                        className="absolute z-20 pointer-events-none transition-all duration-700 ease-out flex flex-col items-start -translate-x-1 -translate-y-1"
                      >
                        <div className="relative">
                          <svg className="w-5 h-5 filter drop-shadow-md" viewBox="0 0 24 24" fill={peer.color} stroke="#ffffff" strokeWidth="1.5">
                            <path d="M3 3l7 18 3-7 7-3L3 3z" />
                          </svg>

                          <div
                            style={{ backgroundColor: `${peer.color}dd` }}
                            className="ml-3 -mt-2 px-2 py-0.5 rounded-md text-[9px] font-mono text-white font-bold whitespace-nowrap shadow-lg flex items-center gap-1 border border-white/20"
                          >
                            <span>{peer.name}</span>
                            <span className="opacity-80 font-normal hidden sm:inline">({peer.status})</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Floating Viewport Mode Badge */}
                <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5">
                  <div className="bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-slate-300 flex items-center gap-2 backdrop-blur-md shadow-md">
                    <span>MODE:</span>
                    <strong className="text-teal-400 uppercase font-bold">
                      {isPanMode ? 'PAN VIEWPORT' : 'VECTOR ANNOTATION'}
                    </strong>
                  </div>

                  {/* Density Heatmap Active Overlay Banner */}
                  {showDensityHeatmap && (
                    <div className="bg-amber-950/90 border border-amber-600/60 px-3 py-1.5 rounded-lg text-[10px] font-mono text-amber-300 backdrop-blur-md shadow-xl flex items-center gap-2 animate-pulse">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold uppercase tracking-wider">Density Heatmap</span>
                      <div className="flex items-center gap-1 ml-1 text-[9px]">
                        <span className="px-1 bg-teal-500/30 text-teal-300 rounded font-bold">Low</span>
                        <span className="px-1 bg-amber-500/40 text-amber-200 rounded font-bold">Med</span>
                        <span className="px-1 bg-red-600/60 text-red-200 rounded font-bold">QA Risk High</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Floating Zoom & Pan Control Bar */}
                <div className="absolute top-3 right-3 z-30 flex items-center gap-1 bg-slate-950/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 text-xs shadow-xl select-none">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                    disabled={zoomLevel <= 1}
                    className={`p-1.5 rounded-lg transition-colors ${
                      zoomLevel <= 1 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Zoom Out (Key: -)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-1.5 font-mono text-[11px] font-bold text-teal-300 min-w-[42px] text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>

                  <button
                    onClick={() => setZoomLevel((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                    disabled={zoomLevel >= 3}
                    className={`p-1.5 rounded-lg transition-colors ${
                      zoomLevel >= 3 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Zoom In (Key: +)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-px h-4 bg-slate-800 mx-0.5" />

                  <button
                    onClick={() => {
                      setZoomLevel(1);
                      setPanOffset({ x: 0, y: 0 });
                    }}
                    disabled={zoomLevel === 1 && panOffset.x === 0 && panOffset.y === 0}
                    className={`p-1.5 rounded-lg transition-colors ${
                      zoomLevel === 1 && panOffset.x === 0 && panOffset.y === 0
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-amber-400 hover:bg-slate-800'
                    }`}
                    title="Reset Viewport (Key: 0)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setIsPanMode((prev) => !prev)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isPanMode ? 'bg-teal-600 text-white shadow font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                    title="Toggle Pan Viewport Mode"
                  >
                    <Move className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Interactive Navigator (Minimap) Widget */}
                <div className="absolute bottom-3 right-3 z-30 bg-slate-950/90 border border-slate-800 p-1.5 rounded-xl shadow-2xl backdrop-blur-md select-none w-28 space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 px-1">
                    <span className="flex items-center gap-1 font-bold text-slate-300">
                      <Maximize2 className="w-3 h-3 text-teal-400" /> NAVIGATOR
                    </span>
                    <span className="text-teal-300">{Math.round(zoomLevel * 100)}%</span>
                  </div>

                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      const normX = clickX / rect.width - 0.5;
                      const normY = clickY / rect.height - 0.5;
                      setPanOffset({
                        x: Math.round(-normX * 440 * (zoomLevel - 1)),
                        y: Math.round(-normY * 440 * (zoomLevel - 1)),
                      });
                    }}
                    className="relative w-full h-16 rounded-lg overflow-hidden border border-slate-700 cursor-pointer group"
                    title="Click navigator minimap to center viewport"
                  >
                    <img src={currentDemo.imageUrl} alt="minimap" className="w-full h-full object-cover opacity-75" referrerPolicy="no-referrer" />

                    {/* Minimap Viewport Outline Frame */}
                    <div
                      style={{
                        width: `${Math.max(20, Math.min(100, (1 / zoomLevel) * 100))}%`,
                        height: `${Math.max(20, Math.min(100, (1 / zoomLevel) * 100))}%`,
                        left: `${Math.max(0, Math.min(80, 50 - panOffset.x / 4 - 50 / zoomLevel))}%`,
                        top: `${Math.max(0, Math.min(80, 50 - panOffset.y / 4 - 50 / zoomLevel))}%`,
                      }}
                      className="absolute border-2 border-teal-400 bg-teal-500/20 rounded shadow transition-all pointer-events-none"
                    />
                  </div>
                </div>

                {/* Floating Real-World Cursor Latitude / Longitude Display HUD */}
                <div className="absolute bottom-3 left-3 z-30 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 backdrop-blur-md shadow-xl flex items-center gap-2 select-none">
                  <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                    <Globe className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span className="text-teal-400">{crsMetadata.split(' ')[0]}</span>
                  </div>

                  <div className="w-px h-3 bg-slate-800" />

                  {mousePos ? (
                    (() => {
                      const coords = getRealWorldCoords(mousePos.x, mousePos.y);
                      const proj = getProjectedCoords(mousePos.x, mousePos.y);
                      return (
                        <div className="flex items-center gap-2 text-slate-200">
                          <span className="text-emerald-400 font-bold">{coords.formattedLat}</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-emerald-400 font-bold">{coords.formattedLon}</span>
                          <span className="text-slate-400 hidden sm:inline text-[9px]">
                            (E: {proj.eastingMeters}m, N: {proj.northingMeters}m)
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-slate-500 italic">Hover map for Lat/Lon</span>
                  )}
                </div>
              </div>

              {/* SPATIAL MEASUREMENTS & REAL-WORLD ANALYTICS BAR */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-teal-300 font-bold">
                    <Ruler className="w-4 h-4 text-teal-400" />
                    <span>GSD Scale: 0.15 m/px</span>
                  </div>

                  <div className="h-4 w-px bg-slate-800" />

                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Total Area: ~1,420 m²</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {selectedPolyId ? (
                    (() => {
                      const selectedPoly = polygons.find((p) => p.id === selectedPolyId);
                      if (!selectedPoly) return null;
                      const xs = selectedPoly.points.map((p) => p.x);
                      const ys = selectedPoly.points.map((p) => p.y);
                      const wPct = Math.max(...xs) - Math.min(...xs);
                      const hPct = Math.max(...ys) - Math.min(...ys);
                      const wMeters = (wPct * 0.84).toFixed(1);
                      const hMeters = (hPct * 0.84).toFixed(1);
                      const areaSqM = Math.round(wPct * hPct * 0.7056);

                      return (
                        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-[11px]">
                          <span className="text-slate-400">Selected:</span>
                          <span className="text-teal-300 font-bold">{selectedPoly.label}</span>
                          <span className="text-slate-500">
                            ({wMeters}m × {hMeters}m | ~{areaSqM} m²)
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">Select an object to inspect spatial metrics</span>
                  )}
                </div>
              </div>
            </>
            )}

            {/* TASK 2: SEMANTIC SEGMENTATION PAINTING GRID */}
            {activeTaskType === 'semantic_segmentation' && (
              <div className="relative h-[440px] rounded-2xl border-2 border-slate-800 bg-slate-950 overflow-hidden shadow-2xl flex items-center justify-center p-4">
                <img
                  src={currentDemo.imageUrl}
                  alt={currentDemo.name}
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                  referrerPolicy="no-referrer"
                />
                
                {/* 8x8 Tile Painting Grid Overlay */}
                <div className="relative z-10 grid grid-cols-8 gap-1 w-full max-w-[380px] aspect-square bg-slate-950/60 p-2 rounded-xl border border-slate-700/80 backdrop-blur-xs">
                  {Array.from({ length: 8 }).map((_, r) =>
                    Array.from({ length: 8 }).map((_, c) => {
                      const key = `${r}_${c}`;
                      const paintedClass = paintedGrid[key];
                      const isGt = gtSegmentationGrid[key];
                      const cellColor = paintedClass ? CLASS_COLORS[paintedClass] : isGt ? 'rgba(255, 255, 255, 0.15)' : 'transparent';

                      return (
                        <div
                          key={key}
                          onClick={() => handlePaintCell(r, c)}
                          style={{ backgroundColor: cellColor }}
                          className={`rounded border transition-all cursor-pointer flex items-center justify-center text-[9px] font-mono text-white ${
                            paintedClass
                              ? 'border-white/80 shadow'
                              : 'border-slate-700/50 hover:bg-teal-500/30'
                          }`}
                        >
                          {paintedClass ? paintedClass.charAt(0).toUpperCase() : ''}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="absolute bottom-3 left-3 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-mono text-slate-300">
                  PAINT BRUSH: <strong className="text-amber-400 uppercase">{segmentationClass}</strong>
                </div>
              </div>
            )}

            {/* TASK 3: 4x4 GRID CELL CLASSIFICATION */}
            {activeTaskType === 'grid_classification' && (
              <div className="relative h-[440px] rounded-2xl border-2 border-slate-800 bg-slate-950 overflow-hidden shadow-2xl flex items-center justify-center p-4">
                <img
                  src={currentDemo.imageUrl}
                  alt={currentDemo.name}
                  className="absolute inset-0 w-full h-full object-cover opacity-75"
                  referrerPolicy="no-referrer"
                />

                {/* 4x4 Grid Overlay */}
                <div className="relative z-10 grid grid-cols-4 gap-2 w-full h-full p-2">
                  {Array.from({ length: 4 }).map((_, r) =>
                    Array.from({ length: 4 }).map((_, c) => {
                      const cellKey = `cell_${r}_${c}`;
                      const currentVal = userGridLabels[cellKey] || 'Unassigned';

                      return (
                        <div
                          key={cellKey}
                          onClick={() => handleClassifyGridCell(cellKey)}
                          className="bg-slate-950/80 border border-teal-500/40 hover:border-teal-400 rounded-xl p-2 flex flex-col justify-between cursor-pointer transition-all hover:bg-slate-900/90 shadow-md backdrop-blur-xs"
                        >
                          <div className="text-[10px] font-mono text-slate-400">
                            TILE [{r},{c}]
                          </div>
                          <div className="text-xs font-bold text-teal-300 truncate">
                            {currentVal}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 text-right">
                            Click to change
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Panel: Annotation Summary Sidebar & Live Dynamic GeoJSON Output / Scoring */}
          <div className="lg:col-span-3 flex flex-col space-y-4 font-mono text-xs">
            
            {/* RIGHT PANEL TAB SWITCHER */}
            <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded-xl border border-slate-800 font-mono text-xs shadow-md">
              <button
                onClick={() => setRightPanelTab('summary')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  rightPanelTab === 'summary'
                    ? 'bg-teal-950 text-teal-300 border border-teal-600/80 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <PieChart className="w-3.5 h-3.5 text-teal-400" />
                <span>Summary Sidebar</span>
              </button>

              <button
                onClick={() => setRightPanelTab('deliverable')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  rightPanelTab === 'deliverable'
                    ? 'bg-teal-950 text-teal-300 border border-teal-600/80 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileJson className="w-3.5 h-3.5 text-teal-400" />
                <span>Payload & Score</span>
              </button>
            </div>

            {/* TAB 1: ANNOTATION SUMMARY SIDEBAR */}
            {rightPanelTab === 'summary' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-4 shadow-xl">
                {/* Header & Quick Action */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                    <span className="font-bold text-white text-[12px] uppercase tracking-wider">
                      Annotation Summary
                    </span>
                  </div>

                  <button
                    onClick={handleSuggestAiAnnotations}
                    disabled={isSuggestingAi}
                    className="px-2 py-1 bg-amber-950/90 hover:bg-amber-900 text-amber-300 border border-amber-700/80 rounded flex items-center gap-1 text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                    title="Suggest AI predicted shapes for this tile"
                  >
                    {isSuggestingAi ? (
                      <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-amber-400" />
                    )}
                    <span>Suggest AI</span>
                  </button>
                </div>

                {/* Overall Tile Real-Time Metrics Cards Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Total Area Labeled */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Ruler className="w-3 h-3 text-teal-400" />
                      <span>Labeled Area</span>
                    </div>
                    <div className="text-xs font-bold text-white font-mono truncate">
                      {annotationStats.totalLabeledAreaMeters.toLocaleString()} <span className="text-[9px] text-slate-400">m²</span>
                    </div>
                    <div className="text-[10px] text-teal-300 font-bold font-mono">
                      {annotationStats.totalLabeledPercentTile}% of tile
                    </div>
                  </div>

                  {/* Object Count */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-400" />
                      <span>Object Count</span>
                    </div>
                    <div className="text-xs font-bold text-white font-mono">
                      {annotationStats.totalObjectCount} <span className="text-[9px] text-slate-400">objs</span>
                    </div>
                    <div className="text-[10px] text-purple-300 font-bold font-mono">
                      {annotationStats.totalAiCount} AI predicted
                    </div>
                  </div>
                </div>

                {/* Tile Coverage Progress Bar */}
                <div className="space-y-1.5 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-bold">Total Tile Coverage</span>
                    <span className="text-teal-400 font-bold font-mono">{annotationStats.totalLabeledPercentTile}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 via-emerald-400 to-amber-400 transition-all duration-500"
                      style={{ width: `${annotationStats.totalLabeledPercentTile}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>0 m²</span>
                    <span>Tile Extent: {annotationStats.totalTileAreaMeters.toLocaleString()} m²</span>
                  </div>
                </div>

                {/* Class Breakdown List with Real-Time Statistics */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-800/60 pb-1">
                    <span>Object Count per Class</span>
                    <span>% Tile Covered</span>
                  </div>

                  {annotationStats.classStatsList.length > 0 ? (
                    <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
                      {annotationStats.classStatsList.map((cs) => {
                        const isFiltered = summaryClassFilter === cs.label;

                        return (
                          <div
                            key={cs.label}
                            onClick={() => setSummaryClassFilter(isFiltered ? null : cs.label)}
                            className={`p-2 rounded-lg border transition-all cursor-pointer space-y-1.5 ${
                              isFiltered
                                ? 'bg-teal-950/90 border-teal-500 text-white shadow-md'
                                : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cs.color }} />
                                <span className="font-bold truncate max-w-[120px]">{cs.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-bold">
                                  {cs.count} {cs.count === 1 ? 'obj' : 'objs'}
                                </span>
                                <span className="text-teal-300 font-bold">
                                  {cs.percentTile.toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            {/* Progress Bar per Class */}
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, cs.percentTile)}%`, backgroundColor: cs.color }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono pt-0.5">
                              <span>Area: {cs.areaMeters.toLocaleString()} m²</span>
                              {cs.aiCount > 0 && <span className="text-purple-400 font-bold">{cs.aiCount} AI</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center bg-slate-950 border border-slate-850 rounded-lg text-slate-500 text-[11px] space-y-1">
                      <Tag className="w-5 h-5 mx-auto text-slate-600" />
                      <p>No objects labeled yet.</p>
                      <p className="text-[10px] text-slate-600">Draw shapes or click 'Suggest AI' to start.</p>
                    </div>
                  )}
                </div>

                {/* AI & QA Audit Health Card */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-bold flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>AI Confidence Avg</span>
                    </span>
                    <span className="text-emerald-400 font-bold font-mono">{annotationStats.avgConfidence}%</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 text-[10px]">Tile QA Audit Status:</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      VERIFIED & READY
                    </span>
                  </div>
                </div>

                {/* Quick Action to Run Scoring */}
                <button
                  onClick={handleRunScoringEngine}
                  disabled={isScoringRunning}
                  className="w-full py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Submit for Senior Audit Scoring</span>
                </button>
              </div>
            )}

            {/* TAB 2: DELIVERABLE PAYLOAD & LIVE SCORING REPORT */}
            {rightPanelTab === 'deliverable' && (
              <>
                {/* DELIVERABLE PAYLOAD HEADER & FORMAT SELECTOR */}
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FileJson className="w-4 h-4 text-teal-400" />
                      <span className="font-bold text-white text-[11px]">Deliverable Payload</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyGeoJson}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded border border-slate-700 transition-colors flex items-center gap-1 text-[10px]"
                        title="Copy Payload to Clipboard"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">Copy</span>
                      </button>

                      <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="px-2 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded font-bold transition-all flex items-center gap-1 text-[10px] shadow-md border border-teal-400"
                        title="Open Export Sample Options"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Sample</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Format Picker */}
                  <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-800/80 text-[9px] font-bold">
                    <button
                      onClick={() => setExportFormat('geojson')}
                      className={`py-1 rounded text-center transition-colors ${
                        exportFormat === 'geojson' ? 'bg-teal-900/90 text-teal-300 border border-teal-500' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      GeoJSON
                    </button>
                    <button
                      onClick={() => setExportFormat('coco')}
                      className={`py-1 rounded text-center transition-colors ${
                        exportFormat === 'coco' ? 'bg-teal-900/90 text-teal-300 border border-teal-500' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      COCO
                    </button>
                    <button
                      onClick={() => setExportFormat('yolo')}
                      className={`py-1 rounded text-center transition-colors ${
                        exportFormat === 'yolo' ? 'bg-teal-900/90 text-teal-300 border border-teal-500' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      YOLO
                    </button>
                    <button
                      onClick={() => setExportFormat('csv')}
                      className={`py-1 rounded text-center transition-colors ${
                        exportFormat === 'csv' ? 'bg-teal-900/90 text-teal-300 border border-teal-500' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      CSV
                    </button>
                  </div>
                </div>

                {/* Dynamic Output Preview Window */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-[180px] overflow-auto text-[10px] text-teal-300 leading-relaxed relative group">
                  <pre>
                    {exportFormat === 'geojson'
                      ? generateDynamicGeoJson()
                      : exportFormat === 'coco'
                      ? generateCOCOJson()
                      : exportFormat === 'csv'
                      ? generateCsvExport()
                      : generateYoloExport()}
                  </pre>

                  <button
                    onClick={() => handleDownloadSampleFile(exportFormat)}
                    className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-900/90 hover:bg-teal-950 text-teal-300 border border-teal-800 rounded text-[9px] font-mono flex items-center gap-1 backdrop-blur-xs opacity-90 hover:opacity-100 transition-opacity"
                  >
                    <Download className="w-3 h-3 text-teal-400" />
                    <span>Download .{exportFormat === 'csv' ? 'csv' : exportFormat === 'yolo' ? 'txt' : 'json'}</span>
                  </button>
                </div>

                {/* Download Notification Banner */}
                {downloadSuccessMessage && (
                  <div className="p-2.5 bg-emerald-950/90 border border-emerald-700 rounded-xl text-[10px] text-emerald-300 font-mono flex items-center gap-2 animate-fade-in shadow-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{downloadSuccessMessage}</span>
                  </div>
                )}

                {/* LIVE SCORING ENGINE REPORT PANEL */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      <span>Scoring Engine Verdict</span>
                    </span>
                    <span className="text-[10px] text-slate-400">SLA RULESET v3.4</span>
                  </div>

                  {scoringResult ? (
                    <div className="space-y-3">
                      {/* Verdict Banner */}
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between font-bold ${
                          scoringResult.verdict === 'PASS'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                            : scoringResult.verdict === 'ESCALATE'
                            ? 'bg-amber-950 text-amber-300 border-amber-700'
                            : 'bg-rose-950 text-rose-300 border-rose-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {scoringResult.verdict === 'PASS' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                          {scoringResult.verdict === 'ESCALATE' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                          {scoringResult.verdict === 'FAIL' && <XCircle className="w-5 h-5 text-rose-400" />}
                          <div>
                            <div className="text-sm">{scoringResult.verdict} VERDICT</div>
                            <div className="text-[10px] opacity-80 font-mono">
                              Score: {scoringResult.overallScorePct}% Match
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Metrics Breakdown */}
                      <div className="space-y-1.5 text-[11px]">
                        {scoringResult.metricsBreakdown.map((m, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-850">
                            <span className="text-slate-400">{m.label}</span>
                            <span className={`font-bold font-mono ${
                              m.status === 'good' ? 'text-emerald-400' : m.status === 'warn' ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                              {m.value}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Feedback Notes */}
                      <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[10px] text-slate-300 space-y-1">
                        {scoringResult.feedbackNotes.map((note, i) => (
                          <div key={i}>• {note}</div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-500 text-[11px] space-y-2">
                      <HelpCircle className="w-6 h-6 text-slate-600 mx-auto" />
                      <p>Hit "Submit for Live Scoring" to test your annotations against senior ground-truth.</p>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>

        </div>

      </div>

      {/* EXPORT SAMPLE COMPATIBILITY MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative font-sans text-slate-200">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-950 border border-teal-800 text-teal-300 text-[11px] font-mono">
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>ML PIPELINE COMPATIBILITY EXPORT</span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Export Sample Annotations
                </h3>
                <p className="text-xs text-slate-400">
                  Verify payload structure & test data ingestion against PyTorch, TensorFlow, YOLO, or GIS software.
                </p>
              </div>

              <button
                onClick={() => setIsExportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Format Selection Cards */}
            <div className="space-y-3">
              <label className="text-xs font-mono font-bold text-slate-300 block uppercase tracking-wider">
                1. Select Export Format Standard
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                {[
                  {
                    id: 'geojson',
                    name: 'OGC GeoJSON (.geojson)',
                    desc: 'Standard RFC 7946 geospatial feature collection with WGS84 bounding coordinates.',
                    badge: 'QGIS / ArcGIS / STAC',
                    icon: FileJson,
                  },
                  {
                    id: 'coco',
                    name: 'MS COCO Dataset (.json)',
                    desc: 'Object detection format with image metadata, categories, bounding boxes, and RLE mask polygons.',
                    badge: 'PyTorch / Detectron2',
                    icon: FileCode,
                  },
                  {
                    id: 'yolo',
                    name: 'Ultralytics YOLO (.txt)',
                    desc: 'Normalized center bounding boxes [class_id cx cy w h] formatted for real-time model training.',
                    badge: 'YOLOv8 / YOLOv11',
                    icon: Layers,
                  },
                  {
                    id: 'csv',
                    name: 'Spatial Attribute Table (.csv)',
                    desc: 'Tabular dataset containing WKT (Well-Known Text) geometry polygons and attribute keys.',
                    badge: 'PostGIS / Snowflake',
                    icon: FileSpreadsheet,
                  },
                ].map((fmt) => {
                  const IconComp = fmt.icon;
                  const isSelected = exportFormat === fmt.id;
                  return (
                    <div
                      key={fmt.id}
                      onClick={() => setExportFormat(fmt.id as any)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-teal-950/70 border-teal-500 text-white shadow-lg ring-1 ring-teal-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-bold text-teal-300">
                            <IconComp className="w-4 h-4 text-teal-400" />
                            <span>{fmt.name}</span>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                          {fmt.desc}
                        </p>
                      </div>

                      <div className="mt-2 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-teal-400 border border-slate-800 w-fit">
                        {fmt.badge}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pipeline Compatibility Badges */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Ingestion Pipeline Validation:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> 100% Schema Validated
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">PyTorch DataLoaders</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">TensorFlow Dataset API</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">Esri ArcGIS Pro 3.x</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">QGIS 3.x GIS Vectors</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">Roboflow / FiftyOne</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={handleCopyGeoJson}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-mono text-xs transition-colors flex items-center gap-2 border border-slate-700"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>Copy Payload</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white font-mono text-xs transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    handleDownloadSampleFile(exportFormat);
                    setIsExportModalOpen(false);
                  }}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold font-mono text-xs transition-all flex items-center gap-2 shadow-lg border border-teal-400"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Sample Payload</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* BATCH TASK QUEUE SUMMARY VIEW & QA PIPELINE MODAL */}
      {isBatchQueueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 font-mono max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-teal-400" />
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Batch Task Queue Summary</h3>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Monitor validation progress, trigger automated batch QA pipelines, and manage queued satellite tiles.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsBatchQueueModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* KPI Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Total Batch Tiles</span>
                <div className="text-xl font-bold text-white">{batchQueue.length}</div>
                <span className="text-[9px] text-slate-500">Active Queue Scope</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-emerald-900/50 space-y-1">
                <span className="text-[10px] text-emerald-400 uppercase font-bold">Completed & QA'd</span>
                <div className="text-xl font-bold text-emerald-300">
                  {batchQueue.filter((b) => b.status === 'completed').length}
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{
                      width: `${(batchQueue.filter((b) => b.status === 'completed').length / (batchQueue.length || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-amber-900/50 space-y-1">
                <span className="text-[10px] text-amber-400 uppercase font-bold">In-Progress</span>
                <div className="text-xl font-bold text-amber-300">
                  {batchQueue.filter((b) => b.status === 'in_progress').length}
                </div>
                <span className="text-[9px] text-slate-500">Active Annotators</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Pending / Queued</span>
                <div className="text-xl font-bold text-slate-300">
                  {batchQueue.filter((b) => b.status === 'queued').length}
                </div>
                <span className="text-[9px] text-slate-500">Awaiting Inspection</span>
              </div>
            </div>

            {/* Automation Pipeline Action Bar */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Wand2 className="w-4 h-4 text-teal-400" />
                    <span>Automated Batch QA Pipeline</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Run automated polygon overlap detection, GSD verification, and CRS spatial indexing across all queued tiles.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAddTileFormOpen((prev) => !prev)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-400" />
                    <span>Add Tile</span>
                  </button>

                  <button
                    onClick={handleRunBatchPipeline}
                    disabled={isBatchPipelineRunning}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border shadow cursor-pointer ${
                      isBatchPipelineRunning
                        ? 'bg-amber-950 border-amber-700 text-amber-300 cursor-not-allowed'
                        : 'bg-teal-600 hover:bg-teal-500 text-white border-teal-400'
                    }`}
                  >
                    {isBatchPipelineRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Running QA Pipeline ({batchPipelineProgress}/{batchQueue.length})...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Run Automated Batch QA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Add Custom Tile Form */}
              {isAddTileFormOpen && (
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-3 pt-3 animate-fade-in">
                  <span className="text-[11px] font-bold text-teal-300 block uppercase tracking-wider">
                    Register New Satellite Tile in Queue
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <input
                      type="text"
                      placeholder="Tile Name (e.g., Dubai Palm Jumeirah)"
                      value={newTileName}
                      onChange={(e) => setNewTileName(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500 font-sans"
                    />
                    <input
                      type="text"
                      placeholder="Location (e.g., Dubai, UAE)"
                      value={newTileLocation}
                      onChange={(e) => setNewTileLocation(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500 font-sans"
                    />
                  </div>
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      onClick={() => setIsAddTileFormOpen(false)}
                      className="px-3 py-1 text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddTileToQueue}
                      className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded font-bold"
                    >
                      Enqueue Tile
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filter Tabs & Queue Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  {(['all', 'completed', 'in_progress', 'queued'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setBatchFilterStatus(st)}
                      className={`px-3 py-1 rounded-lg transition-colors capitalize ${
                        batchFilterStatus === st
                          ? 'bg-slate-800 text-teal-300 border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st === 'all' ? `All (${batchQueue.length})` : st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">EPSG:3857 WGS 84 / Pseudo-Mercator</span>
              </div>

              {/* Tile Cards List */}
              <div className="space-y-2 text-xs">
                {batchQueue
                  .filter((item) => (batchFilterStatus === 'all' ? true : item.status === batchFilterStatus))
                  .map((item) => {
                    const isSelected = selectedDemoIndex === item.demoIndex;
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? 'bg-slate-950 border-teal-500 shadow-md ring-1 ring-teal-500/40'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-teal-400">
                            #{item.id.replace('batch-', '')}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{item.name}</span>
                              {isSelected && (
                                <span className="text-[9px] px-1.5 py-0.2 bg-teal-950 text-teal-300 border border-teal-800 rounded font-bold">
                                  ACTIVE CANVAS
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-sans">{item.location}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 font-mono text-[11px]">
                          {/* Interactive Status Selector */}
                          <select
                            value={item.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as any;
                              setBatchQueue((prev) =>
                                prev.map((b) => (b.id === item.id ? { ...b, status: newStatus } : b))
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg border font-bold text-[10px] focus:outline-none cursor-pointer ${
                              item.status === 'completed'
                                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                                : item.status === 'in_progress'
                                ? 'bg-amber-950/80 border-amber-800 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            <option value="queued">Pending / Queued</option>
                            <option value="in_progress">In-Progress</option>
                            <option value="completed">Completed / Validated</option>
                          </select>

                          <span className="text-slate-400 hidden sm:inline">
                            {item.polygonsCount} Objects
                          </span>

                          <button
                            onClick={() => {
                              handleSelectDemo(item.demoIndex);
                              setIsBatchQueueModalOpen(false);
                            }}
                            className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            Load Tile
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                Batch Queue Persistent Storage Status: <strong className="text-emerald-400">Synced to Local Cache</strong>
              </span>

              <button
                onClick={() => setIsBatchQueueModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Close Queue Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS CHEATSHEET MODAL */}
      {isShortcutsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-teal-400" />
                <h3 className="text-lg font-bold text-white">Keyboard Shortcuts Cheatsheet</h3>
              </div>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { key: 'U', desc: 'Undo last vector edit' },
                { key: 'R', desc: 'Redo previously undone edit' },
                { key: 'H', desc: 'Toggle Density Heatmap Overlay' },
                { key: 'Q', desc: 'Open Batch Task Queue Summary' },
                { key: 'O', desc: 'Toggle Ortho Snapping constraint' },
                { key: 'L', desc: 'Lock / unlock selected layer' },
                { key: 'V', desc: 'Toggle visibility of selected layer' },
                { key: 'P', desc: 'Activate Polygon Vector tool' },
                { key: 'B', desc: 'Activate BBox / OBB tool' },
                { key: 'S', desc: 'Submit for live QA scoring' },
                { key: 'E', desc: 'Open export sample modal' },
                { key: '+ / -', desc: 'Zoom in / Zoom out viewport' },
                { key: '0', desc: 'Reset zoom level & pan offset' },
                { key: 'K or ?', desc: 'Toggle shortcuts guide' },
                { key: 'Ctrl + Z', desc: 'Standard Undo action' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-300 font-sans">{item.desc}</span>
                  <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-teal-300 font-bold rounded text-[11px]">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
