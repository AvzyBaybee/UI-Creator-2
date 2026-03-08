export type ElementType = 'rectangle' | 'group';

export interface BaseElement {
  id: string;
  name: string;
  visible: boolean;
  parentId?: string;
  type: ElementType;
  depth: number;
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
  depth: number;
  cornerRadius: number;
  highlightColor: string;
}

export interface GroupData extends BaseElement {
  type: 'group';
  expanded: boolean;
}

export type CanvasElement = Rectangle | GroupData;

export type Tool = 'select' | 'rectangle';
