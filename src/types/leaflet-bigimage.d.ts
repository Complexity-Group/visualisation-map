declare module 'leaflet.BigImage' {
  import { Control, ControlOptions } from 'leaflet';

  export interface BigImageControlOptions extends ControlOptions {
    title?: string;
    printControlLabel?: string;
    printControlClasses?: string[];
    printControlTitle?: string;
    maxScale?: number;
    minScale?: number;
    inputTitle?: string;
    downloadTitle?: string;
    exportFormat?: 'png' | 'jpeg' | 'webp';
    fileName?: string;
    hideControlOnPrint?: boolean;
    crossOrigin?: string;
    showFormatSelector?: boolean;
    [key: string]: any;
  }

  export class BigImageControl extends Control {
    options: BigImageControlOptions;
    [key: string]: any;
    constructor(options?: BigImageControlOptions);
    _handleDownload(): Promise<void>;
    _generateAndDownloadImage(scale: number): Promise<void>;
    _buildParametersPanel(): void;
  }
}
