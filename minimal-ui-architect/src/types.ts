export type ElementType = 'node' | 'group';

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
}

export interface GroupData extends BaseElement {
  type: 'group';
  expanded: boolean;
  nodeWidth: number;
  nodeHeight: number;
  color: string;
}

export type CanvasElement = NodeData | GroupData;

export type Tool = 'select' | 'node' | 'group' | 'hand' | 'zoom';
