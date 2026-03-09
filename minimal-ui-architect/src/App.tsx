import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer, Text, Group, Path } from 'react-konva';
import { NodeData, Tool, CanvasElement, GroupData, ColorNodeData } from './types';
import { TOOLTIPS } from './tooltips';
import { Trash2, MousePointer2, Square, Eye, EyeOff, FolderPlus, Hand, ZoomIn, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_ELEMENTS: CanvasElement[] = [];

export const hsbToHex = (h: number, s: number, b: number) => {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(5))}${toHex(f(3))}${toHex(f(1))}`;
};

export const hslToHex = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

export const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const getColorHex = (node: ColorNodeData) => {
  if (node.colorMode === 'HSB') return hsbToHex(node.channel1, node.channel2, node.channel3);
  if (node.colorMode === 'HSL') return hslToHex(node.channel1, node.channel2, node.channel3);
  return rgbToHex(node.channel1, node.channel2, node.channel3);
};

// --- Custom Tooltip Component ---
const CursorTooltip = ({ text, visible }: { text: string; visible: boolean }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          style={{
            position: 'fixed',
            left: pos.x + 15,
            top: pos.y + 15,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="bg-zinc-800 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-white/10 max-w-[200px] leading-relaxed whitespace-pre-wrap"
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Scrubbable Number Input Component ---
interface ScrubbableInputProps {
  value: number;
  onChange: (val: number) => void;
  onCommit: (val: number) => void;
  label: string;
  tooltip: string;
  showTooltip: (text: string) => void;
  hideTooltip: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  textScale: number;
}

const ScrubbableInput: React.FC<ScrubbableInputProps> = ({
  value, onChange, onCommit, label, tooltip, showTooltip, hideTooltip, onHoverStart, onHoverEnd, textScale
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const isDragging = useRef(false);
  const startVal = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  useEffect(() => {
    const handleLockChange = () => {
      if (document.pointerLockElement !== containerRef.current && isDragging.current) {
        isDragging.current = false;
        onCommit(Math.round(startVal.current));
      }
    };
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => document.removeEventListener('pointerlockchange', handleLockChange);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditing) return;
    const initialX = e.clientX;
    const initialY = e.clientY;
    isDragging.current = false;
    startVal.current = value;

    const handleMouseMove = (me: MouseEvent) => {
      if (!isDragging.current) {
        const dist = Math.sqrt(Math.pow(me.clientX - initialX, 2) + Math.pow(me.clientY - initialY, 2));
        if (dist > 3) {
          isDragging.current = true;
          containerRef.current?.requestPointerLock();
        }
      }

      if (isDragging.current) {
        let movementX = me.movementX || 0;
        if (Math.abs(movementX) > 500) movementX = 0;
        startVal.current += movementX;
        onChange(Math.round(startVal.current));
      }
    };

    const handleMouseUp = () => {
      if (!isDragging.current) {
        setIsEditing(true);
      } else {
        onCommit(Math.round(startVal.current));
        if (document.pointerLockElement === containerRef.current) {
          document.exitPointerLock();
        }
      }
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseInt(inputValue);
    if (!isNaN(parsed)) {
      onCommit(parsed);
    } else {
      setInputValue(value.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div className="flex items-center justify-between group/scrub" onMouseDown={e => e.stopPropagation()}>
      <label
        className="text-zinc-400 flex items-center gap-1 cursor-help select-none"
        style={{ fontSize: `${11 * textScale}px` }}
        onMouseEnter={() => { showTooltip(tooltip); onHoverStart?.(); }}
        onMouseLeave={() => { hideTooltip(); onHoverEnd?.(); }}
      >
        {label}
      </label>
      {isEditing ? (
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{ fontSize: `${11 * textScale}px` }}
          className="bg-blue-500/20 border border-blue-500/50 rounded px-2 py-1 w-16 text-right outline-none text-white"
        />
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseEnter={onHoverStart}
          onMouseLeave={onHoverEnd}
          style={{ fontSize: `${11 * textScale}px` }}
          className="bg-black/40 border border-white/5 rounded px-2 py-1 w-16 text-right cursor-ew-resize select-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          {Math.round(value)}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [elements, setElements] = useState<CanvasElement[]>(INITIAL_ELEMENTS);
  const elementsRef = useRef(elements);
  const [history, setHistory] = useState<CanvasElement[][]>([INITIAL_ELEMENTS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef(selectedIds);
  
  const [clipboard, setClipboard] = useState<CanvasElement[]>([]);
  const clipboardRef = useRef(clipboard);

  const [tool, setTool] = useState<Tool>('select');
  const [prevTool, setPrevTool] = useState<Tool>('select');
  const [tooltip, setTooltip] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, worldX: number, worldY: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [uiScale, setUiScale] = useState(1);
  const [textScale, setTextScale] = useState(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingGroup, setIsDrawingGroup] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [drawingWire, setDrawingWire] = useState<{ sourceId: string, startX: number, startY: number, currentX: number, currentY: number } | null>(null);

  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [newNodeStart, setNewNodeStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrawingNode, setCurrentDrawingNode] = useState<NodeData | null>(null);
  const [currentDrawingGroup, setCurrentDrawingGroup] = useState<GroupData | null>(null);
  const [transformingNode, setTransformingNode] = useState<NodeData | null>(null);
  const zoomStartRef = useRef<{ clientX: number, scale: number, mousePointTo: { x: number, y: number } } | null>(null);

  const lastHueRef = useRef<number>(Math.floor(Math.random() * 360));
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const nodeMask = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cdefs%3E%3Cmask id='hole'%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3Crect x='50%25' y='18' width='64' height='12' rx='6' fill='black' transform='translate(-32, 0)'/%3E%3C/mask%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='black' mask='url(%23hole)'/%3E%3C/svg%3E")`;

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    clipboardRef.current = clipboard;
  }, [clipboard]);

  // --- History Management ---
  const pushToHistory = useCallback((newElements: CanvasElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setElements(history[prevIndex]);
      setSelectedIds([]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setElements(history[nextIndex]);
      setSelectedIds([]);
    }
  }, [history, historyIndex]);

  const handleDeleteMultiple = useCallback((ids: string[]) => {
    const newElements = elementsRef.current.filter(el => !ids.includes(el.id) && (!el.parentId || !ids.includes(el.parentId)));
    pushToHistory(newElements);
    setSelectedIds([]);
  }, [pushToHistory]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIdsRef.current.length > 0) {
        handleDeleteMultiple(selectedIdsRef.current);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selectedElements = elementsRef.current.filter(el => selectedIdsRef.current.includes(el.id));
        setClipboard(selectedElements);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current.length > 0) {
          const newElements = clipboardRef.current.map(el => {
            const newId = `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            if (el.type === 'node') {
              const node = el as NodeData;
              return {
                ...node,
                id: newId,
                name: `${node.name} (Copy)`,
                nodeX: node.nodeX + 40,
                nodeY: node.nodeY + 40,
                x: node.x + 40,
                y: node.y + 40,
              };
            } else if (el.type === 'group') {
              const group = el as GroupData;
              return {
                ...group,
                id: newId,
                name: `${group.name} (Copy)`,
                nodeX: group.nodeX + 40,
                nodeY: group.nodeY + 40,
              };
            } else {
              const colorNode = el as ColorNodeData;
              return {
                ...colorNode,
                id: newId,
                name: `${colorNode.name} (Copy)`,
                nodeX: colorNode.nodeX + 40,
                nodeY: colorNode.nodeY + 40,
              };
            }
          });
          pushToHistory([...elementsRef.current, ...newElements]);
          setSelectedIds(newElements.map(el => el.id));
        }
      }

      if (e.code === 'Space' && tool !== 'hand') {
        setPrevTool(tool);
        setTool('hand');
      }
      if (e.key.toLowerCase() === 'z' && tool !== 'zoom') {
        setTool('zoom');
      }
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'r') setTool('node');
      if (e.key.toLowerCase() === 'g') setTool('group');
      if (e.key.toLowerCase() === 'h') setTool('hand');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'Space' && tool === 'hand') {
        setTool(prevTool);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [undo, redo, tool, prevTool, pushToHistory, handleDeleteMultiple]);

  useEffect(() => {
    if (trRef.current && selectedIds.length > 0) {
      const nodes = selectedIds.map(id => stageRef.current.findOne('#' + id)).filter(Boolean);
      trRef.current.nodes(nodes);
      trRef.current.getLayer().batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selectedIds, elements]);

  const getNextDefaultName = (type: 'node' | 'group' | 'color') => {
    let i = 1;
    const prefix = type === 'node' ? 'Node' : type === 'group' ? 'Group' : 'Color';
    while (elements.some(e => e.name.toLowerCase() === `${prefix.toLowerCase()} ${i}`)) i++;
    return `${prefix} ${i}`;
  };

  const generateDistinctColor = useCallback(() => {
    const step = 60 + Math.random() * 120;
    const h = (lastHueRef.current + step) % 360;
    lastHueRef.current = h;
    return hslToHex(h, 65 + Math.random() * 20, 50 + Math.random() * 10);
  }, []);

  const transformPoint = (pos: { x: number, y: number }) => ({
    x: (pos.x - stagePos.x) / stageScale,
    y: (pos.y - stagePos.y) / stageScale
  });

  const spawnNode = (type: 'color') => {
    if (!contextMenu) return;
    const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;
    const newNode: ColorNodeData = {
      id: `color-${Date.now()}`,
      name: getNextDefaultName('color'),
      type: 'color',
      nodeX: contextMenu.worldX,
      nodeY: contextMenu.worldY,
      visible: true,
      depth: maxDepth + 1,
      colorMode: 'HSB',
      channel1: Math.floor(Math.random() * 360),
      channel2: 80,
      channel3: 90
    };
    pushToHistory([...elements, newNode]);
    setContextMenu(null);
  };

  const handleStagePointerDown = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const worldPos = transformPoint(pos);
    const roundedWorldPos = { x: Math.round(worldPos.x), y: Math.round(worldPos.y) };

    if (tool === 'zoom') {
      setIsZooming(true);
      zoomStartRef.current = {
        clientX: e.evt.clientX,
        scale: stageScale,
        mousePointTo: worldPos
      };
    } else if (tool === 'node') {
      setIsDrawing(true);
      setNewNodeStart(roundedWorldPos);
      const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;
      setCurrentDrawingNode({
        id: `node-temp`,
        name: '',
        type: 'node',
        x: roundedWorldPos.x, y: roundedWorldPos.y, width: 0, height: 0,
        nodeX: roundedWorldPos.x, nodeY: roundedWorldPos.y,
        fill: '#808080',
        stroke: 'transparent',
        strokeWidth: 0,
        visible: true,
        depth: maxDepth + 1,
        cornerRadius: 0,
        highlightColor: '#3b82f6'
      });
    } else if (tool === 'group') {
      setIsDrawingGroup(true);
      setNewNodeStart(roundedWorldPos);
      const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;
      setCurrentDrawingGroup({
        id: `group-temp`,
        name: '',
        type: 'group',
        nodeX: roundedWorldPos.x, nodeY: roundedWorldPos.y, nodeWidth: 0, nodeHeight: 0,
        color: '#3b82f6',
        expanded: true,
        visible: true,
        depth: maxDepth + 1
      });
    } else if (tool === 'select') {
      if (e.target === stage) {
        setIsSelecting(true);
        setSelectionStart(roundedWorldPos);
        setSelectionRect({ x: roundedWorldPos.x, y: roundedWorldPos.y, width: 0, height: 0 });
        setSelectedIds([]);
      }
    }
  };

  const handleStagePointerMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const worldPos = transformPoint(pos);
    const roundedWorldPos = { x: Math.round(worldPos.x), y: Math.round(worldPos.y) };

    if (drawingWire) {
      setDrawingWire({ ...drawingWire, currentX: worldPos.x, currentY: worldPos.y });
    }

    if (isZooming && zoomStartRef.current) {
      const dx = e.evt.clientX - zoomStartRef.current.clientX;
      const newScale = Math.max(0.1, Math.min(zoomStartRef.current.scale * (1 + dx * 0.01), 5));
      const newPos = {
        x: pos.x - zoomStartRef.current.mousePointTo.x * newScale,
        y: pos.y - zoomStartRef.current.mousePointTo.y * newScale,
      };
      setStageScale(newScale);
      setStagePos(newPos);
    } else if (isDrawing && newNodeStart && currentDrawingNode) {
      setCurrentDrawingNode({
        ...currentDrawingNode,
        x: Math.min(newNodeStart.x, roundedWorldPos.x),
        y: Math.min(newNodeStart.y, roundedWorldPos.y),
        width: Math.abs(roundedWorldPos.x - newNodeStart.x),
        height: Math.abs(roundedWorldPos.y - newNodeStart.y),
      });
    } else if (isDrawingGroup && newNodeStart && currentDrawingGroup) {
      setCurrentDrawingGroup({
        ...currentDrawingGroup,
        nodeX: Math.min(newNodeStart.x, roundedWorldPos.x),
        nodeY: Math.min(newNodeStart.y, roundedWorldPos.y),
        nodeWidth: Math.abs(roundedWorldPos.x - newNodeStart.x),
        nodeHeight: Math.abs(roundedWorldPos.y - newNodeStart.y),
      });
    } else if (isSelecting && selectionStart) {
      setSelectionRect({
        x: Math.min(selectionStart.x, roundedWorldPos.x),
        y: Math.min(selectionStart.y, roundedWorldPos.y),
        width: Math.abs(roundedWorldPos.x - selectionStart.x),
        height: Math.abs(roundedWorldPos.y - selectionStart.y),
      });
    }
  };

  const handleStagePointerUp = () => {
    if (drawingWire) {
      setDrawingWire(null);
    }

    if (isZooming) {
      setIsZooming(false);
      zoomStartRef.current = null;
    } else if (isDrawing && currentDrawingNode) {
      if (currentDrawingNode.width > 5 && currentDrawingNode.height > 5) {
        const finalNode: NodeData = {
          ...currentDrawingNode,
          id: `node-${Date.now()}`,
          name: getNextDefaultName('node'),
          highlightColor: generateDistinctColor(),
          nodeX: currentDrawingNode.x + currentDrawingNode.width + 40,
          nodeY: currentDrawingNode.y
        };
        pushToHistory([...elements, finalNode]);
        setSelectedIds([finalNode.id]);
      }
      setIsDrawing(false);
      setNewNodeStart(null);
      setCurrentDrawingNode(null);
    } else if (isDrawingGroup && currentDrawingGroup) {
      if (currentDrawingGroup.nodeWidth > 5 && currentDrawingGroup.nodeHeight > 5) {
        const finalGroup: GroupData = {
          ...currentDrawingGroup,
          id: `group-${Date.now()}`,
          name: getNextDefaultName('group'),
          color: generateDistinctColor(),
        };
        pushToHistory([...elements, finalGroup]);
        setSelectedIds([finalGroup.id]);
      }
      setIsDrawingGroup(false);
      setNewNodeStart(null);
      setCurrentDrawingGroup(null);
    } else if (isSelecting && selectionRect) {
      const selected = elements.filter(el => {
        if (el.type !== 'node') return false;
        const r = el as NodeData;
        return r.visible &&
          r.x >= selectionRect.x && r.y >= selectionRect.y &&
          r.x + r.width <= selectionRect.x + selectionRect.width &&
          r.y + r.height <= selectionRect.y + selectionRect.height;
      }).map(el => el.id);
      setSelectedIds(selected);
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionRect(null);
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const scaleBy = 1.05;
      const stage = e.target.getStage();
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };
      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      setStageScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaX,
        y: prev.y - e.evt.deltaY
      }));
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    if (tool === 'hand' || tool === 'zoom') return;
    e.stopPropagation();

    let currentSelectedIds = selectedIdsRef.current;

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (currentSelectedIds.includes(el.id)) {
        currentSelectedIds = currentSelectedIds.filter(id => id !== el.id);
      } else {
        currentSelectedIds = [...currentSelectedIds, el.id];
      }
      setSelectedIds(currentSelectedIds);
    } else if (!currentSelectedIds.includes(el.id)) {
      currentSelectedIds = [el.id];
      setSelectedIds(currentSelectedIds);
    }

    const startX = e.clientX;
    const startY = e.clientY;

    const startPositions = elementsRef.current
      .filter(c => currentSelectedIds.includes(c.id) || (el.type === 'group' && c.parentId === el.id))
      .map(c => ({ id: c.id, x: c.nodeX, y: c.nodeY }));

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = Math.round((moveEvt.clientX - startX) / stageScale);
      const dy = Math.round((moveEvt.clientY - startY) / stageScale);

      setElements(prev => prev.map(p => {
        const startPos = startPositions.find(sp => sp.id === p.id);
        if (startPos) {
          return { ...p, nodeX: startPos.x + dx, nodeY: startPos.y + dy };
        }
        return p;
      }));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      
      let newElements = elementsRef.current;
      let changed = false;

      currentSelectedIds.forEach(id => {
        const node = newElements.find(e => e.id === id);
        if (node && node.type === 'node') {
          const nodeCenterX = node.nodeX + 96; // approx half of w-48
          const nodeCenterY = node.nodeY + 20;

          const groups = newElements.filter(e => e.type === 'group') as GroupData[];
          groups.sort((a, b) => b.depth - a.depth);

          let foundGroupId: string | undefined = undefined;
          for (const group of groups) {
            if (nodeCenterX >= group.nodeX && nodeCenterX <= group.nodeX + group.nodeWidth &&
              nodeCenterY >= group.nodeY && nodeCenterY <= group.nodeY + group.nodeHeight) {
              foundGroupId = group.id;
              break;
            }
          }

          if (node.parentId !== foundGroupId) {
            newElements = newElements.map(e => e.id === id ? { ...e, parentId: foundGroupId } : e);
            changed = true;
          }
        }
      });

      pushToHistory(newElements);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleGroupResizePointerDown = (e: React.PointerEvent, group: GroupData, corner: string) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = group.nodeWidth;
    const startH = group.nodeHeight;
    const startNodeX = group.nodeX;
    const startNodeY = group.nodeY;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = Math.round((moveEvt.clientX - startX) / stageScale);
      const dy = Math.round((moveEvt.clientY - startY) / stageScale);
      let newW = startW;
      let newH = startH;
      let newX = startNodeX;
      let newY = startNodeY;

      if (corner.includes('e')) newW = Math.max(50, startW + dx);
      if (corner.includes('s')) newH = Math.max(50, startH + dy);
      if (corner.includes('w')) {
        newW = Math.max(50, startW - dx);
        if (newW > 50) newX = startNodeX + dx;
      }
      if (corner.includes('n')) {
        newH = Math.max(50, startH - dy);
        if (newH > 50) newY = startNodeY + dy;
      }

      setElements(prev => prev.map(p => p.id === group.id ? { ...p, nodeWidth: newW, nodeHeight: newH, nodeX: newX, nodeY: newY } : p));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      pushToHistory(elementsRef.current);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const applyConstraints = (node: NodeData, updates: Partial<NodeData>): NodeData => {
    const next = { ...node, ...updates };
    if (next.width < 0) next.width = 0;
    if (next.height < 0) next.height = 0;
    const maxRadius = Math.min(next.width, next.height) / 2;
    if (next.cornerRadius < 0) next.cornerRadius = 0;
    if (next.cornerRadius > maxRadius) next.cornerRadius = maxRadius;
    return next;
  };

  const handleUpdate = (id: string, updates: Partial<CanvasElement>) => {
    const targetElement = elements.find(el => el.id === id);
    if (!targetElement) return;
    const newElements = elements.map(el => {
      if (el.id === id) {
        if (el.type === 'node') return applyConstraints(el as NodeData, updates as Partial<NodeData>);
        if (el.type === 'color') return { ...el, ...updates } as ColorNodeData;
        return { ...el, ...updates } as GroupData;
      }
      return el;
    });
    setElements(newElements);
  };

  const handleUpdateEnd = (id: string, updates: Partial<CanvasElement>) => {
    const targetElement = elementsRef.current.find(el => el.id === id);
    if (!targetElement) return;
    const newElements = elementsRef.current.map(el => {
      if (el.id === id) {
        if (el.type === 'node') return applyConstraints(el as NodeData, updates as Partial<NodeData>);
        if (el.type === 'color') return { ...el, ...updates } as ColorNodeData;
        return { ...el, ...updates } as GroupData;
      }
      return el;
    });
    pushToHistory(newElements);
  };

  const handleBulkUpdate = (ids: string[], updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => {
      if (ids.includes(el.id)) {
        if (el.type === 'node') return applyConstraints(el as NodeData, updates as Partial<NodeData>);
        if (el.type === 'color') return { ...el, ...updates } as ColorNodeData;
        return { ...el, ...updates } as GroupData;
      }
      return el;
    }));
  };

  const handleBulkUpdateEnd = (ids: string[], updates: Partial<CanvasElement>) => {
    const newElements = elementsRef.current.map(el => {
      if (ids.includes(el.id)) {
        if (el.type === 'node') return applyConstraints(el as NodeData, updates as Partial<NodeData>);
        if (el.type === 'color') return { ...el, ...updates } as ColorNodeData;
        return { ...el, ...updates } as GroupData;
      }
      return el;
    });
    pushToHistory(newElements);
  };

  const handleTransform = (e: any) => {
    const node = e.target;
    const id = node.id();
    const el = elements.find(r => r.id === id);
    if (el && el.type === 'node') {
      setTransformingNode({
        ...(el as NodeData),
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.round(node.width() * node.scaleX()),
        height: Math.round(node.height() * node.scaleY()),
      });
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    const id = node.id();
    const el = elements.find(r => r.id === id);
    if (el && el.type === 'node') {
      const updates = {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.round(node.width() * node.scaleX()),
        height: Math.round(node.height() * node.scaleY()),
      };
      node.scaleX(1);
      node.scaleY(1);
      handleUpdateEnd(id, updates);
      setTransformingNode(null);
    }
  };

  const handleDragMove = (e: any) => {
    const node = e.target;
    const id = node.id();
    if (!selectedIdsRef.current.includes(id)) return;

    const targetEl = elementsRef.current.find(el => el.id === id);
    if (!targetEl || targetEl.type !== 'node') return;
    const targetNode = targetEl as NodeData;

    const newX = Math.round(node.x());
    const newY = Math.round(node.y());
    const dx = newX - Math.round(targetNode.x);
    const dy = newY - Math.round(targetNode.y);

    const newElements = elementsRef.current.map(el => {
      if (selectedIdsRef.current.includes(el.id)) {
        if (el.type === 'node') {
          const r = el as NodeData;
          return { ...r, x: el.id === id ? newX : Math.round(r.x + dx), y: el.id === id ? newY : Math.round(r.y + dy) };
        }
      }
      return el;
    });
    setElements(newElements);
  };

  const showTooltip = (text: string) => setTooltip({ text, visible: true });
  const hideTooltip = () => setTooltip({ text: '', visible: false });

  const handleExport = () => {
    const exportData = elements.map(({ id, ...rest }) => rest);
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json);
  };

  const sortedNodes = useMemo(() => elements.filter(e => e.type === 'node').sort((a, b) => a.depth - b.depth), [elements]);
  const groups = useMemo(() => elements.filter(e => e.type === 'group') as GroupData[], [elements]);
  const nodes = useMemo(() => elements.filter(e => e.type === 'node') as NodeData[], [elements]);
  const colorNodes = useMemo(() => elements.filter(e => e.type === 'color') as ColorNodeData[], [elements]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-300 font-sans overflow-hidden select-none">
      <CursorTooltip text={tooltip.text} visible={tooltip.visible} />

      {/* World Area */}
      <div
        className="flex-1 relative"
        style={{ 
          backgroundColor: '#1a1a1a',
          backgroundImage: `
            linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%, #2a2a2a),
            linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%, #2a2a2a)
          `,
          backgroundSize: `${40 * stageScale}px ${40 * stageScale}px`, 
          backgroundPosition: `${stagePos.x * stageScale}px ${stagePos.y * stageScale}px, ${stagePos.x * stageScale + 20 * stageScale}px ${stagePos.y * stageScale + 20 * stageScale}px`
        }}
      >
        {/* Konva Spatial Layer */}
        <Stage
          width={window.innerWidth}
          height={window.innerHeight}
          x={stagePos.x}
          y={stagePos.y}
          scaleX={stageScale}
          scaleY={stageScale}
          draggable={tool === 'hand'}
          onDragMove={(e) => {
            if (e.target === stageRef.current) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
          onWheel={handleWheel}
          onPointerDown={(e) => {
            setContextMenu(null);
            handleStagePointerDown(e);
          }}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            const pos = e.target.getStage()?.getPointerPosition();
            if (!pos) return;
            const worldPos = transformPoint(pos);
            setContextMenu({
              x: e.evt.clientX,
              y: e.evt.clientY,
              worldX: Math.round(worldPos.x),
              worldY: Math.round(worldPos.y)
            });
            setSearchQuery('');
          }}
          ref={stageRef}
          className="absolute inset-0 z-0"
        >
          <Layer>
            {sortedNodes.map((el) => {
              const node = el as NodeData;
              const colorNode = elements.find(e => e.id === node.colorNodeId) as ColorNodeData | undefined;
              const fillColor = colorNode ? getColorHex(colorNode) : node.fill;
              
              return (
                <Rect
                  key={node.id}
                  id={node.id}
                  {...node}
                  fill={fillColor}
                  cornerRadius={node.cornerRadius}
                  draggable={tool === 'select'}
                  onDragMove={handleDragMove}
                  onDragEnd={() => pushToHistory(elementsRef.current)}
                  onTransform={handleTransform}
                  onTransformEnd={handleTransformEnd}
                  onClick={(e) => {
                    if (tool !== 'select') return;
                    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
                      setSelectedIds(prev => prev.includes(node.id) ? prev.filter(id => id !== node.id) : [...prev, node.id]);
                    } else {
                      setSelectedIds([node.id]);
                    }
                  }}
                  strokeScaleEnabled={false}
                  stroke={selectedIds.includes(node.id) ? node.highlightColor : 'transparent'}
                  strokeWidth={selectedIds.includes(node.id) ? 4 / stageScale : 0}
                  opacity={node.visible ? 1 : 0}
                />
              );
            })}

            {currentDrawingNode && <Rect {...currentDrawingNode} />}

            {selectionRect && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3b82f6"
                strokeWidth={1 / stageScale}
                dash={[5 / stageScale, 5 / stageScale]}
              />
            )}

            {/* Connections (Wires) */}
            {elements.filter(e => e.type === 'node' && (e as NodeData).colorNodeId).map(el => {
              const targetNode = el as NodeData;
              const sourceNode = elements.find(e => e.id === targetNode.colorNodeId) as ColorNodeData | undefined;
              if (!sourceNode) return null;
              
              const startX = sourceNode.nodeX + (192 * uiScale);
              const startY = sourceNode.nodeY + (72 * uiScale);
              const endX = targetNode.nodeX;
              const endY = targetNode.nodeY + (72 * uiScale);

              return (
                <Path
                  key={`wire-${sourceNode.id}-${targetNode.id}`}
                  data={`M ${startX} ${startY} C ${startX + 60} ${startY}, ${endX - 60} ${endY}, ${endX} ${endY}`}
                  stroke={getColorHex(sourceNode)}
                  strokeWidth={4 / stageScale}
                  lineCap="round"
                />
              );
            })}

            {drawingWire && (
              <Path
                data={`M ${drawingWire.startX} ${drawingWire.startY} C ${drawingWire.startX + 60} ${drawingWire.startY}, ${drawingWire.currentX - 60} ${drawingWire.currentY}, ${drawingWire.currentX} ${drawingWire.currentY}`}
                stroke="#3b82f6"
                strokeWidth={4 / stageScale}
                lineCap="round"
                dash={[10 / stageScale, 10 / stageScale]}
              />
            )}

            {(transformingNode || currentDrawingNode) && (() => {
              const node = transformingNode || currentDrawingNode;
              if (!node) return null;
              return (
                <Group>
                  <Text x={node.x + node.width / 2 - 30} y={node.y - 25 / stageScale} text={`${node.width} px`} fill={node.highlightColor} fontSize={11 / stageScale} fontStyle="bold" align="center" />
                  <Text x={node.x + node.width + 10 / stageScale} y={node.y + node.height / 2 - 6 / stageScale} text={`${node.height} px`} fill={node.highlightColor} fontSize={11 / stageScale} fontStyle="bold" />
                </Group>
              );
            })()}

            {selectedIds.length > 0 && tool === 'select' && (() => {
              const selectedEl = elements.find(el => el.id === selectedIds[0]);
              if (!selectedEl || selectedEl.type !== 'node') return null;
              const color = (selectedEl as NodeData).highlightColor || "#3b82f6";
              return (
                <Transformer
                  ref={trRef}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5) ? oldBox : newBox}
                  rotateEnabled={false}
                  anchorStroke={color}
                  anchorFill={color}
                  anchorSize={8 / stageScale}
                  borderStroke={color}
                  borderStrokeWidth={1 / stageScale}
                />
              );
            })()}
          </Layer>
        </Stage>

        {/* HTML Node Layer */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: `translate(${stagePos.x}px, ${stagePos.y}px) scale(${stageScale})`, transformOrigin: '0 0' }}
        >
          {/* Groups (Drawn behind Nodes) */}
          {groups.map(group => (
            <div
              key={group.id}
              style={{
                position: 'absolute',
                left: group.nodeX, top: group.nodeY,
                width: group.nodeWidth, height: group.nodeHeight,
                backgroundColor: group.color + '0A',
                border: `2px dashed ${group.color}66`,
                borderRadius: 16,
                pointerEvents: 'auto',
                zIndex: 10
              }}
              className={`group ${selectedIds.includes(group.id) ? 'ring-2 ring-white/50' : ''}`}
              onPointerDown={(e) => handleNodePointerDown(e, group)}
            >
              {/* Group Header */}
              <div
                className="absolute top-0 left-0 right-0 h-10 px-4 flex items-center justify-between cursor-grab active:cursor-grabbing rounded-t-[14px]"
                style={{ backgroundColor: group.color + '26', borderBottom: `1px solid ${group.color}40` }}
              >
                <input
                  value={group.name}
                  size={Math.max(1, group.name.length)}
                  onChange={(e) => {
                    if (selectedIds.includes(group.id)) handleBulkUpdate(selectedIds, { name: e.target.value });
                    else handleUpdate(group.id, { name: e.target.value });
                  }}
                  onBlur={(e) => {
                    if (selectedIds.includes(group.id)) handleBulkUpdateEnd(selectedIds, { name: e.target.value });
                    else handleUpdateEnd(group.id, { name: e.target.value });
                  }}
                  className="bg-transparent font-bold outline-none text-white/90 focus:text-white cursor-text min-w-[2ch]"
                  style={{ fontSize: `${14 * textScale}px` }}
                  onPointerDown={e => e.stopPropagation()}
                />
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => handleDeleteMultiple(selectedIds.includes(group.id) ? selectedIds : [group.id])}
                  className="text-white/50 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14 * textScale} />
                </button>
              </div>
              {/* Resize Handles */}
              <div className="absolute -right-2 top-0 bottom-0 w-4 cursor-ew-resize" onPointerDown={e => handleGroupResizePointerDown(e, group, 'e')} />
              <div className="absolute -bottom-2 left-0 right-0 h-4 cursor-ns-resize" onPointerDown={e => handleGroupResizePointerDown(e, group, 's')} />
              <div className="absolute -right-2 -bottom-2 w-4 h-4 cursor-nwse-resize" onPointerDown={e => handleGroupResizePointerDown(e, group, 'se')} />
            </div>
          ))}

          {currentDrawingGroup && (
            <div
              style={{
                position: 'absolute',
                left: currentDrawingGroup.nodeX, top: currentDrawingGroup.nodeY,
                width: currentDrawingGroup.nodeWidth, height: currentDrawingGroup.nodeHeight,
                backgroundColor: currentDrawingGroup.color + '1A',
                border: `2px dashed ${currentDrawingGroup.color}`,
                borderRadius: 16,
                zIndex: 10
              }}
            />
          )}

          {/* Color Nodes */}
          {colorNodes.map(colorNode => (
            <div
              key={colorNode.id}
              className={`absolute pointer-events-auto ${selectedIds.includes(colorNode.id) ? 'z-50' : 'z-20'}`}
              style={{
                left: colorNode.nodeX, top: colorNode.nodeY,
                transform: `scale(${uiScale})`,
                transformOrigin: 'top left'
              }}
              onPointerDown={(e) => handleNodePointerDown(e, colorNode)}
            >
              <div className="group transition-transform duration-200 hover:-translate-y-4 relative">
                <div
                  className="w-48 bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl transition-shadow"
                  style={{
                    boxShadow: selectedIds.includes(colorNode.id) ? `0 0 0 2px #3b82f6, 0 10px 30px rgba(0,0,0,0.5)` : '0 10px 30px rgba(0,0,0,0.5)',
                    WebkitMaskImage: nodeMask,
                    maskImage: nodeMask,
                  }}
                >
                  {/* Transparent Handle Cutout */}
                  <div
                    className="h-12 w-full cursor-grab active:cursor-grabbing transition-colors hover:bg-white/5"
                    style={{ backgroundColor: '#3b82f633' }}
                  />
                  
                  <div
                    className="px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing"
                    style={{ backgroundColor: '#3b82f61A', borderBottom: `1px solid #3b82f640` }}
                  >
                    <span className="font-bold text-white/90 text-sm">Color</span>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => handleDeleteMultiple(selectedIds.includes(colorNode.id) ? selectedIds : [colorNode.id])}
                      className="text-white/50 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14 * textScale} />
                    </button>
                  </div>

                  <div className="p-3 flex flex-col gap-3 cursor-default" onPointerDown={e => e.stopPropagation()}>
                    {/* Color Preview */}
                    <div className="h-10 w-full rounded border border-white/10 shadow-inner" style={{ backgroundColor: getColorHex(colorNode) }} />
                    
                    {/* Dropdown */}
                    <select 
                      value={colorNode.colorMode} 
                      onChange={e => handleUpdateEnd(colorNode.id, { colorMode: e.target.value as any })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                    >
                      <option value="HSB">HSB</option>
                      <option value="HSL">HSL</option>
                      <option value="RGB">RGB</option>
                    </select>

                    {/* Sliders */}
                    <div className="flex flex-col gap-2">
                      {['channel1', 'channel2', 'channel3'].map((ch, i) => {
                        const max = colorNode.colorMode === 'RGB' ? 255 : (i === 0 ? 360 : 100);
                        const label = colorNode.colorMode[i];
                        return (
                          <div key={ch} className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 w-3">{label}</span>
                            <input 
                              type="range" min="0" max={max} 
                              value={colorNode[ch as keyof ColorNodeData] as number}
                              onChange={e => handleUpdate(colorNode.id, { [ch]: parseInt(e.target.value) })}
                              onMouseUp={e => handleUpdateEnd(colorNode.id, { [ch]: parseInt((e.target as HTMLInputElement).value) })}
                              className="flex-1 accent-blue-500"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Output Port (rendered outside the mask) */}
                <div
                  className="absolute -right-3 top-[60px] w-6 h-6 rounded-full cursor-crosshair border-4 border-[#1a1a1a] z-50 hover:scale-110 transition-transform shadow-lg"
                  style={{ backgroundColor: getColorHex(colorNode) }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDrawingWire({
                      sourceId: colorNode.id,
                      startX: colorNode.nodeX + (192 * uiScale),
                      startY: colorNode.nodeY + (72 * uiScale),
                      currentX: colorNode.nodeX + (192 * uiScale),
                      currentY: colorNode.nodeY + (72 * uiScale)
                    });
                  }}
                />
              </div>
            </div>
          ))}

          {/* Nodes */}
          {nodes.map(node => {
            const colorNode = elements.find(e => e.id === node.colorNodeId) as ColorNodeData | undefined;
            const portColor = colorNode ? getColorHex(colorNode) : '#52525b';

            return (
              <div
                key={node.id}
                className={`absolute pointer-events-auto ${selectedIds.includes(node.id) ? 'z-50' : 'z-20'}`}
                style={{
                  left: node.nodeX, top: node.nodeY,
                  transform: `scale(${uiScale})`,
                  transformOrigin: 'top left'
                }}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
              >
                <div className="group transition-transform duration-200 hover:-translate-y-4 relative">
                  <div
                    className="w-48 bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl transition-shadow"
                    style={{
                      boxShadow: selectedIds.includes(node.id) ? `0 0 0 2px ${node.highlightColor}, 0 10px 30px rgba(0,0,0,0.5)` : '0 10px 30px rgba(0,0,0,0.5)',
                      WebkitMaskImage: nodeMask,
                      maskImage: nodeMask,
                    }}
                  >
                    {/* Transparent Handle Cutout */}
                    <div
                      className="h-12 w-full cursor-grab active:cursor-grabbing transition-colors hover:bg-white/5"
                      style={{ backgroundColor: node.highlightColor + '33' }}
                    />
                    
                    <div
                      className="px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing"
                      style={{ backgroundColor: node.highlightColor + '1A', borderBottom: `1px solid ${node.highlightColor}40` }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => {
                            if (selectedIds.includes(node.id)) handleBulkUpdateEnd(selectedIds, { visible: !node.visible });
                            else handleUpdateEnd(node.id, { visible: !node.visible });
                          }}
                          className="text-white/70 hover:text-white transition-colors"
                        >
                          {node.visible ? <Eye size={14 * textScale} /> : <EyeOff size={14 * textScale} />}
                        </button>
                        <input
                          value={node.name}
                          size={Math.max(1, node.name.length)}
                          onChange={(e) => {
                            if (selectedIds.includes(node.id)) handleBulkUpdate(selectedIds, { name: e.target.value });
                            else handleUpdate(node.id, { name: e.target.value });
                          }}
                          onBlur={(e) => {
                            if (selectedIds.includes(node.id)) handleBulkUpdateEnd(selectedIds, { name: e.target.value });
                            else handleUpdateEnd(node.id, { name: e.target.value });
                          }}
                          className="bg-transparent font-bold outline-none text-white/90 focus:text-white cursor-text min-w-[2ch]"
                          style={{ fontSize: `${14 * textScale}px` }}
                          onPointerDown={e => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative rounded-full border border-white/20 cursor-pointer" style={{ backgroundColor: node.highlightColor, width: 16 * textScale, height: 16 * textScale }}>
                          <input
                            type="color"
                            value={node.highlightColor}
                            onChange={(e) => {
                              if (selectedIds.includes(node.id)) handleBulkUpdate(selectedIds, { highlightColor: e.target.value });
                              else handleUpdate(node.id, { highlightColor: e.target.value });
                            }}
                            onBlur={(e) => {
                              if (selectedIds.includes(node.id)) handleBulkUpdateEnd(selectedIds, { highlightColor: e.target.value });
                              else handleUpdateEnd(node.id, { highlightColor: e.target.value });
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            onPointerDown={e => e.stopPropagation()}
                          />
                        </div>
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => handleDeleteMultiple(selectedIds.includes(node.id) ? selectedIds : [node.id])}
                          className="text-white/50 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14 * textScale} />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 flex flex-col gap-2 cursor-default" onPointerDown={e => e.stopPropagation()}>
                      <ScrubbableInput textScale={textScale} label="Width" value={node.width} onChange={v => selectedIds.includes(node.id) ? handleBulkUpdate(selectedIds, { width: v }) : handleUpdate(node.id, { width: v })} onCommit={v => selectedIds.includes(node.id) ? handleBulkUpdateEnd(selectedIds, { width: v }) : handleUpdateEnd(node.id, { width: v })} tooltip={TOOLTIPS.width} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                      <ScrubbableInput textScale={textScale} label="Height" value={node.height} onChange={v => selectedIds.includes(node.id) ? handleBulkUpdate(selectedIds, { height: v }) : handleUpdate(node.id, { height: v })} onCommit={v => selectedIds.includes(node.id) ? handleBulkUpdateEnd(selectedIds, { height: v }) : handleUpdateEnd(node.id, { height: v })} tooltip={TOOLTIPS.height} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                      <ScrubbableInput textScale={textScale} label="Left/Right" value={node.x} onChange={v => selectedIds.includes(node.id) ? handleBulkUpdate(selectedIds, { x: v }) : handleUpdate(node.id, { x: v })} onCommit={v => selectedIds.includes(node.id) ? handleBulkUpdateEnd(selectedIds, { x: v }) : handleUpdateEnd(node.id, { x: v })} tooltip={TOOLTIPS.leftRight} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                      <ScrubbableInput textScale={textScale} label="Up/Down" value={node.y} onChange={v => selectedIds.includes(node.id) ? handleBulkUpdate(selectedIds, { y: v }) : handleUpdate(node.id, { y: v })} onCommit={v => selectedIds.includes(node.id) ? handleBulkUpdateEnd(selectedIds, { y: v }) : handleUpdateEnd(node.id, { y: v })} tooltip={TOOLTIPS.upDown} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                      <ScrubbableInput textScale={textScale} label="Depth" value={node.depth} onChange={v => selectedIds.includes(node.id) ? handleBulkUpdate(selectedIds, { depth: v }) : handleUpdate(node.id, { depth: v })} onCommit={v => selectedIds.includes(node.id) ? handleBulkUpdateEnd(selectedIds, { depth: v }) : handleUpdateEnd(node.id, { depth: v })} tooltip={TOOLTIPS.depth} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                      <ScrubbableInput textScale={textScale} label="Corner Roundness" value={node.cornerRadius} onChange={v => selectedIds.includes(node.id) ? handleBulkUpdate(selectedIds, { cornerRadius: v }) : handleUpdate(node.id, { cornerRadius: v })} onCommit={v => selectedIds.includes(node.id) ? handleBulkUpdateEnd(selectedIds, { cornerRadius: v }) : handleUpdateEnd(node.id, { cornerRadius: v })} tooltip={TOOLTIPS.cornerRoundness} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    </div>
                  </div>
                  
                  {/* Input Port */}
                  <div
                    className="absolute -left-3 top-[60px] w-6 h-6 rounded-full cursor-crosshair border-4 border-[#1a1a1a] z-50 hover:scale-110 transition-transform shadow-lg"
                    style={{ backgroundColor: portColor }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      if (drawingWire) {
                        handleUpdateEnd(node.id, { colorNodeId: drawingWire.sourceId });
                        setDrawingWire(null);
                      }
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (node.colorNodeId) {
                        handleUpdateEnd(node.id, { colorNodeId: undefined });
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right-Click Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="fixed z-[9999] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 w-48"
            style={{ 
              left: Math.min(contextMenu.x, window.innerWidth - 200), 
              top: Math.min(contextMenu.y, window.innerHeight - 200) 
            }}
            onPointerDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
          >
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mb-2"
            />
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {['Color Node'].filter(n => n.toLowerCase().includes(searchQuery.toLowerCase())).map(nodeName => (
                <button
                  key={nodeName}
                  onClick={() => spawnNode('color')}
                  className="text-left px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors"
                >
                  {nodeName}
                </button>
              ))}
              {['Color Node'].filter(n => n.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div className="text-xs text-zinc-500 px-3 py-2">No nodes found</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toolbar */}
      <div
        className="fixed bottom-8 left-1/2 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex items-center p-2 gap-1 z-50"
        style={{ transform: `translateX(-50%) scale(${uiScale})`, transformOrigin: 'bottom center' }}
      >
        <ToolButton icon={<MousePointer2 size={18} />} label="Select (V)" active={tool === 'select'} onClick={() => setTool('select')} />
        <ToolButton icon={<Hand size={18} />} label="Pan (H / Space)" active={tool === 'hand'} onClick={() => setTool('hand')} />
        <ToolButton icon={<ZoomIn size={18} />} label="Zoom (Z)" active={tool === 'zoom'} onClick={() => setTool('zoom')} />
        <div className="w-px h-6 bg-white/10 mx-2" />
        <ToolButton icon={<Square size={18} />} label="Node (R)" active={tool === 'node'} onClick={() => setTool('node')} />
        <ToolButton icon={<FolderPlus size={18} />} label="Group (G)" active={tool === 'group'} onClick={() => setTool('group')} />
        <div className="w-px h-6 bg-white/10 mx-2" />
        <ToolButton icon={<Settings size={18} />} label="Settings" active={isSettingsOpen} onClick={() => setIsSettingsOpen(!isSettingsOpen)} />

        {/* Hidden Export Button for future functionality */}
        <button className="hidden" onClick={handleExport}>Export JSON</button>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 p-6 rounded-2xl shadow-2xl z-50 w-80"
          >
            <h3 className="text-white font-bold mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-2">
                  <span>UI Scale</span>
                  <span>{uiScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={uiScale}
                  onChange={e => setUiScale(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-2">
                  <span>Text Scale</span>
                  <span>{textScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={textScale}
                  onChange={e => setTextScale(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="mt-6 w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Tool Button Component ---
const ToolButton = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <div className="relative group">
    <button
      onClick={onClick}
      className={`p-3 rounded-xl transition-all flex items-center justify-center ${active ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
    >
      {icon}
    </button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
      {label}
    </div>
  </div>
);
