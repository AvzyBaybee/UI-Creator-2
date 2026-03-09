import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer, Text, Group } from 'react-konva';
import { Rectangle, Tool, CanvasElement, GroupData } from './types';
import { Trash2, MousePointer2, Square, Eye, EyeOff, FolderPlus, Hand, ZoomIn, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_ELEMENTS: CanvasElement[] = [];

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
          className="bg-zinc-800 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-white/10 max-w-[200px] leading-relaxed"
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
  const [tool, setTool] = useState<Tool>('select');
  const [prevTool, setPrevTool] = useState<Tool>('select');
  const [tooltip, setTooltip] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });

  const [uiScale, setUiScale] = useState(1);
  const [textScale, setTextScale] = useState(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingGroup, setIsDrawingGroup] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isZooming, setIsZooming] = useState(false);

  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [newRectStart, setNewRectStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrawingRect, setCurrentDrawingRect] = useState<Rectangle | null>(null);
  const [currentDrawingGroup, setCurrentDrawingGroup] = useState<GroupData | null>(null);
  const [transformingRect, setTransformingRect] = useState<Rectangle | null>(null);
  const zoomStartRef = useRef<{ clientX: number, scale: number, mousePointTo: { x: number, y: number } } | null>(null);

  const lastHueRef = useRef<number>(Math.floor(Math.random() * 360));
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

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

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.length > 0) {
        handleDeleteMultiple(selectedIds);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      }

      if (e.code === 'Space' && tool !== 'hand') {
        setPrevTool(tool);
        setTool('hand');
      }
      if (e.key.toLowerCase() === 'z' && tool !== 'zoom') {
        setPrevTool(tool);
        setTool('zoom');
      }
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'r') setTool('rectangle');
      if (e.key.toLowerCase() === 'g') setTool('group');
      if (e.key.toLowerCase() === 'h') setTool('hand');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'Space' && tool === 'hand') {
        setTool(prevTool);
      }
      if (e.key.toLowerCase() === 'z' && tool === 'zoom') {
        setTool(prevTool);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, undo, redo, tool, prevTool]);

  useEffect(() => {
    if (trRef.current && selectedIds.length > 0) {
      const nodes = selectedIds.map(id => stageRef.current.findOne('#' + id)).filter(Boolean);
      trRef.current.nodes(nodes);
      trRef.current.getLayer().batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selectedIds, elements]);

  const getNextDefaultName = (type: 'rectangle' | 'group') => {
    let i = 1;
    const prefix = type === 'rectangle' ? 'Rectangle' : 'Group';
    while (elements.some(e => e.name.toLowerCase() === `${prefix.toLowerCase()} ${i}`)) i++;
    return `${prefix} ${i}`;
  };

  const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
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

  const handleStagePointerDown = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const worldPos = transformPoint(pos);

    if (tool === 'zoom') {
      setIsZooming(true);
      zoomStartRef.current = {
        clientX: e.evt.clientX,
        scale: stageScale,
        mousePointTo: worldPos
      };
    } else if (tool === 'rectangle') {
      setIsDrawing(true);
      setNewRectStart(worldPos);
      const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;
      setCurrentDrawingRect({
        id: `rect-temp`,
        name: '',
        type: 'rectangle',
        x: worldPos.x, y: worldPos.y, width: 0, height: 0,
        nodeX: worldPos.x, nodeY: worldPos.y,
        fill: 'rgba(59, 130, 246, 0.2)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        visible: true,
        depth: maxDepth + 1,
        cornerRadius: 0,
        highlightColor: '#3b82f6'
      });
    } else if (tool === 'group') {
      setIsDrawingGroup(true);
      setNewRectStart(worldPos);
      const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;
      setCurrentDrawingGroup({
        id: `group-temp`,
        name: '',
        type: 'group',
        nodeX: worldPos.x, nodeY: worldPos.y, nodeWidth: 0, nodeHeight: 0,
        color: '#3b82f6',
        expanded: true,
        visible: true,
        depth: maxDepth + 1
      });
    } else if (tool === 'select') {
      if (e.target === stage) {
        setIsSelecting(true);
        setSelectionStart(worldPos);
        setSelectionRect({ x: worldPos.x, y: worldPos.y, width: 0, height: 0 });
        setSelectedIds([]);
      }
    }
  };

  const handleStagePointerMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const worldPos = transformPoint(pos);

    if (isZooming && zoomStartRef.current) {
      const dx = e.evt.clientX - zoomStartRef.current.clientX;
      const newScale = Math.max(0.1, Math.min(zoomStartRef.current.scale * (1 + dx * 0.01), 5));
      const newPos = {
        x: pos.x - zoomStartRef.current.mousePointTo.x * newScale,
        y: pos.y - zoomStartRef.current.mousePointTo.y * newScale,
      };
      setStageScale(newScale);
      setStagePos(newPos);
    } else if (isDrawing && newRectStart && currentDrawingRect) {
      setCurrentDrawingRect({
        ...currentDrawingRect,
        x: Math.min(newRectStart.x, worldPos.x),
        y: Math.min(newRectStart.y, worldPos.y),
        width: Math.abs(worldPos.x - newRectStart.x),
        height: Math.abs(worldPos.y - newRectStart.y),
      });
    } else if (isDrawingGroup && newRectStart && currentDrawingGroup) {
      setCurrentDrawingGroup({
        ...currentDrawingGroup,
        nodeX: Math.min(newRectStart.x, worldPos.x),
        nodeY: Math.min(newRectStart.y, worldPos.y),
        nodeWidth: Math.abs(worldPos.x - newRectStart.x),
        nodeHeight: Math.abs(worldPos.y - newRectStart.y),
      });
    } else if (isSelecting && selectionStart) {
      setSelectionRect({
        x: Math.min(selectionStart.x, worldPos.x),
        y: Math.min(selectionStart.y, worldPos.y),
        width: Math.abs(worldPos.x - selectionStart.x),
        height: Math.abs(worldPos.y - selectionStart.y),
      });
    }
  };

  const handleStagePointerUp = () => {
    if (isZooming) {
      setIsZooming(false);
      zoomStartRef.current = null;
    } else if (isDrawing && currentDrawingRect) {
      if (currentDrawingRect.width > 5 && currentDrawingRect.height > 5) {
        const finalRect: Rectangle = {
          ...currentDrawingRect,
          id: `rect-${Date.now()}`,
          name: getNextDefaultName('rectangle'),
          highlightColor: generateDistinctColor(),
          nodeX: currentDrawingRect.x + currentDrawingRect.width + 40,
          nodeY: currentDrawingRect.y
        };
        pushToHistory([...elements, finalRect]);
        setSelectedIds([finalRect.id]);
      }
      setIsDrawing(false);
      setNewRectStart(null);
      setCurrentDrawingRect(null);
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
      setNewRectStart(null);
      setCurrentDrawingGroup(null);
    } else if (isSelecting && selectionRect) {
      const selected = elements.filter(el => {
        if (el.type !== 'rectangle') return false;
        const r = el as Rectangle;
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

  const checkGroupIntersection = useCallback((nodeId: string) => {
    const currentElements = elementsRef.current;
    const node = currentElements.find(e => e.id === nodeId);
    if (!node) return;

    const nodeCenterX = node.nodeX + 96; // approx half of w-48
    const nodeCenterY = node.nodeY + 20;

    const groups = currentElements.filter(e => e.type === 'group') as GroupData[];
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
      const newElements = currentElements.map(e => e.id === nodeId ? { ...e, parentId: foundGroupId } : e);
      pushToHistory(newElements);
    } else {
      pushToHistory(currentElements);
    }
  }, [pushToHistory]);

  const handleNodePointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    if (tool === 'hand' || tool === 'zoom') return;
    e.stopPropagation();

    if (e.shiftKey) {
      setSelectedIds(prev => prev.includes(el.id) ? prev.filter(id => id !== el.id) : [...prev, el.id]);
    } else if (!selectedIds.includes(el.id)) {
      setSelectedIds([el.id]);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const startNodeX = el.nodeX;
    const startNodeY = el.nodeY;

    const children = el.type === 'group' ? elementsRef.current.filter(c => c.parentId === el.id) : [];
    const childStarts = children.map(c => ({ id: c.id, x: c.nodeX, y: c.nodeY }));

    const onPointerMove = (moveEvt: PointerEvent) => {
      const dx = (moveEvt.clientX - startX) / stageScale;
      const dy = (moveEvt.clientY - startY) / stageScale;

      setElements(prev => prev.map(p => {
        if (p.id === el.id) return { ...p, nodeX: startNodeX + dx, nodeY: startNodeY + dy };
        const childStart = childStarts.find(c => c.id === p.id);
        if (childStart) return { ...p, nodeX: childStart.x + dx, nodeY: childStart.y + dy };
        return p;
      }));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (el.type !== 'group') {
        checkGroupIntersection(el.id);
      } else {
        pushToHistory(elementsRef.current);
      }
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
      const dx = (moveEvt.clientX - startX) / stageScale;
      const dy = (moveEvt.clientY - startY) / stageScale;
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

  const handleDeleteMultiple = (ids: string[]) => {
    const newElements = elements.filter(el => !ids.includes(el.id) && (!el.parentId || !ids.includes(el.parentId)));
    pushToHistory(newElements);
    setSelectedIds([]);
  };

  const applyConstraints = (rect: Rectangle, updates: Partial<Rectangle>): Rectangle => {
    const next = { ...rect, ...updates };
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
        if (el.type === 'rectangle') return applyConstraints(el as Rectangle, updates as Partial<Rectangle>);
        return { ...el, ...updates } as GroupData;
      }
      return el;
    });
    setElements(newElements);
  };

  const handleUpdateEnd = (id: string, updates: Partial<CanvasElement>) => {
    const targetElement = elements.find(el => el.id === id);
    if (!targetElement) return;
    const newElements = elements.map(el => {
      if (el.id === id) {
        if (el.type === 'rectangle') return applyConstraints(el as Rectangle, updates as Partial<Rectangle>);
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
    if (el && el.type === 'rectangle') {
      setTransformingRect({
        ...(el as Rectangle),
        x: node.x(),
        y: node.y(),
        width: Math.round(node.width() * node.scaleX()),
        height: Math.round(node.height() * node.scaleY()),
      });
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    const id = node.id();
    const el = elements.find(r => r.id === id);
    if (el && el.type === 'rectangle') {
      const updates = {
        x: node.x(),
        y: node.y(),
        width: Math.round(node.width() * node.scaleX()),
        height: Math.round(node.height() * node.scaleY()),
      };
      node.scaleX(1);
      node.scaleY(1);
      handleUpdateEnd(id, updates);
      setTransformingRect(null);
    }
  };

  const handleDragMove = (e: any) => {
    const node = e.target;
    const id = node.id();
    if (!selectedIds.includes(id)) return;

    const targetEl = elements.find(el => el.id === id);
    if (!targetEl || targetEl.type !== 'rectangle') return;
    const targetRect = targetEl as Rectangle;

    const dx = node.x() - targetRect.x;
    const dy = node.y() - targetRect.y;

    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        if (el.type === 'rectangle') {
          const r = el as Rectangle;
          return { ...r, x: el.id === id ? node.x() : r.x + dx, y: el.id === id ? node.y() : r.y + dy };
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

  const sortedRects = useMemo(() => elements.filter(e => e.type === 'rectangle').sort((a, b) => a.depth - b.depth), [elements]);
  const groups = useMemo(() => elements.filter(e => e.type === 'group') as GroupData[], [elements]);
  const nodes = useMemo(() => elements.filter(e => e.type === 'rectangle') as Rectangle[], [elements]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-300 font-sans overflow-hidden select-none">
      <CursorTooltip text={tooltip.text} visible={tooltip.visible} />

      {/* World Area */}
      <div
        className="flex-1 relative bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:40px_40px]"
        style={{ backgroundPosition: `${stagePos.x * stageScale}px ${stagePos.y * stageScale}px`, backgroundSize: `${40 * stageScale}px ${40 * stageScale}px` }}
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
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          ref={stageRef}
          className="absolute inset-0 z-0"
        >
          <Layer>
            {sortedRects.map((el) => {
              const rect = el as Rectangle;
              return (
                <Rect
                  key={rect.id}
                  id={rect.id}
                  {...rect}
                  cornerRadius={rect.cornerRadius}
                  draggable={tool === 'select'}
                  onDragMove={handleDragMove}
                  onDragEnd={() => pushToHistory(elementsRef.current)}
                  onTransform={handleTransform}
                  onTransformEnd={handleTransformEnd}
                  onClick={(e) => {
                    if (tool !== 'select') return;
                    if (e.evt.shiftKey) {
                      setSelectedIds(prev => prev.includes(rect.id) ? prev.filter(id => id !== rect.id) : [...prev, rect.id]);
                    } else {
                      setSelectedIds([rect.id]);
                    }
                  }}
                  strokeScaleEnabled={false}
                  stroke={selectedIds.includes(rect.id) ? rect.highlightColor : rect.stroke}
                  strokeWidth={selectedIds.includes(rect.id) ? 4 / stageScale : rect.strokeWidth}
                  opacity={rect.visible ? 1 : 0}
                />
              );
            })}

            {currentDrawingRect && <Rect {...currentDrawingRect} />}

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

            {(transformingRect || currentDrawingRect) && (() => {
              const rect = transformingRect || currentDrawingRect;
              if (!rect) return null;
              return (
                <Group>
                  <Text x={rect.x + rect.width / 2 - 30} y={rect.y - 25 / stageScale} text={`${rect.width} px`} fill={rect.highlightColor} fontSize={11 / stageScale} fontStyle="bold" align="center" />
                  <Text x={rect.x + rect.width + 10 / stageScale} y={rect.y + rect.height / 2 - 6 / stageScale} text={`${rect.height} px`} fill={rect.highlightColor} fontSize={11 / stageScale} fontStyle="bold" />
                </Group>
              );
            })()}

            {selectedIds.length > 0 && tool === 'select' && (() => {
              const selectedEl = elements.find(el => el.id === selectedIds[0]);
              if (!selectedEl || selectedEl.type !== 'rectangle') return null;
              const color = (selectedEl as Rectangle).highlightColor || "#3b82f6";
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
                  onChange={(e) => handleUpdate(group.id, { name: e.target.value })}
                  onBlur={(e) => handleUpdateEnd(group.id, { name: e.target.value })}
                  className="bg-transparent font-bold outline-none text-white/90 focus:text-white cursor-text min-w-[2ch]"
                  style={{ fontSize: `${14 * textScale}px` }}
                  onPointerDown={e => e.stopPropagation()}
                />
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => handleDeleteMultiple([group.id])}
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

          {/* Nodes */}
          {nodes.map(node => (
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
              <div className="group transition-transform duration-200 hover:-translate-y-4">
                <div
                  className="w-48 bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl transition-shadow"
                  style={{
                    boxShadow: selectedIds.includes(node.id) ? `0 0 0 2px ${node.highlightColor}, 0 10px 30px rgba(0,0,0,0.5)` : '0 10px 30px rgba(0,0,0,0.5)'
                  }}
                >
                  {/* Expanding Hover Handle */}
                  <div
                    className="h-0 group-hover:h-4 transition-all duration-200 cursor-grab w-full"
                    style={{ backgroundColor: node.highlightColor + '33' }}
                  />
                  <div
                    className="px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing"
                    style={{ backgroundColor: node.highlightColor + '33', borderBottom: `1px solid ${node.highlightColor}40` }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => handleUpdateEnd(node.id, { visible: !node.visible })}
                        className="text-white/70 hover:text-white transition-colors"
                      >
                        {node.visible ? <Eye size={14 * textScale} /> : <EyeOff size={14 * textScale} />}
                      </button>
                      <input
                        value={node.name}
                        size={Math.max(1, node.name.length)}
                        onChange={(e) => handleUpdate(node.id, { name: e.target.value })}
                        onBlur={(e) => handleUpdateEnd(node.id, { name: e.target.value })}
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
                          onChange={(e) => handleUpdate(node.id, { highlightColor: e.target.value })}
                          onBlur={(e) => handleUpdateEnd(node.id, { highlightColor: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          onPointerDown={e => e.stopPropagation()}
                        />
                      </div>
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => handleDeleteMultiple([node.id])}
                        className="text-white/50 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14 * textScale} />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 flex flex-col gap-2 cursor-default" onPointerDown={e => e.stopPropagation()}>
                    <ScrubbableInput textScale={textScale} label="Width" value={node.width} onChange={v => handleUpdate(node.id, { width: v })} onCommit={v => handleUpdateEnd(node.id, { width: v })} tooltip="Width of rectangle" showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    <ScrubbableInput textScale={textScale} label="Height" value={node.height} onChange={v => handleUpdate(node.id, { height: v })} onCommit={v => handleUpdateEnd(node.id, { height: v })} tooltip="Height of rectangle" showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    <ScrubbableInput textScale={textScale} label="X Pos" value={node.x} onChange={v => handleUpdate(node.id, { x: v })} onCommit={v => handleUpdateEnd(node.id, { x: v })} tooltip="Horizontal position" showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    <ScrubbableInput textScale={textScale} label="Y Pos" value={node.y} onChange={v => handleUpdate(node.id, { y: v })} onCommit={v => handleUpdateEnd(node.id, { y: v })} tooltip="Vertical position" showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    <ScrubbableInput textScale={textScale} label="Depth" value={node.depth} onChange={v => handleUpdate(node.id, { depth: v })} onCommit={v => handleUpdateEnd(node.id, { depth: v })} tooltip="Layer rendering order" showTooltip={showTooltip} hideTooltip={hideTooltip} />
                    <ScrubbableInput textScale={textScale} label="Radius" value={node.cornerRadius} onChange={v => handleUpdate(node.id, { cornerRadius: v })} onCommit={v => handleUpdateEnd(node.id, { cornerRadius: v })} tooltip="Corner roundness" showTooltip={showTooltip} hideTooltip={hideTooltip} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Toolbar */}
      <div
        className="fixed bottom-8 left-1/2 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex items-center p-2 gap-1 z-50"
        style={{ transform: `translateX(-50%) scale(${uiScale})`, transformOrigin: 'bottom center' }}
      >
        <ToolButton icon={<MousePointer2 size={18} />} label="Select (V)" active={tool === 'select'} onClick={() => setTool('select')} />
        <ToolButton icon={<Hand size={18} />} label="Pan (H / Space)" active={tool === 'hand'} onClick={() => setTool('hand')} />
        <ToolButton icon={<ZoomIn size={18} />} label="Zoom (Z)" active={tool === 'zoom'} onClick={() => setTool('zoom')} />
        <div className="w-px h-6 bg-white/10 mx-2" />
        <ToolButton icon={<Square size={18} />} label="Rectangle (R)" active={tool === 'rectangle'} onClick={() => setTool('rectangle')} />
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
