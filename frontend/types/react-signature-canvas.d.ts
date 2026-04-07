declare module 'react-signature-canvas' {
  import * as React from 'react';

  export default class SignatureCanvas extends React.Component<{
    canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement>;
  }> {
    clear(): void;
    toDataURL(type?: string, encoderOptions?: number): string;
  }
}
