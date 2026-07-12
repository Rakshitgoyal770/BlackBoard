export type Tool = 'rectangle' | 'circle' | 'line';

export type Shape =
  | {
      type: 'rectangle';
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: 'circle';
      centerX: number;
      centerY: number;
      radius: number;
    }
  | {
      type: 'line';
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    };

export function parseShape(message: string): Shape | null {
  try {
    const parsed = JSON.parse(message) as Partial<Shape> & { type?: string };

    if (parsed.type === 'rectangle') {
      return {
        type: 'rectangle',
        x: Number(parsed.x),
        y: Number(parsed.y),
        width: Number(parsed.width),
        height: Number(parsed.height),
      };
    }

    if (parsed.type === 'circle') {
      return {
        type: 'circle',
        centerX: Number(parsed.centerX),
        centerY: Number(parsed.centerY),
        radius: Number(parsed.radius),
      };
    }

    if (parsed.type === 'line') {
      return {
        type: 'line',
        startX: Number(parsed.startX),
        startY: Number(parsed.startY),
        endX: Number(parsed.endX),
        endY: Number(parsed.endY),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function drawScene(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  shapes: Shape[],
  previewShape?: Shape | null
) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const boardGradient = context.createLinearGradient(0, 0, 0, canvas.height);
  boardGradient.addColorStop(0, '#03050a');
  boardGradient.addColorStop(0.24, '#020408');
  boardGradient.addColorStop(0.62, '#010307');
  boardGradient.addColorStop(1, '#000102');
  context.fillStyle = boardGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const glassGlow = context.createRadialGradient(
    canvas.width * 0.28,
    canvas.height * 0.18,
    0,
    canvas.width * 0.28,
    canvas.height * 0.18,
    canvas.width * 0.95
  );
  glassGlow.addColorStop(0, 'rgba(28, 54, 96, 0.08)');
  glassGlow.addColorStop(0.35, 'rgba(10, 28, 58, 0.05)');
  glassGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glassGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sheen = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  sheen.addColorStop(0, 'rgba(54, 84, 140, 0.035)');
  sheen.addColorStop(0.12, 'rgba(54, 84, 140, 0.01)');
  sheen.addColorStop(0.48, 'rgba(0, 0, 0, 0)');
  sheen.addColorStop(1, 'rgba(8, 12, 18, 0.06)');
  context.fillStyle = sheen;
  context.fillRect(0, 0, canvas.width, canvas.height);

  shapes.forEach((shape) => drawShape(context, shape, false));

  if (previewShape) {
    drawShape(context, previewShape, true);
  }
}

function drawShape(
  context: CanvasRenderingContext2D,
  shape: Shape,
  isPreview: boolean
) {
  context.strokeStyle = isPreview ? 'rgba(78, 96, 128, 0.52)' : '#bfc9d6';
  context.fillStyle = 'rgba(34, 46, 62, 0.18)';
  context.lineWidth = 2;

  if (shape.type === 'rectangle') {
    context.strokeRect(shape.x, shape.y, shape.width, shape.height);
    if (!isPreview) {
      context.fillRect(shape.x, shape.y, shape.width, shape.height);
    }
    return;
  }

  if (shape.type === 'circle') {
    context.beginPath();
    context.arc(shape.centerX, shape.centerY, shape.radius, 0, Math.PI * 2);
    if (!isPreview) {
      context.fill();
    }
    context.stroke();
    context.closePath();
    return;
  }

  context.beginPath();
  context.moveTo(shape.startX, shape.startY);
  context.lineTo(shape.endX, shape.endY);
  context.stroke();
  context.closePath();
}

export function buildShape(
  tool: Tool,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Shape {
  const width = endX - startX;
  const height = endY - startY;

  if (tool === 'rectangle') {
    return {
      type: 'rectangle',
      x: startX,
      y: startY,
      width,
      height,
    };
  }

  if (tool === 'circle') {
    return {
      type: 'circle',
      centerX: startX + width / 2,
      centerY: startY + height / 2,
      radius: Math.sqrt(width * width + height * height) / 2,
    };
  }

  return {
    type: 'line',
    startX,
    startY,
    endX,
    endY,
  };
}
