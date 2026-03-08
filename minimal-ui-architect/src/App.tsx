import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer, Text, Group } from 'react-konva';
import { Rectangle, Tool, CanvasElement, GroupData } from './types';
import { Plus, Trash2, Download, Layers, MousePointer2, Square, Eye, EyeOff, Info, ChevronDown, ChevronRight, RotateCcw, RotateCw, FolderPlus, Folder } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
}

const ScrubbableInput: React.FC<ScrubbableInputProps> = ({
  value, onChange, onCommit, label, tooltip, showTooltip, hideTooltip, onHoverStart, onHoverEnd
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const isDragging = useRef(false);
  const startVal = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMovementX = useRef(0);

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
    if (isEditing) return;
    const initialX = e.clientX;
    const initialY = e.clientY;
    isDragging.current = false;
    startVal.current = value;
    lastMovementX.current = 0;

    const handleMouseMove = (me: MouseEvent) => {
      if (!isDragging.current) {
        const dist = Math.sqrt(Math.pow(me.clientX - initialX, 2) + Math.pow(me.clientY - initialY, 2));
        if (dist > 3) {
          isDragging.current = true;
          containerRef.current?.requestPointerLock();
        }
      }

      if (isDragging.current) {
        // Use movementX for relative movement when locked
        // Cap movementX to prevent "shooting" if browser reports huge values
        let movementX = me.movementX || 0;

        // Some browsers might report a huge jump on the first frame of lock
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
    <div className="flex items-center justify-between group/scrub">
      <label
        className="text-[11px] text-zinc-400 flex items-center gap-1 cursor-help select-none"
        onMouseEnter={() => {
          showTooltip(tooltip);
          onHoverStart?.();
        }}
        onMouseLeave={() => {
          hideTooltip();
          onHoverEnd?.();
        }}
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
          className="bg-blue-500/20 border border-blue-500/50 rounded px-2 py-1 text-[11px] w-16 text-right outline-none text-white"
        />
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseEnter={onHoverStart}
          onMouseLeave={onHoverEnd}
          className="bg-black/40 border border-white/5 rounded px-2 py-1 text-[11px] w-16 text-right cursor-ew-resize select-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          {Math.round(value)}
        </div>
      )}
    </div>
  );
};

// --- Sortable Element Component ---
interface SortableElementProps {
  el: CanvasElement;
  depth: number;
  isSelected: boolean;
  isHovered: boolean;
  isExpanded: boolean;
  highlightColor: string;
  onSelect: (e: React.MouseEvent) => void;
  onHover: (id: string | null) => void;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<CanvasElement>) => void;
  onUpdateEnd: (updates: Partial<CanvasElement>) => void;
  onDelete: () => void;
  showTooltip: (text: string) => void;
  hideTooltip: () => void;
  isOverlay?: boolean;
}

