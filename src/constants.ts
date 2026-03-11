import { CanvasElement } from './types';

export const INITIAL_ELEMENTS: CanvasElement[] = [];

export const STORAGE_KEY = 'minimal-ui-architect-settings';

export const DEFAULT_SETTINGS = {
  uiScale: 1,
  textScale: 1,
  textStroke: 1.5,
  tileWidth: 192,
  colorTileWidth: 192,
  handleHeight: 32,
  handleY: -12,
  rowPaddingX: 12,
  innerGap: 8,
  mainToolbarScale: 1,
  mainToolbarPadding: 8,
  mainToolbarIconSize: 18,
  mainToolbarGap: 4,
  tileToolbarHeight: 32,
  tileToolbarOpacity: 0.1,
  tileIconScale: 1,
  tileIconPadding: 4,
  toolbarX: window.innerWidth / 2,
  toolbarY: window.innerHeight - 60,
  settingsX: 100,
  settingsY: 100,
  tagLightnessOffset: -15,
  tagSaturationOffset: 0,
  tagHueOffset: 0,
  colorRowLabelWidth: 24,
  colorSliderPaddingX: 0,
  gridSize: 20,
  showGrid: false,
  gridColor: '#ffffff',
  gridOpacity: 0.05,
  tileBottomPadding: 12
};
