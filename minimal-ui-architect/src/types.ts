export type ElementType = 'rectangle' | 'group';

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

export interface Rectangle extends BaseElement {
  type: 'rectangle';
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

export type CanvasElement = Rectangle | GroupData;

export type Tool = 'select' | 'rectangle' | 'group' | 'hand' | 'zoom';
