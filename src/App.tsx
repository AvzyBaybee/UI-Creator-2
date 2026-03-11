import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer, Text, Group, Path, Line, Circle } from 'react-konva';
import { TileData, Tool, CanvasElement, GroupData, ColorTileData } from './types';
import { TOOLTIPS } from './tooltips';
import { Trash2, MousePointer2, Square, Eye, EyeOff, FolderPlus, Hand, ZoomIn, Settings, Palette, Maximize2, Layout, X, Grid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { INITIAL_ELEMENTS, STORAGE_KEY, DEFAULT_SETTINGS } from './constants';
import { rgbToOklch, oklchToHex, getThemeColor, getColorHex, interpolateHexColor, hexToRgba } from './utils/color';
import { getSplinePoints, closestPointOnSegment, distSq } from './utils/math';

import { CursorTooltip } from './components/CursorTooltip';
import { PropertyRow } from './components/PropertyRow';
import { ColorRow } from './components/ColorRow';
import { TileNameInput } from './components/TileNameInput';
import { ColorPicker2D } from './components/ColorPicker2D';
import { ToolButton } from './components/ToolButton';
import { ElementsPanel } from './components/ElementsPanel';

export default function App() {
  const [elements, setElements] = useState<CanvasElement[]>(INITIAL_ELEMENTS);
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  const [history, setHistory] = useState<CanvasElement[][]>([INITIAL_ELEMENTS]);
  const [historyIndex, setHistoryIndex] = useState(0); 
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  const [clipboard, setClipboard] = useState<CanvasElement[]>([]);
  const clipboardRef = useRef(clipboard);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  const [tool, setTool] = useState<Tool>('select');
  const prevToolRef = useRef<Tool>('select'); const activeTransientKey = useRef<string | null>(null);
  const keyPressTime = useRef<number>(0); const [tooltip, setTooltip] = useState({ text: '', visible: false });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, worldX: number, worldY: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);
  const [interactingId, setInteractingId] = useState<string | null>(null); const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY); return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }, [settings]);
  const updateSetting = (key: keyof typeof DEFAULT_SETTINGS, val: any) => setSettings(prev => ({ ...prev, [key]: val }));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); const [isGridSettingsOpen, setIsGridSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'canvas' | 'tiles' | 'visuals'>('canvas');
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1); const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingGroup, setIsDrawingGroup] = useState(false); const [isSelecting, setIsSelecting] = useState(false);
  const [isZooming, setIsZooming] = useState(false); const [drawingCable, setDrawingCable] = useState<any>(null);
  const [hoveredCable, setHoveredCable] = useState<any>(null); const [draggingClip, setDraggingClip] = useState<any>(null);
  const [selectionStart, setSelectionStart] = useState<any>(null); const [selectionRect, setSelectionRect] = useState<any>(null);
  const [newTileStart, setNewTileStart] = useState<any>(null); const [currentDrawingTile, setCurrentDrawingTile] = useState<any>(null);
  const [currentDrawingGroup, setCurrentDrawingGroup] = useState<any>(null); const [transformingTile, setTransformingTile] = useState<any>(null);
  const zoomStartRef = useRef<any>(null); const lastHueRef = useRef<number>(Math.floor(Math.random() * 360));
  const stageRef = useRef<any>(null); const trRef = useRef<any>(null); const [patternImage, setPatternImage] = useState<any>(null);
  const [gridPatternImage, setGridPatternImage] = useState<any>(null);
  const [tileHeights, setTileHeights] = useState<Record<string, number>>({});
  const tileHeightsRef = useRef(tileHeights); useEffect(() => { tileHeightsRef.current = tileHeights; }, [tileHeights]);
  const resizeObservers = useRef<any>({});
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [snapTarget, setSnapTarget] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: settings.toolbarX, y: settings.toolbarY });
  useEffect(() => { setToolbarPos({ x: settings.toolbarX, y: settings.toolbarY }); }, [settings.toolbarX, settings.toolbarY]);

  const showTooltip = (text: string) => setTooltip({ text, visible: true });
  const hideTooltip = () => setTooltip({ text: '', visible: false });

  const getDistinctColor = useCallback(() => {
    const currentOklchs = elementsRef.current.map(el => {
      if (el.type === 'color') return rgbToOklch(getColorHex(el));
      return rgbToOklch((el as any).highlightColor || '#3b82f6');
    });

    let bestColor = { l: 0.7, c: 0.15, h: Math.random() * 360 };
    let maxMinDist = -1;

    for (let i = 0; i < 30; i++) {
      const l = 0.4 + Math.random() * 0.5; 
      const c = 0.05 + Math.random() * 0.25; 
      const h = Math.random() * 360;
      const candidate = { l, c, h };

      let minDist = 1000;
      currentOklchs.forEach(occ => {
        const dl = (candidate.l - occ.l) * 2; 
        const dc = (candidate.c - occ.c) * 2;
        const dh = Math.min(Math.abs(candidate.h - occ.h), 360 - Math.abs(candidate.h - occ.h)) / 180;
        const d = Math.sqrt(dl * dl + dc * dc + dh * dh);
        if (d < minDist) minDist = d;
      });

      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestColor = candidate;
      }
    }

    return oklchToHex(bestColor.l, bestColor.c, bestColor.h);
  }, []);

  const onTileRef = useCallback((el: HTMLDivElement | null, id: string) => {
    if (el) {
      if (!resizeObservers.current[id]) {
        const ro = new ResizeObserver(entries => { const h = (entries[0].target as HTMLElement).offsetHeight; setTileHeights(prev => prev[id] === h ? prev : { ...prev, [id]: h }); });
        ro.observe(el); resizeObservers.current[id] = ro;
      }
    } else if (resizeObservers.current[id]) { resizeObservers.current[id].disconnect(); delete resizeObservers.current[id]; }
  }, []);

  useEffect(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 40; const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 40, 40); ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, 20, 20); ctx.fillRect(20, 20, 20, 20);
      const img = new Image(); img.src = canvas.toDataURL(); img.onload = () => setPatternImage(img);
    }
  }, []);

  useEffect(() => {
    if (!settings.showGrid) return;
    const canvas = document.createElement('canvas');
    canvas.width = settings.gridSize;
    canvas.height = settings.gridSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = hexToRgba(settings.gridColor, settings.gridOpacity);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(settings.gridSize, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, settings.gridSize);
      ctx.stroke();
      const img = new Image();
      img.src = canvas.toDataURL();
      img.onload = () => setGridPatternImage(img);
    }
  }, [settings.showGrid, settings.gridSize, settings.gridColor, settings.gridOpacity]);

  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  const pushToHistory = useCallback((newElements: CanvasElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1); newHistory.push(newElements);
    setHistory(newHistory); setHistoryIndex(newHistory.length - 1); setElements(newElements);
  }, [history, historyIndex]);

  const undo = useCallback(() => { if (historyIndex > 0) { const p = historyIndex - 1; setHistoryIndex(p); setElements(history[p]); setSelectedIds([]); } }, [history, historyIndex]);
  const redo = useCallback(() => { if (historyIndex < history.length - 1) { const n = historyIndex + 1; setHistoryIndex(n); setElements(history[n]); setSelectedIds([]); } }, [history, historyIndex]);
  const handleDeleteMultiple = useCallback((ids: string[]) => { const newElements = elementsRef.current.filter(el => !ids.includes(el.id) && (!el.parentId || !ids.includes(el.parentId))); pushToHistory(newElements); setSelectedIds([]); }, [pushToHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) setIsShiftPressed(true);
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true') return;
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIdsRef.current.length > 0) handleDeleteMultiple(selectedIdsRef.current);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') redo();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') setClipboard(elementsRef.current.filter(el => selectedIdsRef.current.includes(el.id)));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardRef.current.length > 0) {
        const newElements = clipboardRef.current.map(el => ({ ...el, id: `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, tileX: el.tileX + 40, tileY: el.tileY + 40 }));
        pushToHistory([...elementsRef.current, ...newElements]); setSelectedIds(newElements.map(el => el.id));
      }
      if (e.repeat) return;
      let m: Tool | null = null;
      if (e.code === 'Space' || e.key.toLowerCase() === 'h') m = 'hand'; else if (e.key.toLowerCase() === 'v') m = 'select';
      else if (e.key.toLowerCase() === 'r') m = 'tile'; else if (e.key.toLowerCase() === 'g') m = 'group'; else if (e.key.toLowerCase() === 'z') m = 'zoom';
      if (m && !activeTransientKey.current) { prevToolRef.current = tool; activeTransientKey.current = e.code; keyPressTime.current = Date.now(); setTool(m); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) setIsShiftPressed(false);
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true') return;
      if (e.code === activeTransientKey.current || (e.code === 'Space' && activeTransientKey.current === 'Space')) {
        if (Date.now() - keyPressTime.current >= 200) setTool(prevToolRef.current);
        activeTransientKey.current = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [undo, redo, tool, pushToHistory, handleDeleteMultiple]);

  useEffect(() => {
    if (trRef.current && selectedIds.length > 0) {
      const nodes = selectedIds.map(id => stageRef.current.findOne('#' + id)).filter(Boolean);
      trRef.current.nodes(nodes); trRef.current.getLayer().batchDraw();
    } else if (trRef.current) trRef.current.nodes([]);
  }, [selectedIds, elements]);

  const transformPoint = (pos: { x: number, y: number }) => ({ x: (pos.x - stagePos.x) / stageScale, y: (pos.y - stagePos.y) / stageScale });

  const handleStagePointerDown = (e: any) => {
    const stage = e.target.getStage(); const pos = stage.getPointerPosition(); const worldPos = transformPoint(pos);
    const roundedWorldPos = { x: Math.round(worldPos.x), y: Math.round(worldPos.y) };

    if (isSettingsOpen) setIsSettingsOpen(false);
    if (isGridSettingsOpen) setIsGridSettingsOpen(false);
    if (e.evt.button !== 0) return;

    const isBackground = e.target === stage || e.target.name() === 'bg-rect' || e.target.name() === 'grid-rect';

    if (tool === 'zoom') { setIsZooming(true); zoomStartRef.current = { clientX: e.evt.clientX, scale: stageScale, mousePointTo: worldPos }; }
    else if (tool === 'tile' && isBackground) {
      setIsDrawing(true); setNewTileStart(roundedWorldPos);
      setCurrentDrawingTile({ id: `tile-temp`, name: '', type: 'tile', x: roundedWorldPos.x, y: roundedWorldPos.y, width: 0, height: 0, tileX: roundedWorldPos.x, tileY: roundedWorldPos.y, fill: '#808080', stroke: 'transparent', strokeWidth: 0, visible: true, depth: elements.length + 1, cornerRadius: 0, highlightColor: '#3b82f6' });
    } else if (tool === 'group' && isBackground) {
      setIsDrawingGroup(true); setNewTileStart(roundedWorldPos);
      setCurrentDrawingGroup({ id: `group-temp`, name: '', type: 'group', tileX: roundedWorldPos.x, tileY: roundedWorldPos.y, tileWidth: 0, tileHeight: 0, color: '#3b82f6', opacity: 1, expanded: true, visible: true, depth: elements.length + 1 });
    } else if (tool === 'select' && isBackground) { setIsSelecting(true); setSelectionStart(roundedWorldPos); setSelectionRect({ x: roundedWorldPos.x, y: roundedWorldPos.y, width: 0, height: 0 }); setSelectedIds([]); }
  };

  const handleStagePointerMove = (e: any) => {
    const stage = e.target.getStage(); const pos = stage.getPointerPosition(); const worldPos = transformPoint(pos);
    const roundedWorldPos = { x: Math.round(worldPos.x), y: Math.round(worldPos.y) };
    if (drawingCable) setDrawingCable({ ...drawingCable, currentX: worldPos.x, currentY: worldPos.y });
    if (draggingClip) {
      const tile = elements.find(el => el.id === draggingClip.tileId) as TileData;
      if (tile) { const newClips = [...(tile.cableClips || [])]; newClips[draggingClip.clipIndex] = { ...newClips[draggingClip.clipIndex], x: worldPos.x, y: worldPos.y }; handleUpdate(tile.id, { cableClips: newClips }); }
    }
    if (isZooming && zoomStartRef.current) {
      const dx = e.evt.clientX - zoomStartRef.current.clientX; const newScale = Math.max(0.1, Math.min(zoomStartRef.current.scale * (1 + dx * 0.01), 5));
      setStageScale(newScale); setStagePos({ x: pos.x - zoomStartRef.current.mousePointTo.x * newScale, y: pos.y - zoomStartRef.current.mousePointTo.y * newScale });
    } else if (isDrawing && newTileStart && currentDrawingTile) {
      let nx = roundedWorldPos.x; let ny = roundedWorldPos.y;
      if (e.evt.shiftKey && settings.gridSize > 0) {
        nx = Math.round(nx / settings.gridSize) * settings.gridSize;
        ny = Math.round(ny / settings.gridSize) * settings.gridSize;
      }
      setCurrentDrawingTile({ ...currentDrawingTile, x: Math.min(newTileStart.x, nx), y: Math.min(newTileStart.y, ny), width: Math.max(1, Math.abs(nx - newTileStart.x)), height: Math.max(1, Math.abs(ny - newTileStart.y)) });
    } else if (isDrawingGroup && newTileStart && currentDrawingGroup) {
      let nx = roundedWorldPos.x; let ny = roundedWorldPos.y;
      if (e.evt.shiftKey && settings.gridSize > 0) {
        nx = Math.round(nx / settings.gridSize) * settings.gridSize;
        ny = Math.round(ny / settings.gridSize) * settings.gridSize;
      }
      setCurrentDrawingGroup({ ...currentDrawingGroup, tileX: Math.min(newTileStart.x, nx), tileY: Math.min(newTileStart.y, ny), tileWidth: Math.max(1, Math.abs(nx - newTileStart.x)), tileHeight: Math.max(1, Math.abs(ny - newTileStart.y)) });
    }
    else if (isSelecting && selectionStart) setSelectionRect({ x: Math.min(selectionStart.x, roundedWorldPos.x), y: Math.min(selectionStart.y, roundedWorldPos.y), width: Math.abs(roundedWorldPos.x - selectionStart.x), height: Math.abs(roundedWorldPos.y - selectionStart.y) });
  };

  const handleStagePointerUp = () => {
    if (drawingCable) setDrawingCable(null); if (draggingClip) { pushToHistory(elementsRef.current); setDraggingClip(null); }
    if (isZooming) { setIsZooming(false); zoomStartRef.current = null; }
    else if (isDrawing && currentDrawingTile) {
      if (currentDrawingTile.width > 5 && currentDrawingTile.height > 5) {
        const finalTile = { ...currentDrawingTile, id: `tile-${Date.now()}`, name: `Rectangle ${elements.length + 1}`, highlightColor: getDistinctColor(), tileX: currentDrawingTile.x + currentDrawingTile.width + 40, tileY: currentDrawingTile.y };
        pushToHistory([...elements, finalTile]); setSelectedIds([finalTile.id]);
      }
      setIsDrawing(false); setNewTileStart(null); setCurrentDrawingTile(null);
    } else if (isDrawingGroup && currentDrawingGroup) {
      if (currentDrawingGroup.tileWidth > 5 && currentDrawingGroup.tileHeight > 5) {
        const finalGroup = { ...currentDrawingGroup, id: `group-${Date.now()}`, name: `Group ${elements.length + 1}`, color: getDistinctColor() };
        pushToHistory([...elements, finalGroup]); setSelectedIds([finalGroup.id]);
      }
      setIsDrawingGroup(false); setNewTileStart(null); setCurrentDrawingGroup(null);
    } else if (isSelecting && selectionRect) {
      const intersect = (r1: any, r2: any) => r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
      const s = elements.filter(el => {
        if (el.visible === false) return false;
        if (el.type === 'group') {
          return intersect({ x: el.tileX, y: el.tileY, width: el.tileWidth, height: el.tileHeight }, selectionRect);
        } else {
          const tw = (el.type === 'color' ? settings.colorTileWidth : settings.tileWidth) * settings.uiScale;
          const th = (tileHeightsRef.current[el.id] || 200) * settings.uiScale;
          return intersect({ x: el.tileX, y: el.tileY, width: tw, height: th }, selectionRect);
        }
      }).map(el => el.id);
      setSelectedIds(s); setIsSelecting(false); setSelectionStart(null); setSelectionRect(null);
    }
  };

  const handleUpdate = (id: string, updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } as any : el));
  };

  const handleUpdateEnd = (id: string, updates: Partial<CanvasElement>) => {
    const newElements = elementsRef.current.map(el => {
        if (el.id === id) {
            let final = { ...el, ...updates } as any;
            if (final.depth !== undefined) final.depth = Math.min(999999, Math.max(0, final.depth));
            return final;
        }
        return el;
    });
    pushToHistory(newElements);
  };

  const handleBulkUpdateEnd = (ids: string[], updates: Partial<CanvasElement>) => {
    const newElements = elementsRef.current.map(el => {
        if (ids.includes(el.id)) {
            let final = { ...el, ...updates } as any;
            if (final.depth !== undefined) final.depth = Math.min(999999, Math.max(0, final.depth));
            return final;
        }
        return el;
    });
    pushToHistory(newElements);
  };

  const handleBulkRelativeUpdate = (ids: string[], updater: (el: CanvasElement) => Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => ids.includes(el.id) ? { ...el, ...updater(el) } as any : el));
  };

  const handleTilePointerDown = (e: React.PointerEvent, el: CanvasElement, forceDrag: boolean = false) => {
    if (!forceDrag && (tool === 'hand' || tool === 'zoom')) return;
    e.stopPropagation();
    let cur = selectedIdsRef.current;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (cur.includes(el.id)) cur = cur.filter(id => id !== el.id); else cur = [...cur, el.id]; setSelectedIds(cur); }
    else if (!cur.includes(el.id)) { cur = [el.id]; setSelectedIds(cur); }
    const startX = e.clientX; const startY = e.clientY;
    const startPositions = elementsRef.current.filter(c => cur.includes(c.id) || (el.type === 'group' && c.parentId === el.id)).map(c => ({ id: c.id, x: c.tileX, y: c.tileY }));
    const onPointerMove = (me: PointerEvent) => {
      const dx = Math.round((me.clientX - startX) / stageScale); const dy = Math.round((me.clientY - startY) / stageScale);
      setElements(prev => {
        return prev.map(p => { 
          const s = startPositions.find(sp => sp.id === p.id); 
          if (s) {
            let nx = s.x + dx;
            let ny = s.y + dy;
            if (me.shiftKey && settings.gridSize > 0) {
              nx = Math.round(nx / settings.gridSize) * settings.gridSize;
              ny = Math.round(ny / settings.gridSize) * settings.gridSize;
            }
            return { ...p, tileX: nx, tileY: ny };
          }
          return p; 
        });
      });
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp);
      let newElements = elementsRef.current;
      cur.forEach(id => {
        const tile = newElements.find(e => e.id === id);
        if (tile && (tile.type === 'tile' || tile.type === 'color')) {
          const tw = tile.type === 'color' ? settings.colorTileWidth : settings.tileWidth;
          const tx = tile.tileX + tw / 2; const ty = tile.tileY + 20;
          const groups = newElements.filter(e => e.type === 'group') as GroupData[]; groups.sort((a, b) => b.depth - a.depth);
          let fg: string | undefined = undefined;
          for (const g of groups) { if (tx >= g.tileX && tx <= g.tileX + g.tileWidth && ty >= g.tileY && ty <= g.tileY + g.tileHeight) { fg = g.id; break; } }
          if (tile.parentId !== fg) newElements = newElements.map(e => e.id === id ? { ...e, parentId: fg } : e);
        }
      });
      pushToHistory(newElements);
    };
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp);
  };

  const handleToolbarPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingToolbar(true);
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPosX = toolbarPos.x;
    const startPosY = toolbarPos.y;
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight - 60;
    const snapRadius = 100;

    const onPointerMove = (me: PointerEvent) => {
      let newX = startPosX + (me.clientX - startClientX);
      let newY = startPosY + (me.clientY - startClientY);
      if (me.shiftKey) {
        const dist = Math.hypot(newX - targetX, newY - targetY);
        if (dist < snapRadius) {
          newX = targetX;
          newY = targetY;
          setSnapTarget(true);
        } else {
          setSnapTarget(false);
        }
      } else {
        setSnapTarget(false);
      }
      setToolbarPos({ x: newX, y: newY });
    };

    const onPointerUp = (me: PointerEvent) => {
      setIsDraggingToolbar(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      let finalX = startPosX + (me.clientX - startClientX);
      let finalY = startPosY + (me.clientY - startClientY);
      if (me.shiftKey && Math.hypot(finalX - targetX, finalY - targetY) < snapRadius) {
         finalX = targetX;
         finalY = targetY;
      }
      updateSetting('toolbarX', finalX);
      updateSetting('toolbarY', finalY);
      setSnapTarget(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const groups = useMemo(() => elements.filter(e => e.type === 'group') as GroupData[], [elements]);
  const tiles = useMemo(() => elements.filter(e => e.type === 'tile') as TileData[], [elements]);
  const colorTiles = useMemo(() => elements.filter(e => e.type === 'color') as ColorTileData[], [elements]);

  const handleRename = (id: string, name: string) => {
    handleUpdateEnd(id, { name });
  };

  const handleToggleVisibility = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (el) handleUpdateEnd(id, { visible: !(el as any).visible });
  };

  const handleCreateGroupFromPanel = () => {
    const p = transformPoint({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newGroup: GroupData = {
      id: `group-${Date.now()}`,
      name: `Group ${elements.length + 1}`,
      type: 'group',
      tileX: Math.round(p.x - 150),
      tileY: Math.round(p.y - 150),
      tileWidth: 300,
      tileHeight: 300,
      color: getDistinctColor(),
      opacity: 1,
      expanded: true,
      visible: true,
      depth: elements.length + 1
    };
    pushToHistory([...elements, newGroup]);
    setSelectedIds([newGroup.id]);
  };

  const toggleExpand = (id: string) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, expanded: !(el as any).expanded } as any : el));
  };

  const handleReorder = (newElements: CanvasElement[]) => {
    pushToHistory(newElements);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-300 font-sans overflow-hidden select-none">
      <style>{` .animate-marquee { animation: marquee-scroll 4s linear infinite alternate; } @keyframes marquee-scroll { 0%, 10% { transform: translateX(0); } 90%, 100% { transform: translateX(calc(130px - 100%)); } } `}</style>
      <CursorTooltip text={tooltip.text} visible={tooltip.visible} strokeWidth={settings.textStroke} textScale={settings.textScale} />
      <div className="flex-1 flex relative bg-[#1a1a1a]">
        <ElementsPanel 
          elements={elements}
          selectedIds={selectedIds}
          onSelect={(id, multi) => {
            if (multi) {
              setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
            } else {
              setSelectedIds([id]);
            }
          }}
          onReorder={handleReorder}
          onToggleExpand={toggleExpand}
          onDelete={(id) => handleDeleteMultiple([id])}
          onRename={handleRename}
          onToggleVisibility={handleToggleVisibility}
          onCreateGroup={handleCreateGroupFromPanel}
        />
        <div className="flex-1 relative overflow-hidden">
          <Stage
          width={window.innerWidth} height={window.innerHeight} x={stagePos.x} y={stagePos.y} scaleX={stageScale} scaleY={stageScale} draggable={tool === 'hand'}
          onDragMove={(e) => { if (e.target === stageRef.current) setStagePos({ x: e.target.x(), y: e.target.y() }); }}
          onWheel={(e) => {
            e.evt.preventDefault();
            if (e.evt.ctrlKey || e.evt.metaKey) {
              const s = e.target.getStage(); const oldS = s.scaleX(); const p = s.getPointerPosition();
              const m = { x: (p.x - s.x()) / oldS, y: (p.y - s.y()) / oldS };
              const newS = e.evt.deltaY < 0 ? oldS * 1.05 : oldS / 1.05;
              setStageScale(newS); setStagePos({ x: p.x - m.x * newS, y: p.y - m.y * newS });
            } else setStagePos(prev => ({ x: prev.x - e.evt.deltaX, y: prev.y - e.evt.deltaY }));
          }}
          onPointerDown={(e) => { setContextMenu(null); handleStagePointerDown(e); }}
          onPointerMove={handleStagePointerMove} onPointerUp={handleStagePointerUp}
          onContextMenu={(e) => {
            e.evt.preventDefault(); const p = e.target.getStage()?.getPointerPosition(); if (!p) return;
            const w = transformPoint(p); setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, worldX: Math.round(w.x), worldY: Math.round(w.y) }); setSearchQuery('');
          }}
          ref={stageRef} className="absolute inset-0 z-0"
        >
          <Layer>
            {patternImage && <Rect name="bg-rect" x={-stagePos.x / stageScale} y={-stagePos.y / stageScale} width={window.innerWidth / stageScale} height={window.innerHeight / stageScale} fillPatternImage={patternImage} />}
            {settings.showGrid && gridPatternImage && <Rect name="grid-rect" x={-stagePos.x / stageScale} y={-stagePos.y / stageScale} width={window.innerWidth / stageScale} height={window.innerHeight / stageScale} fillPatternImage={gridPatternImage} fillPatternOffset={{ x: stagePos.x / stageScale, y: stagePos.y / stageScale }} />}
            {tiles.sort((a,b)=>(a.depth||0)-(b.depth||0)).map((tile) => {
              const colorTile = elements.find(e => e.id === tile.colorTileId) as ColorTileData | undefined;
              const fill = colorTile ? getColorHex(colorTile) : tile.fill;
              const showHighlight = (selectedIds.includes(tile.id) || hoveredTileId === tile.id || (hoveredTileId && hoveredTileId === tile.colorTileId) || isSettingsOpen) && transformingTile?.id !== tile.id && interactingId !== tile.id;
              return (
                <Rect key={tile.id} id={tile.id} {...tile} fill={fill} draggable={tool === 'select'}
                  onDragMove={(e) => {
                    const n = e.target; if (!selectedIdsRef.current.includes(n.id())) return;
                    const dx = Math.round(n.x()) - tile.x; const dy = Math.round(n.y()) - tile.y;
                    setElements(prev => prev.map(el => selectedIdsRef.current.includes(el.id) && el.type === 'tile' ? { ...el, x: Math.round(el.x + dx), y: Math.round(el.y + dy) } : el));
                  }}
                  onDragEnd={() => pushToHistory(elementsRef.current)}
                  onTransform={(e) => setTransformingTile({ ...tile, x: Math.round(e.target.x()), y: Math.round(e.target.y()), width: Math.round(e.target.width() * e.target.scaleX()), height: Math.round(e.target.height() * e.target.scaleY()) })}
                  onTransformEnd={(e) => { const n = e.target; const u = { x: Math.round(n.x()), y: Math.round(n.y()), width: Math.round(n.width() * n.scaleX()), height: Math.round(n.height() * n.scaleY()) }; n.scaleX(1); n.scaleY(1); handleUpdateEnd(tile.id, u); setTransformingTile(null); }}
                  onClick={(e) => { if (tool === 'select') { if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) setSelectedIds(p => p.includes(tile.id) ? p.filter(id => id !== tile.id) : [...p, tile.id]); else setSelectedIds([tile.id]); } }}
                  stroke={showHighlight ? tile.highlightColor : 'transparent'} strokeWidth={showHighlight ? 3 : 0} opacity={tile.visible ? 1 : 0} strokeScaleEnabled={false}
                />
              );
            })}
            {currentDrawingTile && <Rect {...currentDrawingTile} />}
            {selectionRect && <Rect {...selectionRect} fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" strokeWidth={1 / stageScale} dash={[5 / stageScale, 5 / stageScale]} />}
            {tiles.filter(t => t.colorTileId).map(t => {
              const s = elements.find(e => e.id === t.colorTileId) as ColorTileData | undefined; if (!s) return null;
              
              const nameBarBottom = 40;
              const sHeight = tileHeightsRef.current[s.id] || 200;
              const sSocketY = nameBarBottom + (sHeight - nameBarBottom) / 2;
              const sx = s.tileX + (settings.colorTileWidth * settings.uiScale);
              const sy = s.tileY + (sSocketY * settings.uiScale);

              const tHeight = tileHeightsRef.current[t.id] || 200;
              const tSocketY = nameBarBottom + (tHeight - nameBarBottom) / 2;
              const ex = t.tileX;
              const ey = t.tileY + (tSocketY * settings.uiScale);

              const pts = [{x: sx, y: sy}, ...(t.cableClips || []), {x: ex, y: ey}]; 
              const dense = getSplinePoints(pts, 0.4, 40);
              const isHovered = draggingClip?.tileId === t.id || hoveredCableId === `cable-${s.id}-${t.id}`;
              const clips = t.cableClips || [];
              return (
                <Group key={`cable-${s.id}-${t.id}`} onMouseEnter={() => setHoveredCableId(`cable-${s.id}-${t.id}`)} onMouseLeave={() => setHoveredCableId(null)}>
                  <Line points={dense.flatMap(p=>[p.x, p.y])} strokeLinearGradientStartPoint={{x:sx,y:sy}} strokeLinearGradientEndPoint={{x:ex,y:ey}} strokeLinearGradientColorStops={[0, s.highlightColor, 1, t.highlightColor]} strokeWidth={3} lineCap="round" lineJoin="round" hitStrokeWidth={60}
                    onMouseMove={(e) => {
                      const p = transformPoint(e.target.getStage()?.getPointerPosition() || {x:0,y:0});
                      let md = Infinity; let sp = p; let sr = 0;
                      for(let i=0; i<dense.length-1; i++) {
                        const cp = closestPointOnSegment(p, dense[i], dense[i+1]); const d = distSq(p, cp);
                        if (d < md) { md = d; sp = cp; sr = dense[i].ratio + (Math.sqrt(distSq(cp, dense[i])) / (Math.sqrt(distSq(dense[i], dense[i+1])) || 1)) * (dense[i+1].ratio - dense[i].ratio); }
                      }
                      const tooCloseToExisting = clips.some(c => Math.sqrt(distSq(c, sp)) < 25);
                      if (tooCloseToExisting) { setHoveredCable(null); return; }
                      setHoveredCable({ tileId: t.id, x: sp.x, y: sp.y, color: interpolateHexColor(s.highlightColor, t.highlightColor, sr) });
                    }}
                    onMouseLeave={() => setHoveredCable(null)}
                    onPointerDown={(e) => {
                      e.cancelBubble = true; const p = transformPoint(e.target.getStage()?.getPointerPosition() || {x:0,y:0});
                      let md = Infinity; let sp = p; let si = 0;
                      for(let i=0; i<dense.length-1; i++) {
                        const cp = closestPointOnSegment(p, dense[i], dense[i+1]); const d = distSq(p, cp);
                        if (d < md) { md = d; sp = cp; si = dense[i].segmentIdx; }
                      }
                      const tooClose = clips.some(c => Math.sqrt(distSq(c, sp)) < 15);
                      if (tooClose) return;
                      const nc = [...clips]; nc.splice(si, 0, { id: `clip-${Date.now()}`, x: sp.x, y: sp.y });
                      handleUpdate(t.id, { cableClips: nc }); setDraggingClip({ tileId: t.id, clipIndex: si }); setHoveredCable(null);
                    }}
                  />
                  {(isHovered || draggingClip?.tileId === t.id) && clips.map((c, i) => (
                    <Circle key={c.id} x={c.x} y={c.y} radius={6} fill={interpolateHexColor(s.highlightColor, t.highlightColor, (c.x - sx) / (ex - sx || 1))} stroke="white" strokeWidth={1.5}
                      onPointerDown={(e) => { e.cancelBubble = true; setDraggingClip({ tileId: t.id, clipIndex: i }); }}
                      onContextMenu={(e) => { e.evt.preventDefault(); e.cancelBubble = true; const nc = [...clips]; nc.splice(i, 1); handleUpdateEnd(t.id, { cableClips: nc }); }}
                    />
                  ))}
                </Group>
              );
            })}
            {hoveredCable && <Circle x={hoveredCable.x} y={hoveredCable.y} radius={6} fill={hoveredCable.color} stroke="white" strokeWidth={1.5} listening={false} />}
            {drawingCable && <Path data={`M ${drawingCable.startX} ${drawingCable.startY} C ${drawingCable.startX + Math.max(100, Math.abs(drawingCable.currentX - drawingCable.startX) * 0.4)} ${drawingCable.startY}, ${drawingCable.currentX - Math.max(100, Math.abs(drawingCable.currentX - drawingCable.startX) * 0.4)} ${drawingCable.currentY}, ${drawingCable.currentX} ${drawingCable.currentY}`} stroke={drawingCable.color} strokeWidth={3} lineCap="round" />}
            {(transformingTile || currentDrawingTile) && (() => {
              const t = transformingTile || currentDrawingTile; if (!t || t.width < 1 || t.height < 1) return null;
              return (
                <Group>
                  <Text x={t.x + t.width / 2} y={t.y - 20} text={`${Math.round(t.width)} px`} fill={t.highlightColor} fontSize={11 / stageScale} fontStyle="bold" align="center" offsetX={30} />
                  <Text x={t.x + t.width / 2} y={t.y + t.height + 10} text={`${Math.round(t.width)} px`} fill={t.highlightColor} fontSize={11 / stageScale} fontStyle="bold" align="center" offsetX={30} />
                  <Text x={t.x - 50} y={t.y + t.height / 2} text={`${Math.round(t.height)} px`} fill={t.highlightColor} fontSize={11 / stageScale} fontStyle="bold" align="right" width={40} offsetY={6} />
                  <Text x={t.x + t.width + 10} y={t.y + t.height / 2} text={`${Math.round(t.height)} px`} fill={t.highlightColor} fontSize={11 / stageScale} fontStyle="bold" offsetY={6} />
                </Group>
              );
            })()}
            {selectedIds.length > 0 && tool === 'select' && elements.find(el => el.id === selectedIds[0])?.type === 'tile' && (
              <Transformer ref={trRef} boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5) ? o : n} rotateEnabled={false} keepRatio={false} anchorSize={8 / stageScale} borderStrokeWidth={1 / stageScale} anchorStroke={(elements.find(el => el.id === selectedIds[0]) as any)?.highlightColor || '#3b82f6'} borderStroke={(elements.find(el => el.id === selectedIds[0]) as any)?.highlightColor || '#3b82f6'} />
            )}
          </Layer>
        </Stage>
        <div className="absolute inset-0 pointer-events-none" style={{ transform: `translate(${stagePos.x}px, ${stagePos.y}px) scale(${stageScale})`, transformOrigin: '0 0' }}>
          {groups.map(g => {
            const theme = getThemeColor(g.color, settings);
            return (
              <motion.div key={g.id} className="group" 
                initial={false}
                animate={{ left: g.tileX, top: g.tileY }}
                transition={selectedIds.includes(g.id) ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                style={{ position: 'absolute', width: g.tileWidth, height: g.tileHeight, backgroundColor: hexToRgba(g.color, g.opacity ?? 1), border: `2px dashed ${hexToRgba(g.color, (g.opacity ?? 1) * 0.4)}`, borderRadius: 16, pointerEvents: 'none', zIndex: 10 }}>
                <div className="absolute top-0 left-0 right-0 h-10 px-4 flex items-center justify-center cursor-grab active:cursor-grabbing rounded-t-[14px] z-20 transition-colors pointer-events-auto" style={{ backgroundColor: theme.hex }} onPointerDown={(e) => handleTilePointerDown(e, g)}>
                  <TileNameInput textColor={theme.textColor} name={g.name} onChange={(e:any) => handleBulkRelativeUpdate(selectedIds.includes(g.id)?selectedIds:[g.id], () => ({ name: e.target.value }))} onCommit={(e:any) => handleBulkUpdateEnd(selectedIds.includes(g.id)?selectedIds:[g.id], { name: e.target.value })} textScale={settings.textScale} textStroke={settings.textStroke} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                </div>
                <div className="absolute top-10 left-0 right-0 h-8 overflow-hidden z-10 transition-colors pointer-events-auto" style={{ backgroundColor: hexToRgba(theme.hex, 0.5), borderBottom: `1px solid ${hexToRgba(theme.hex, 0.25)}` }}>
                  <div className={`absolute inset-0 flex items-center justify-center gap-4 transition-transform ${isSettingsOpen ? 'translate-y-0' : '-translate-y-full group-hover:translate-y-0'}`}>
                    <input type="range" min="0" max="100" step="1" value={(g.opacity ?? 1) * 100} onMouseEnter={() => showTooltip(TOOLTIPS.opacity)} onMouseLeave={hideTooltip} onChange={(e) => { const v = parseFloat(e.target.value)/100; handleBulkRelativeUpdate(selectedIds.includes(g.id)?selectedIds:[g.id], el => ({ opacity: Math.max(0, Math.min(1, (el as any).opacity + (v - (g.opacity ?? 1)))) })); }} onBlur={(e) => pushToHistory(elementsRef.current)} onPointerDown={e => e.stopPropagation()} className="w-16" style={{ accentColor: g.color }} />
                    <div className="relative rounded-full border border-white/20 cursor-pointer shrink-0" style={{ backgroundColor: g.color, width: 16 * settings.textScale, height: 16 * settings.textScale }} onMouseEnter={() => showTooltip(TOOLTIPS.colorPicker)} onMouseLeave={hideTooltip}>
                      <input type="color" value={g.color} onChange={(e) => handleBulkRelativeUpdate(selectedIds.includes(g.id)?selectedIds:[g.id], () => ({ color: e.target.value }))} onBlur={(e) => pushToHistory(elementsRef.current)} className="absolute inset-0 opacity-0 cursor-pointer" onPointerDown={e => e.stopPropagation()} />
                    </div>
                    <button onPointerDown={e => e.stopPropagation()} onMouseEnter={() => showTooltip(TOOLTIPS.delete)} onMouseLeave={hideTooltip} onClick={() => handleDeleteMultiple(selectedIds.includes(g.id) ? selectedIds : [g.id])} className="text-white/50 hover:text-red-400"><Trash2 size={14 * settings.textScale} /></button>
                  </div>
                </div>
                <div className="absolute -right-2 top-0 bottom-0 w-4 cursor-ew-resize pointer-events-auto" onPointerDown={e => { e.stopPropagation(); const sx = e.clientX; const sw = g.tileWidth; const move = (me:any) => { let nw = sw + (me.clientX - sx) / stageScale; if (me.shiftKey && settings.gridSize > 0) nw = Math.round((g.tileX + nw) / settings.gridSize) * settings.gridSize - g.tileX; handleUpdate(g.id, { tileWidth: Math.max(50, nw) }); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); pushToHistory(elementsRef.current); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }} />
                <div className="absolute -bottom-2 left-0 right-0 h-4 cursor-ns-resize pointer-events-auto" onPointerDown={e => { e.stopPropagation(); const sy = e.clientY; const sh = g.tileHeight; const move = (me:any) => { let nh = sh + (me.clientY - sy) / stageScale; if (me.shiftKey && settings.gridSize > 0) nh = Math.round((g.tileY + nh) / settings.gridSize) * settings.gridSize - g.tileY; handleUpdate(g.id, { tileHeight: Math.max(50, nh) }); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); pushToHistory(elementsRef.current); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }} />
              </motion.div>
            );
          })}
          {[...colorTiles, ...tiles].map(el => {
            const theme = getThemeColor((el as any).highlightColor || '#3b82f6', settings);
            const isSelected = selectedIds.includes(el.id);
            const elWidth = el.type === 'color' ? settings.colorTileWidth : settings.tileWidth;
            const elHeight = tileHeightsRef.current[el.id] || 200;
            const nameBarBottom = 40;
            const socketYOffset = nameBarBottom + (elHeight - nameBarBottom) / 2;

            return (
              <motion.div key={el.id} className="absolute pointer-events-auto" 
                initial={false}
                animate={{ left: el.tileX, top: el.tileY }}
                transition={interactingId === el.id || selectedIds.includes(el.id) ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                style={{ width: elWidth, transform: `scale(${settings.uiScale})`, transformOrigin: 'top left', zIndex: isSelected ? 50 : 20 }}
                onMouseEnter={() => setHoveredTileId(el.id)} onMouseLeave={() => setHoveredTileId(null)}>
                <div className="group/node relative">
                  <div className="absolute bottom-full left-0 w-full h-8 z-10 cursor-grab active:cursor-grabbing" onPointerDown={(e) => handleTilePointerDown(e, el, true)} />
                  
                  <div className={`absolute origin-bottom pointer-events-auto cursor-grab active:cursor-grabbing transition-all duration-300 ease-out ${isSettingsOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 group-hover/node:opacity-100 group-hover/node:translate-y-0'}`} 
                       style={{ 
                         width: elWidth + 4, 
                         height: settings.handleHeight, 
                         left: -2, 
                         bottom: `calc(100% + ${settings.handleY}px)`, 
                         borderTopLeftRadius: 12, 
                         borderTopRightRadius: 12, 
                         backgroundColor: (el as any).highlightColor || '#3b82f6', 
                         zIndex: -1,
                         maskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='40' preserveAspectRatio='none'%3E%3Cpath d='M0 0h100v40H0zM30 15h40v10H30z' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                         WebkitMaskImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='40' preserveAspectRatio='none'%3E%3Cpath d='M0 0h100v40H0zM30 15h40v10H30z' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                         maskSize: '100% 100%',
                         maskRepeat: 'no-repeat'
                       }} 
                       onPointerDown={(e) => handleTilePointerDown(e, el, true)}>
                    <div className="mx-auto mt-2 bg-white/30" style={{ width: '80%', height: 6, borderRadius: 9999, display: 'none' }} />
                  </div>
                  
                  <div ref={r => onTileRef(r, el.id)} className="bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl relative z-20 overflow-hidden" style={{ width: elWidth, boxShadow: (isSelected || hoveredTileId === el.id) ? `0 0 0 2px ${(el as any).highlightColor || '#3b82f6'}, 0 10px 30px rgba(0,0,0,0.5)` : '0 10px 30px rgba(0,0,0,0.5)' }} onPointerDown={(e) => handleTilePointerDown(e, el)}>
                    <div className="px-3 py-2 flex items-center justify-center cursor-grab active:cursor-grabbing relative z-40 transition-colors" style={{ backgroundColor: theme.hex, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                      <TileNameInput textColor={theme.textColor} name={el.name} onChange={(e:any) => handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], () => ({ name: e.target.value }))} onCommit={(e:any) => handleBulkUpdateEnd(isSelected?selectedIds:[el.id], { name: e.target.value })} textScale={settings.textScale} textStroke={settings.textStroke} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    </div>
                    <div className="relative">
                      <div className="absolute top-0 left-0 right-0 overflow-hidden z-30 pointer-events-none" style={{ height: settings.tileToolbarHeight }}>
                        <div className="absolute inset-0" style={{ backgroundColor: hexToRgba(theme.hex, settings.tileToolbarOpacity), borderBottom: `1px solid ${theme.hex}40` }} />
                        <div className="flex items-center justify-between px-4 w-full h-full transition-transform" style={{ transform: (isSettingsOpen || hoveredTileId === el.id) ? 'translateY(0)' : 'translateY(-100%)' }}>
                          {el.type === 'tile' && (
                            <button onPointerDown={e => e.stopPropagation()} onMouseEnter={() => showTooltip(TOOLTIPS.visibility)} onMouseLeave={hideTooltip} onClick={(e) => { e.stopPropagation(); handleBulkUpdateEnd(isSelected?selectedIds:[el.id], { visible: !(el as any).visible }); }} className="text-white/70 hover:text-white pointer-events-auto">{(el as any).visible ? <Eye size={16 * settings.tileIconScale} /> : <EyeOff size={16 * settings.tileIconScale} />}</button>
                          )}
                          <div className="relative rounded-full border border-white/20 cursor-pointer pointer-events-auto" style={{ backgroundColor: (el as any).highlightColor, width: 16 * settings.tileIconScale, height: 16 * settings.tileIconScale }} onMouseEnter={() => showTooltip(TOOLTIPS.colorPicker)} onMouseLeave={hideTooltip}>
                            <input type="color" value={(el as any).highlightColor} onChange={(e) => handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], () => ({ highlightColor: e.target.value }))} onBlur={(e) => pushToHistory(elementsRef.current)} className="absolute inset-0 opacity-0 cursor-pointer" onPointerDown={e => e.stopPropagation()} />
                          </div>
                          <button onPointerDown={e => e.stopPropagation()} onMouseEnter={() => showTooltip(TOOLTIPS.delete)} onMouseLeave={hideTooltip} onClick={(e) => { e.stopPropagation(); handleDeleteMultiple(isSelected ? selectedIds : [el.id]); }} className="text-white/50 hover:text-red-400 pointer-events-auto"><Trash2 size={14 * settings.tileIconScale} /></button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 cursor-default relative z-10" style={{ padding: `${settings.tileToolbarHeight + 12}px ${settings.rowPaddingX}px ${12 + (el.type === 'tile' ? settings.tileBottomPadding : 0)}px` }} onPointerDown={e => e.stopPropagation()}>
                        {el.type === 'color' ? (
                          <>
                            <ColorPicker2D tile={el} onChange={(v:any) => handleUpdate(el.id, v)} onCommit={(v:any) => handleUpdateEnd(el.id, v)} />
                            <select value={(el as any).colorMode} onChange={e => handleUpdateEnd(el.id, { colorMode: e.target.value as any })} className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none">
                              <option value="HSB">HSB</option><option value="HSL">HSL</option><option value="RGB">RGB</option>
                            </select>
                            <div style={{ paddingLeft: settings.colorSliderPaddingX, paddingRight: settings.colorSliderPaddingX }} className="flex flex-col gap-2 w-full">
                              <ColorRow labelWidth={settings.colorRowLabelWidth} innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label={(el as any).colorMode[0]} value={(el as any).channel1} min={0} max={(el as any).colorMode==='RGB'?255:360} highlightColor={(el as any).highlightColor} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({channel1: Math.max(0, Math.min((el as any).colorMode==='RGB'?255:360, (e as any).channel1 + d))}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{channel1:v}) : pushToHistory(elementsRef.current)} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                              <ColorRow labelWidth={settings.colorRowLabelWidth} innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label={(el as any).colorMode[1]} value={(el as any).channel2} min={0} max={(el as any).colorMode==='RGB'?255:100} highlightColor={(el as any).highlightColor} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({channel2: Math.max(0, Math.min((el as any).colorMode==='RGB'?255:100, (e as any).channel2 + d))}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{channel2:v}) : pushToHistory(elementsRef.current)} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                              <ColorRow labelWidth={settings.colorRowLabelWidth} innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label={(el as any).colorMode[2]} value={(el as any).channel3} min={0} max={(el as any).colorMode==='RGB'?255:100} highlightColor={(el as any).highlightColor} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({channel3: Math.max(0, Math.min((el as any).colorMode==='RGB'?255:100, (e as any).channel3 + d))}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{channel3:v}) : pushToHistory(elementsRef.current)} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                            </div>
                          </>
                        ) : (
                          <>
                            <PropertyRow innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label="Width" value={(el as any).width} min={0} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({width: Math.max(0, (e as any).width + d)}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{width:v}) : pushToHistory(elementsRef.current)} tooltip={TOOLTIPS.width} showTooltip={showTooltip} hideTooltip={hideTooltip} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                            <PropertyRow innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label="Height" value={(el as any).height} min={0} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({height: Math.max(0, (e as any).height + d)}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{height:v}) : pushToHistory(elementsRef.current)} tooltip={TOOLTIPS.height} showTooltip={showTooltip} hideTooltip={hideTooltip} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                            <PropertyRow innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label="Up/Down" value={(el as any).y} min={-9999} max={9999} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({y: (e as any).y + d}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{y:v}) : pushToHistory(elementsRef.current)} tooltip={TOOLTIPS.upDown} showTooltip={showTooltip} hideTooltip={hideTooltip} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                            <PropertyRow innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label="Left/Right" value={(el as any).x} min={-9999} max={9999} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({x: (e as any).x + d}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{x:v}) : pushToHistory(elementsRef.current)} tooltip={TOOLTIPS.leftRight} showTooltip={showTooltip} hideTooltip={hideTooltip} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                            <PropertyRow innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label="Depth" value={(el as any).depth} min={0} max={999999} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({depth: Math.max(0, (e as any).depth + d)}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{depth:v}) : pushToHistory(elementsRef.current)} tooltip={TOOLTIPS.depth} showTooltip={showTooltip} hideTooltip={hideTooltip} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                            <PropertyRow innerGap={settings.innerGap} textScale={settings.textScale} textStroke={settings.textStroke} label="Corner Roundness" value={(el as any).cornerRadius} min={0} max={Math.min((el as any).width,(el as any).height)/2} onChange={(v:any, d:number)=>handleBulkRelativeUpdate(isSelected?selectedIds:[el.id], e => ({cornerRadius: Math.max(0, (e as any).cornerRadius + d)}))} onCommit={(v:any, isManual:boolean)=> isManual ? handleBulkUpdateEnd(isSelected?selectedIds:[el.id],{cornerRadius:v}) : pushToHistory(elementsRef.current)} tooltip={TOOLTIPS.cornerRoundness} showTooltip={showTooltip} hideTooltip={hideTooltip} onInteractionStart={()=>setInteractingId(el.id)} onInteractionEnd={()=>setInteractingId(null)} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {el.type === 'color' ? (
                    <div className="absolute w-6 h-6 rounded-full cursor-crosshair border-4 border-[#1a1a1a] z-50 hover:scale-110 transition-transform shadow-lg" 
                         style={{ right: -12, top: socketYOffset, transform: 'translateY(-50%)', backgroundColor: (el as any).highlightColor }} 
                         onMouseEnter={() => showTooltip(TOOLTIPS.socketOutput)} onMouseLeave={hideTooltip} 
                         onPointerDown={(e) => { e.stopPropagation(); setDrawingCable({ sourceId: el.id, color: (el as any).highlightColor, startX: el.tileX + (elWidth * settings.uiScale), startY: el.tileY + (socketYOffset * settings.uiScale), currentX: el.tileX + (elWidth * settings.uiScale), currentY: el.tileY + (socketYOffset * settings.uiScale) }); }} />
                  ) : (
                    <div className="absolute w-6 h-6 rounded-full cursor-crosshair border-4 border-[#1a1a1a] z-50 hover:scale-110 transition-transform shadow-lg" 
                         style={{ left: -12, top: socketYOffset, transform: 'translateY(-50%)', backgroundColor: (el as any).highlightColor || '#52525b' }} 
                         onMouseEnter={() => showTooltip(TOOLTIPS.socketInput)} onMouseLeave={hideTooltip} 
                         onPointerUp={(e) => { e.stopPropagation(); if (drawingCable) { handleUpdateEnd(el.id, { colorTileId: drawingCable.sourceId }); setDrawingCable(null); } }} 
                         onPointerDown={(e) => { e.stopPropagation(); if ((el as any).colorTileId) handleUpdateEnd(el.id, { colorTileId: undefined }); }} />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      </div>
      <AnimatePresence>{contextMenu && (
        <motion.div initial={{ opacity: 0, scale: 0.9, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -10 }} className="fixed z-[9999] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 w-48" style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 200) }} onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
          <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tiles..." className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-2" />
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {['Color'].filter(n => n.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
              <button key={t} onClick={() => { const d = elements.length > 0 ? Math.max(...elements.map(el => el.depth || 0)) : 0; const n: ColorTileData = { id: `color-${Date.now()}`, name: `Color ${elements.length+1}`, type: 'color', tileX: contextMenu.worldX, tileY: contextMenu.worldY, visible: true, depth: Math.min(999999, d + 1), colorMode: 'HSB', channel1: Math.floor(Math.random() * 360), channel2: 80, channel3: 90, highlightColor: getDistinctColor() }; pushToHistory([...elements, n]); setContextMenu(null); }} className="text-left px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors">{t}</button>
            ))}
          </div>
        </motion.div>
      )}</AnimatePresence>

      {isDraggingToolbar && isShiftPressed && (
        <div className={`fixed z-[49] w-24 h-24 rounded-full border-4 ${snapTarget ? 'border-green-500/80 bg-green-500/20' : 'border-blue-500/50 bg-blue-500/10'} animate-pulse pointer-events-none`} style={{ left: window.innerWidth / 2, top: window.innerHeight - 60, transform: 'translate(-50%, -50%)' }} />
      )}

      <motion.div 
        onPointerDown={handleToolbarPointerDown}
        animate={{ 
            x: toolbarPos.x, 
            y: toolbarPos.y, 
            translateX: '-50%', translateY: '-50%', scale: settings.mainToolbarScale
        }}
        transition={{ type: 'spring', bounce: 0.2, duration: isDraggingToolbar ? 0 : 0.4 }}
        style={{ left: 0, top: 0, position: 'fixed', zIndex: 50 }}
        className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex items-center cursor-move"
        >
        <div className="flex items-center" style={{ padding: settings.mainToolbarPadding, gap: settings.mainToolbarGap }}>
          <ToolButton icon={<MousePointer2 size={settings.mainToolbarIconSize} />} label="Select (V)" active={tool === 'select'} onClick={() => setTool('select')} />
          <ToolButton icon={<Hand size={settings.mainToolbarIconSize} />} label="Pan (H / Space)" active={tool === 'hand'} onClick={() => setTool('hand')} />
          <ToolButton icon={<ZoomIn size={settings.mainToolbarIconSize} />} label="Zoom (Z)" active={tool === 'zoom'} onClick={() => setTool('zoom')} />
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton icon={<Square size={settings.mainToolbarIconSize} />} label="Rectangle (R)" active={tool === 'tile'} onClick={() => setTool('tile')} />
          <ToolButton icon={<FolderPlus size={settings.mainToolbarIconSize} />} label="Group (G)" active={tool === 'group'} onClick={() => setTool('group')} />
          <div className="w-px h-6 bg-white/10 mx-1" />
          <ToolButton icon={<Grid size={settings.mainToolbarIconSize} />} label="Grid Settings" active={isGridSettingsOpen} onClick={() => { setIsGridSettingsOpen(!isGridSettingsOpen); setIsSettingsOpen(false); }} />
          <ToolButton icon={<Settings size={settings.mainToolbarIconSize} />} label="Settings" active={isSettingsOpen} onClick={() => { setIsSettingsOpen(!isSettingsOpen); setIsGridSettingsOpen(false); }} />
        </div>
      </motion.div>

      <AnimatePresence>{isSettingsOpen && (
        <motion.div drag dragMomentum={false} onDragEnd={(e, info) => { updateSetting('settingsX', settings.settingsX + info.offset.x); updateSetting('settingsY', settings.settingsY + info.offset.y); }} 
        initial={{ opacity: 0, scale: 0.9, x: settings.settingsX, y: settings.settingsY }} 
        animate={{ opacity: 1, scale: 1, x: settings.settingsX, y: settings.settingsY }} 
        exit={{ opacity: 0, scale: 0.9 }} 
        style={{ position: 'fixed', left: 0, top: 0, zIndex: 50 }} 
        className="bg-[#1a1a1a] border border-white/10 p-0 rounded-2xl shadow-2xl w-96 max-h-[80vh] flex flex-col overflow-hidden cursor-default">
          <div className="flex items-center justify-between p-4 border-b border-white/10 cursor-move shrink-0">
            <h3 className="text-white font-bold flex items-center gap-2"><Settings size={18} /> Application Settings</h3>
            <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
          </div>
          
          <div className="flex border-b border-white/10 shrink-0">
            {(['canvas', 'tiles', 'visuals'] as const).map(tab => (
              <button 
                key={tab} 
                onClick={() => setSettingsTab(tab)}
                className={`flex-1 py-3 text-[10px] uppercase font-bold tracking-widest transition-colors ${settingsTab === tab ? 'text-blue-500 bg-blue-500/5 border-b-2 border-blue-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {settingsTab === 'canvas' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Grid & Background</h4>
                  <div className="flex items-center justify-between px-1 bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-zinc-300 text-xs font-medium">Show Grid Overlay</span>
                    <input type="checkbox" checked={settings.showGrid} onChange={(e) => updateSetting('showGrid', e.target.checked)} className="w-4 h-4 rounded accent-blue-500 cursor-pointer" />
                  </div>
                  <ColorRow label="Grid Cell Size" value={settings.gridSize} min={10} max={200} precision={0} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('gridSize',v)} onCommit={(v:any)=>updateSetting('gridSize',v)} />
                  <ColorRow label="Grid Line Opacity" value={settings.gridOpacity} min={0.01} max={1} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('gridOpacity',v)} onCommit={(v:any)=>updateSetting('gridOpacity',v)} />
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Interface Scaling</h4>
                  <ColorRow label="Main Toolbar Scale" value={settings.mainToolbarScale} min={0.5} max={2.5} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('mainToolbarScale',v)} onCommit={(v:any)=>updateSetting('mainToolbarScale',v)} />
                  <ColorRow label="Global UI Scale" value={settings.uiScale} min={0.5} max={2} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('uiScale',v)} onCommit={(v:any)=>updateSetting('uiScale',v)} />
                </div>
              </div>
            )}

            {settingsTab === 'tiles' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Tile Dimensions</h4>
                  <ColorRow label="Standard Tile Width" value={settings.tileWidth} min={120} max={600} precision={0} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('tileWidth',v)} onCommit={(v:any)=>updateSetting('tileWidth',v)} />
                  <ColorRow label="Color Tile Width" value={settings.colorTileWidth} min={120} max={600} precision={0} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('colorTileWidth',v)} onCommit={(v:any)=>updateSetting('colorTileWidth',v)} />
                  <ColorRow label="Bottom Padding" value={settings.tileBottomPadding} min={0} max={100} precision={0} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('tileBottomPadding',v)} onCommit={(v:any)=>updateSetting('tileBottomPadding',v)} />
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Handle Configuration</h4>
                  <ColorRow label="Handle Height" value={settings.handleHeight} min={10} max={100} precision={0} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('handleHeight',v)} onCommit={(v:any)=>updateSetting('handleHeight',v)} />
                  <ColorRow label="Vertical Offset" value={settings.handleY} min={-100} max={100} precision={0} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('handleY',v)} onCommit={(v:any)=>updateSetting('handleY',v)} />
                </div>
              </div>
            )}

            {settingsTab === 'visuals' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Typography</h4>
                  <ColorRow label="Text Scale" value={settings.textScale} min={0.5} max={3} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('textScale',v)} onCommit={(v:any)=>updateSetting('textScale',v)} />
                  <ColorRow label="Stroke Weight" value={settings.textStroke} min={0} max={5} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('textStroke',v)} onCommit={(v:any)=>updateSetting('textStroke',v)} />
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Toolbar Effects</h4>
                  <ColorRow label="Toolbar Opacity" value={settings.tileToolbarOpacity} min={0} max={1} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('tileToolbarOpacity',v)} onCommit={(v:any)=>updateSetting('tileToolbarOpacity',v)} />
                  <ColorRow label="Icon Scale" value={settings.tileIconScale} min={0.5} max={2.5} precision={2} highlightColor="#3b82f6" onChange={(v:any)=>updateSetting('tileIconScale',v)} onCommit={(v:any)=>updateSetting('tileIconScale',v)} />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