const SortableElement = ({
  el,
  depth,
  isSelected,
  isHovered,
  isExpanded,
  highlightColor,
  onSelect,
  onHover,
  onToggleExpand,
  onUpdate,
  onUpdateEnd,
  onDelete,
  showTooltip,
  hideTooltip,
  isOverlay = false,
}: SortableElementProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: el.id, disabled: isOverlay });

  // We use Framer Motion for the actual 'sliding' animation during swaps.
  // dnd-kit's transform is used only for the element being actively dragged.
  const motionStyle = {
    transform: isDragging ? CSS.Translate.toString(transform) : undefined,
    marginLeft: depth * 12,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isOverlay ? 1000 : (isDragging ? 100 : 1),
    position: 'relative' as const,
    cursor: isDragging ? 'grabbing' : 'grab',
    scale: isOverlay ? '1.05' : '1',
  };

  const content = (
    <div
      id={`element-item-${el.id}`}
      onClick={onSelect}
      onMouseEnter={() => !isOverlay && onHover(el.id)}
      onMouseLeave={() => !isOverlay && onHover(null)}
      {...(!isOverlay ? attributes : {})}
      {...(!isOverlay ? listeners : {})}
      className={`group rounded-xl border bg-[#1a1a1a] overflow-hidden transition-all duration-200 ${isSelected
        ? 'border-[2px] shadow-lg'
        : isHovered
          ? 'border border-white/20'
          : 'border border-white/5'
        } ${isOverlay ? 'shadow-2xl ring-2 ring-white/20' : ''}`}
      style={{
        borderColor: isSelected || isHovered ? highlightColor : undefined,
        boxShadow: isSelected ? `0 10px 25px -5px ${highlightColor}20` : (isOverlay ? '0 20px 40px rgba(0,0,0,0.5)' : undefined),
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onUpdateEnd({ visible: !el.visible }); }}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: el.visible ? highlightColor : '#52525b' }}
          >
            {el.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="text-zinc-500 hover:text-white"
          >
            {el.type === 'group' ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <div className="w-[14px]" />}
          </button>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="flex-1 min-w-0 flex items-center">
              <input
                type="text"
                value={el.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                onBlur={(e) => onUpdateEnd({ name: e.target.value })}
                className="bg-transparent border-none outline-none text-xs font-semibold w-fit max-w-full focus:text-white truncate cursor-text"
                onClick={(e) => e.stopPropagation()}
                style={{ width: `${Math.max(el.name.length, 1)}ch` }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {el.type === 'rectangle' && (
            <div className="relative group/color opacity-0 group-hover:opacity-100 transition-opacity">
              <div
                className="w-3 h-3 rounded-full border border-white/20 cursor-pointer"
                style={{ backgroundColor: (el as Rectangle).highlightColor }}
              />
              <input
                type="color"
                value={(el as Rectangle).highlightColor.startsWith('#') ? (el as Rectangle).highlightColor : '#3b82f6'}
                onChange={(e) => onUpdate({ highlightColor: e.target.value })}
                onBlur={(e) => onUpdateEnd({ highlightColor: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && el.type === 'rectangle' && (
          <div
            className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <ScrubbableInput
                label="Width"
                value={(el as Rectangle).width}
                onChange={(val) => onUpdate({ width: val })}
                onCommit={(val) => onUpdateEnd({ width: val })}
                tooltip="How wide it is."
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
              <ScrubbableInput
                label="Height"
                value={(el as Rectangle).height}
                onChange={(val) => onUpdate({ height: val })}
                onCommit={(val) => onUpdateEnd({ height: val })}
                tooltip="How tall it is."
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
              <ScrubbableInput
                label="Up-Down"
                value={(el as Rectangle).y}
                onChange={(val) => onUpdate({ y: val })}
                onCommit={(val) => onUpdateEnd({ y: val })}
                tooltip="Where it is vertically."
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
              <ScrubbableInput
                label="Left-Right"
                value={(el as Rectangle).x}
                onChange={(val) => onUpdate({ x: val })}
                onCommit={(val) => onUpdateEnd({ x: val })}
                tooltip="Where it is horizontally."
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-white/5">
              <ScrubbableInput
                label="Depth"
                value={el.depth}
                onChange={(val) => onUpdate({ depth: val })}
                onCommit={(val) => onUpdateEnd({ depth: val })}
                tooltip="Layer order (higher = on top). Example: Depth 1 is bottom, Depth 10 is top."
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
              <ScrubbableInput
                label="Corner"
                value={(el as Rectangle).cornerRadius}
                onChange={(val) => onUpdate({ cornerRadius: val })}
                onCommit={(val) => onUpdateEnd({ cornerRadius: val })}
                tooltip="How rounded the corners are."
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );

  if (isOverlay) return content;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 40,
        mass: 0.8,
        // Disable layout transition for the item being dragged so it follows the pointer 1:1
        layout: isDragging ? { duration: 0 } : undefined
      }}
      style={motionStyle}
      className="space-y-1"
    >
      {content}
    </motion.div>
  );
};

export default function App() {
  const [elements, setElements] = useState<CanvasElement[]>(INITIAL_ELEMENTS);
  const [history, setHistory] = useState<CanvasElement[][]>([INITIAL_ELEMENTS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });
  const [hoveredProperty, setHoveredProperty] = useState<{ id: string; type: string } | null>(null);

  const lastHueRef = useRef<number>(Math.floor(Math.random() * 360));

  const panelScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected element in panel
  useEffect(() => {
    if (selectedIds.length === 1 && isPanelOpen) {
      const element = document.getElementById(`element-item-${selectedIds[0]}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedIds, isPanelOpen]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [newRectStart, setNewRectStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrawingRect, setCurrentDrawingRect] = useState<Rectangle | null>(null);
  const [transformingRect, setTransformingRect] = useState<Rectangle | null>(null);

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handlePanelDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handlePanelDragOver = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    setElements((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === activeId);
      const newIndex = prev.findIndex((item) => item.id === overId);

      if (oldIndex === -1 || newIndex === -1) return prev;
      if (oldIndex === newIndex) return prev;

      // Optional: Update parentId if hovering over a different hierarchy level
      // but for simple sliding, arrayMove is usually enough.
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handlePanelDragEnd = (event: any) => {
    setActiveId(null);
    pushToHistory(elements);
  };

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
      // Delete/Backspace
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.length > 0) {
        // Check if we are typing in an input
        if (document.activeElement?.tagName === 'INPUT') return;
        handleDeleteMultiple(selectedIds);
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      }

      // Tool shortcuts
      if (document.activeElement?.tagName !== 'INPUT') {
        if (e.key.toLowerCase() === 'v') {
          setTool('select');
        }
        if (e.key.toLowerCase() === 'r') {
          setTool('rectangle');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, undo, redo]);

  // Sort elements by depth for rendering
  const sortedElements = useMemo(() => {
    return [...elements].sort((a, b) => a.depth - b.depth);
  }, [elements]);

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
    while (elements.some(e => e.name.toLowerCase() === `${prefix.toLowerCase()} ${i}`)) {
      i++;
    }
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
    // Ensure the new hue is at least 60 degrees away from the last one
    // This creates a "really different" color each time.
    const step = 60 + Math.random() * 120;
    const h = (lastHueRef.current + step) % 360;
    lastHueRef.current = h;

    const s = 65 + Math.random() * 20; // 65-85% saturation
    const l = 50 + Math.random() * 10; // 50-60% brightness
    return hslToHex(h, s, l);
  }, []);

  const handleStageMouseDown = (e: any) => {
    if (tool === 'rectangle') {
      const pos = e.target.getStage().getPointerPosition();
      setIsDrawing(true);
      setNewRectStart(pos);
      const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;
      setCurrentDrawingRect({
        id: `rect-temp`,
        name: '',
        type: 'rectangle',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        fill: 'rgba(59, 130, 246, 0.2)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        visible: true,
        depth: maxDepth + 1,
        cornerRadius: 0,
        highlightColor: '#3b82f6'
      });
    } else if (e.target === e.target.getStage()) {
      const pos = e.target.getStage().getPointerPosition();
      setIsSelecting(true);
      setSelectionStart(pos);
      setSelectionRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
      setSelectedIds([]);
    }
  };

  const handleStageMouseMove = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();

    if (isDrawing && newRectStart && currentDrawingRect) {
      setCurrentDrawingRect({
        ...currentDrawingRect,
        x: Math.min(newRectStart.x, pos.x),
        y: Math.min(newRectStart.y, pos.y),
        width: Math.abs(pos.x - newRectStart.x),
        height: Math.abs(pos.y - newRectStart.y),
      });
    } else if (isSelecting && selectionStart) {
      setSelectionRect({
        x: Math.min(selectionStart.x, pos.x),
        y: Math.min(selectionStart.y, pos.y),
        width: Math.abs(pos.x - selectionStart.x),
        height: Math.abs(pos.y - selectionStart.y),
      });
    }
  };

  const handleStageMouseUp = () => {
    if (isDrawing && currentDrawingRect) {
      if (currentDrawingRect.width > 5 && currentDrawingRect.height > 5) {
        const finalRect: Rectangle = {
          ...currentDrawingRect,
          id: `rect-${Date.now()}`,
          name: getNextDefaultName('rectangle'),
          highlightColor: generateDistinctColor()
        };
        const newElements = [...elements, finalRect];
        pushToHistory(newElements);
        setSelectedIds([finalRect.id]);
        setExpandedIds(prev => {
          const next = new Set(prev);
          next.add(finalRect.id);
          return next;
        });
      }
      setIsDrawing(false);
      setNewRectStart(null);
      setCurrentDrawingRect(null);
    } else if (isSelecting && selectionRect) {
      const selected = elements.filter(el => {
        if (el.type !== 'rectangle') return false;
        const r = el as Rectangle;
        return r.visible &&
          r.x >= selectionRect.x &&
          r.y >= selectionRect.y &&
          r.x + r.width <= selectionRect.x + selectionRect.width &&
          r.y + r.height <= selectionRect.y + selectionRect.height;
      }).map(el => el.id);
      setSelectedIds(selected);
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionRect(null);
    }
  };

  const handleDelete = (id: string) => {
    const newElements = elements.filter(el => el.id !== id && el.parentId !== id);
    pushToHistory(newElements);
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleDeleteMultiple = (ids: string[]) => {
    const newElements = elements.filter(el => !ids.includes(el.id) && (!el.parentId || !ids.includes(el.parentId)));
    pushToHistory(newElements);
    setSelectedIds([]);
  };

  const applyConstraints = (rect: Rectangle, updates: Partial<Rectangle>): Rectangle => {
    const next = { ...rect, ...updates };

    // Width/Height cannot be negative
    if (next.width < 0) next.width = 0;
    if (next.height < 0) next.height = 0;

    // Corner radius clamping
    const maxRadius = Math.min(next.width, next.height) / 2;
    if (next.cornerRadius < 0) next.cornerRadius = 0;
    if (next.cornerRadius > maxRadius) next.cornerRadius = maxRadius;

    return next;
  };

  const handleUpdate = (id: string, updates: Partial<CanvasElement>) => {
    const targetElement = elements.find(el => el.id === id);
    if (!targetElement) return;

    const isBulkUpdate = selectedIds.includes(id) && selectedIds.length > 1;

    const newElements = elements.map(el => {
      if (el.id === id) {
        if (el.type === 'rectangle') {
          return applyConstraints(el as Rectangle, updates as Partial<Rectangle>);
        }
        return { ...el, ...updates } as GroupData;
      }

      if (isBulkUpdate && selectedIds.includes(el.id)) {
        const bulkUpdates: any = {};
        for (const key in updates) {
          if (key === 'name') continue; // Only change name of the clicked element

          if (el.type === 'rectangle' && targetElement.type === 'rectangle') {
            const r = el as Rectangle;
            const t = targetElement as Rectangle;
            const uk = key as keyof Rectangle;
            if (typeof (updates as any)[uk] === 'number' && typeof (r as any)[uk] === 'number' && typeof (t as any)[uk] === 'number') {
              const delta = ((updates as any)[uk] as number) - ((t as any)[uk] as number);
              bulkUpdates[uk] = ((r as any)[uk] as number) + delta;
            } else {
              bulkUpdates[uk] = (updates as any)[uk];
            }
          } else {
            bulkUpdates[key] = (updates as any)[key];
          }
        }

        if (el.type === 'rectangle') {
          return applyConstraints(el as Rectangle, bulkUpdates);
        }
        return { ...el, ...bulkUpdates } as GroupData;
      }

      return el;
    });
    setElements(newElements);
  };

  const handleUpdateEnd = (id: string, updates: Partial<CanvasElement>) => {
    const targetElement = elements.find(el => el.id === id);
    if (!targetElement) return;

    const isBulkUpdate = selectedIds.includes(id) && selectedIds.length > 1;

    const newElements = elements.map(el => {
      if (el.id === id) {
        if (el.type === 'rectangle') {
          return applyConstraints(el as Rectangle, updates as Partial<Rectangle>);
        }
        return { ...el, ...updates } as GroupData;
      }

      if (isBulkUpdate && selectedIds.includes(el.id)) {
        const bulkUpdates: any = {};
        for (const key in updates) {
          if (key === 'name') continue; // Only change name of the clicked element

          if (el.type === 'rectangle' && targetElement.type === 'rectangle') {
            const r = el as Rectangle;
            const t = targetElement as Rectangle;
            const uk = key as keyof Rectangle;
            if (typeof (updates as any)[uk] === 'number' && typeof (r as any)[uk] === 'number' && typeof (t as any)[uk] === 'number') {
              const delta = ((updates as any)[uk] as number) - ((t as any)[uk] as number);
              bulkUpdates[uk] = ((r as any)[uk] as number) + delta;
            } else {
              bulkUpdates[uk] = (updates as any)[uk];
            }
          } else {
            bulkUpdates[key] = (updates as any)[key];
          }
        }

        if (el.type === 'rectangle') {
          return applyConstraints(el as Rectangle, bulkUpdates);
        }
        return { ...el, ...bulkUpdates } as GroupData;
      }

      return el;
    });
    pushToHistory(newElements);
  };

  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    const exportData = elements.map(({ id, ...rest }) => rest);
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTransform = (e: any) => {
    const node = e.target;
    const id = node.id();
    const el = elements.find(r => r.id === id);
    if (el && el.type === 'rectangle') {
      const rect = el as Rectangle;
      setTransformingRect({
        ...rect,
        x: node.x(),
        y: node.y(),
        width: Math.round(node.width() * node.scaleX()),
        height: Math.round(node.height() * node.scaleY()),
      });
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    if (node.getType() === 'Group') {
      // Handle group transform if needed, but we are using Transformer on multiple nodes
      return;
    }
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
      if (selectedIds.includes(el.id) && el.id !== id) {
        if (el.type === 'rectangle') {
          const r = el as Rectangle;
          return { ...r, x: r.x + dx, y: r.y + dy };
        }
      }
      if (el.id === id) {
        if (el.type === 'rectangle') {
          const r = el as Rectangle;
          return { ...r, x: node.x(), y: node.y() };
        }
      }
      return el;
    });
    setElements(newElements);
  };

  const handleDragEnd = (e: any) => {
    pushToHistory(elements);
  };

  const handleCreateGroup = () => {
    if (selectedIds.length === 0) return;

    const groupId = `group-${Date.now()}`;
    const maxDepth = elements.length > 0 ? Math.max(...elements.map(el => el.depth)) : 0;

    const newGroup: GroupData = {
      id: groupId,
      name: getNextDefaultName('group'),
      type: 'group',
      visible: true,
      expanded: true,
      depth: maxDepth + 1
    };

    const newElements = elements.map(el => {
      if (selectedIds.includes(el.id)) {
        return { ...el, parentId: groupId };
      }
      return el;
    });

    pushToHistory([...newElements, newGroup]);
    setSelectedIds([groupId]);
  };

  const showTooltip = (text: string) => setTooltip({ text, visible: true });
  const hideTooltip = () => setTooltip({ text: '', visible: false });

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-300 font-sans overflow-hidden">
      <CursorTooltip text={tooltip.text} visible={tooltip.visible} />

      {/* Canvas Area */}
      <div className="flex-1 relative bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px]">
        <Stage
          width={window.innerWidth}
          height={window.innerHeight - 80}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          ref={stageRef}
        >
          <Layer>
            {sortedElements.map((el) => {
              if (el.type === 'rectangle') {
                const rect = el as Rectangle;
                return (
                  <Rect
                    key={rect.id}
                    id={rect.id}
                    {...rect}
                    cornerRadius={rect.cornerRadius}
                    draggable={tool === 'select'}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onTransform={handleTransform}
                    onTransformEnd={handleTransformEnd}
                    onClick={(e) => {
                      setLastSelectedId(rect.id);
                      if (e.evt.shiftKey) {
                        setSelectedIds(prev =>
                          prev.includes(rect.id)
                            ? prev.filter(id => id !== rect.id)
                            : [...prev, rect.id]
                        );
                      } else {
                        setSelectedIds([rect.id]);
                      }
                    }}
                    onTap={(e) => {
                      setLastSelectedId(rect.id);
                      setSelectedIds([rect.id]);
                    }}
                    strokeScaleEnabled={false}
                    stroke={hoveredId === rect.id || selectedIds.includes(rect.id) ? rect.highlightColor : rect.stroke}
                    strokeWidth={hoveredId === rect.id || selectedIds.includes(rect.id) ? 4 : rect.strokeWidth}
                    opacity={rect.visible ? 1 : 0}
                  />
                );
              }
              return null;
            })}

            {currentDrawingRect && (
              <Rect {...currentDrawingRect} />
            )}

            {selectionRect && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3b82f6"
                strokeWidth={1}
                dash={[5, 5]}
              />
            )}

            {/* Dimension Labels during resize or drawing */}
            {(transformingRect || currentDrawingRect) && (() => {
              const rect = transformingRect || currentDrawingRect;
              if (!rect) return null;
              const labelW = `${rect.width} pixels`;
              const labelH = `${rect.height} pixels`;
              const color = rect.highlightColor;
              return (
                <Group>
                  {/* Top */}
                  <Text
                    x={rect.x + rect.width / 2 - 30}
                    y={rect.y - 25}
                    text={labelW}
                    fill={color}
                    fontSize={11}
                    fontStyle="bold"
                    align="center"
                  />
                  {/* Bottom */}
                  <Text
                    x={rect.x + rect.width / 2 - 30}
                    y={rect.y + rect.height + 15}
                    text={labelW}
                    fill={color}
                    fontSize={11}
                    fontStyle="bold"
                    align="center"
                  />
                  {/* Right */}
                  <Text
                    x={rect.x + rect.width + 10}
                    y={rect.y + rect.height / 2 - 6}
                    text={labelH}
                    fill={color}
                    fontSize={11}
                    fontStyle="bold"
                  />
                  {/* Left */}
                  <Text
                    x={rect.x - 70}
                    y={rect.y + rect.height / 2 - 6}
                    text={labelH}
                    fill={color}
                    fontSize={11}
                    fontStyle="bold"
                    align="right"
                    width={60}
                  />
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
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 5 || newBox.height < 5) return oldBox;
                    return newBox;
                  }}
                  rotateEnabled={false}
                  anchorStroke={color}
                  anchorFill={color}
                  anchorSize={8}
                  borderStroke={color}
                />
              );
            })()}
          </Layer>
        </Stage>

        {/* Floating Elements Panel */}
        <AnimatePresence>
          {isPanelOpen && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="absolute right-4 top-4 bottom-24 w-80 bg-[#141414] border border-white/5 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#1a1a1a]">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-zinc-500" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Elements</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateGroup}
                    disabled={selectedIds.length === 0}
                    className="p-1 text-zinc-500 hover:text-white disabled:opacity-20 transition-opacity"
                    title="Group Selected"
                  >
                    <FolderPlus size={14} />
                  </button>
                  <button onClick={undo} disabled={historyIndex === 0} className="p-1 text-zinc-500 hover:text-white disabled:opacity-20 transition-opacity">
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-1 text-zinc-500 hover:text-white disabled:opacity-20 transition-opacity">
                    <RotateCw size={14} />
                  </button>
                  <button onClick={() => setIsPanelOpen(false)} className="text-zinc-500 hover:text-white transition-colors ml-2">
                    <Plus size={16} className="rotate-45" />
                  </button>
                </div>
              </div>

              <div ref={panelScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {elements.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 p-8 text-center">
                    <Layers size={32} className="mb-4 opacity-20" />
                    <p className="text-sm italic">No elements yet. Draw a rectangle to start.</p>
                  </div>
                )}

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handlePanelDragStart}
                  onDragOver={handlePanelDragOver}
                  onDragEnd={handlePanelDragEnd}
                >
                  <SortableContext
                    items={(() => {
                      const ids: string[] = [];
                      const traverse = (parentId: string | null = null) => {
                        elements
                          .filter(el => el.parentId === parentId)
                          .forEach(el => {
                            ids.push(el.id);
                            if (el.type === 'group' && expandedIds.has(el.id)) {
                              traverse(el.id);
                            }
                          });
                      };
                      traverse();
                      return ids;
                    })()}
                    strategy={verticalListSortingStrategy}
                  >
                    {(() => {
                      const renderElementRecursive = (el: CanvasElement, depth = 0) => {
                        const isExpanded = expandedIds.has(el.id);
                        const isSelected = selectedIds.includes(el.id);
                        const isHovered = hoveredId === el.id;
                        const highlightColor = el.type === 'rectangle' ? (el as Rectangle).highlightColor : '#3b82f6';

                        const children = elements.filter(child => child.parentId === el.id);

                        return (
                          <React.Fragment key={el.id}>
                            <SortableElement
                              el={el}
                              depth={depth}
                              isSelected={isSelected}
                              isHovered={isHovered}
                              isExpanded={isExpanded}
                              highlightColor={highlightColor}
                              onSelect={(e) => {
                                if (e.shiftKey) {
                                  const currentIndex = elements.findIndex(r => r.id === el.id);
                                  const lastIndex = elements.findIndex(r => r.id === lastSelectedId);

                                  if (lastIndex !== -1) {
                                    const start = Math.min(currentIndex, lastIndex);
                                    const end = Math.max(currentIndex, lastIndex);
                                    const rangeIds = elements.slice(start, end + 1).map(r => r.id);
                                    setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
                                  } else {
                                    setSelectedIds(prev => prev.includes(el.id) ? prev : [...prev, el.id]);
                                  }
                                } else if (e.ctrlKey || e.metaKey) {
                                  setSelectedIds(prev =>
                                    prev.includes(el.id)
                                      ? prev.filter(id => id !== el.id)
                                      : [...prev, el.id]
                                  );
                                } else {
                                  setSelectedIds([el.id]);
                                }
                                setLastSelectedId(el.id);
                              }}
                              onHover={setHoveredId}
                              onToggleExpand={() => toggleExpand(el.id)}
                              onUpdate={(updates) => handleUpdate(el.id, updates)}
                              onUpdateEnd={(updates) => handleUpdateEnd(el.id, updates)}
                              onDelete={() => handleDelete(el.id)}
                              showTooltip={showTooltip}
                              hideTooltip={hideTooltip}
                            />
                            {el.type === 'group' && isExpanded && children.length > 0 && (
                              children.map(child => renderElementRecursive(child, depth + 1))
                            )}
                          </React.Fragment>
                        );
                      };

                      return elements.filter(el => !el.parentId).map(el => renderElementRecursive(el));
                    })()}
                  </SortableContext>
                  <DragOverlay
                    dropAnimation={{
                      duration: 250,
                      easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                      sideEffects: defaultDropAnimationSideEffects({
                        styles: {
                          active: {
                            opacity: '0.5',
                          },
                        },
                      }),
                    }}
                  >
                    {activeId ? (() => {
                      const el = elements.find(e => e.id === activeId);
                      if (!el) return null;
                      const isExpanded = expandedIds.has(el.id);
                      const isSelected = selectedIds.includes(el.id);
                      const isHovered = hoveredId === el.id;
                      const highlightColor = el.type === 'rectangle' ? (el as Rectangle).highlightColor : '#3b82f6';

                      return (
                        <SortableElement
                          el={el}
                          depth={0}
                          isSelected={isSelected}
                          isHovered={isHovered}
                          isExpanded={isExpanded}
                          highlightColor={highlightColor}
                          onSelect={() => { }}
                          onHover={() => { }}
                          onToggleExpand={() => { }}
                          onUpdate={() => { }}
                          onUpdateEnd={() => { }}
                          onDelete={() => { }}
                          showTooltip={showTooltip}
                          hideTooltip={hideTooltip}
                          isOverlay={true}
                        />
                      );
                    })() : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Toolbar */}
      <div className="h-20 bg-[#141414] border-t border-white/5 flex items-center justify-between px-8 z-20">
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl">
          <button
            onClick={() => setTool('select')}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 ${tool === 'select' ? 'bg-white/10 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <div className="relative">
              <MousePointer2 size={20} />
              <span className="absolute -top-1 -right-1 text-[8px] bg-zinc-800 text-zinc-400 px-1 rounded border border-white/10">V</span>
            </div>
            <span className="text-xs font-medium pr-1">Select</span>
          </button>
          <button
            onClick={() => setTool('rectangle')}
            className={`p-3 rounded-xl transition-all flex items-center gap-2 ${tool === 'rectangle' ? 'bg-white/10 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <div className="relative">
              <Square size={20} />
              <span className="absolute -top-1 -right-1 text-[8px] bg-zinc-800 text-zinc-400 px-1 rounded border border-white/10">R</span>
            </div>
            <span className="text-xs font-medium pr-1">Rectangle Tool</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {!isPanelOpen && (
            <button
              onClick={() => setIsPanelOpen(true)}
              className="p-3 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-all flex items-center gap-2"
            >
              <Layers size={18} />
              <span className="text-xs font-medium">Show Elements</span>
            </button>
          )}
          <button
            onClick={handleExport}
            className={`px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg active:scale-95 ${copied ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
              } text-white`}
          >
            {copied ? <Plus className="rotate-45" size={18} /> : <Download size={18} />}
            <span className="text-sm font-semibold">{copied ? 'Copied!' : 'Export JSON'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

