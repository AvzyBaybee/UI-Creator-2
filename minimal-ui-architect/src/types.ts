export type ElementType = 'node' | 'group' | 'color';

export interface BaseElement {
  id: string;
  name: string;
  visible: boolean;
  parentId?: string;
  type: ElementType;
  depth: number;
  nodeX: number;
  nodeY: number;
}

export interface NodeData extends BaseElement {
  type: 'node';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  highlightColor: string;
  colorNodeId?: string;
}

export interface GroupData extends BaseElement {
  type: 'group';
  expanded: boolean;
  nodeWidth: number;
  nodeHeight: number;
  color: string;
  opacity?: number;
}

export interface ColorNodeData extends BaseElement {
  type: 'color';
  colorMode: 'HSB' | 'HSL' | 'RGB';
  channel1: number;
  channel2: number;
  channel3: number;
  highlightColor: string;
}

export type CanvasElement = NodeData | GroupData | ColorNodeData;

export type Tool = 'select' | 'node' | 'group' | 'hand' | 'zoom';
