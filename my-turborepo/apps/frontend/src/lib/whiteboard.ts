export type Tool = 'rectangle' | 'circle' | 'line'| 'pencil';

type Camera = {
    x: number;
    y: number;
    zoom: number;
};

export const WORLD_WIDTH = 10000;
export const WORLD_HEIGHT = 10000;

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

export function clampCamera(
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number
): Camera {
  const worldScreenWidth = WORLD_WIDTH * camera.zoom;
  const worldScreenHeight = WORLD_HEIGHT * camera.zoom;

  let x = camera.x;
  let y = camera.y;

  // If the world is larger than the viewport,
  // keep the viewport inside the world.
  if (worldScreenWidth >= canvasWidth) {
    const minX = canvasWidth - worldScreenWidth;
    const maxX = 0;

    x = Math.max(minX, Math.min(maxX, x));
  } else {
    // World is smaller than viewport.
    // Keep the world centered.
    x = (canvasWidth - worldScreenWidth) / 2;
  }

  if (worldScreenHeight >= canvasHeight) {
    const minY = canvasHeight - worldScreenHeight;
    const maxY = 0;

    y = Math.max(minY, Math.min(maxY, y));
  } else {
    // World is smaller than viewport.
    // Keep the world centered.
    y = (canvasHeight - worldScreenHeight) / 2;
  }

  return {
    x,
    y,
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom)),
  };
}


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
    }
    |{
      type: 'pencil';
      points: {
        x :number;
        y :number;
      }[]
    };

    function transformPoint(
    x: number,
    y: number,
    camera: Camera
) {
    return {
        x: x * camera.zoom + camera.x,
        y: y * camera.zoom + camera.y,
    };
}

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

    if (parsed.type === 'pencil') {
    return {
        type: 'pencil',
        points: Array.isArray(parsed.points)
            ? parsed.points.map((point) => ({
                  x: Number((point as any).x),
                  y: Number((point as any).y),
              }))
            : [],
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
  camera: Camera,
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

  shapes.forEach((shape) =>
    drawShape(context, shape, camera, false)
);

if (previewShape) {
    drawShape(context, previewShape, camera, true);
}
}

function drawShape(
  context: CanvasRenderingContext2D,
    shape: Shape,
    camera: Camera,
    isPreview: boolean
) {
  context.strokeStyle = isPreview ? 'rgba(78, 96, 128, 0.52)' : '#bfc9d6';
  context.fillStyle = 'rgba(34, 46, 62, 0.18)';
  context.lineWidth = 2;

  if (shape.type === 'pencil') {

    if (shape.points.length < 2) {
        return;
    }

    context.beginPath();

    const first = transformPoint(
    shape.points[0].x,
    shape.points[0].y,
    camera
  
);

context.moveTo(first.x, first.y);

for (let i = 1; i < shape.points.length; i++) {

    const point = transformPoint(
        shape.points[i].x,
        shape.points[i].y,
        camera
    );

    context.lineTo(
        point.x,
        point.y
    );
}


    context.stroke();
    context.closePath();

    return;
}

  if (shape.type === 'rectangle') {

    const topLeft = transformPoint(
        shape.x,
        shape.y,
        camera
    );

    context.strokeRect(
        topLeft.x,
        topLeft.y,
        shape.width * camera.zoom,
        shape.height * camera.zoom
    );

    if (!isPreview) {
        context.fillRect(
            topLeft.x,
            topLeft.y,
            shape.width * camera.zoom,
            shape.height * camera.zoom
        );
    }

    return;
}

  if (shape.type === 'circle') {

    const center = transformPoint(
        shape.centerX,
        shape.centerY,
        camera
    );

    context.beginPath();

    context.arc(
        center.x,
        center.y,
        shape.radius * camera.zoom,
        0,
        Math.PI * 2
    );

    if (!isPreview) {
        context.fill();
    }

    context.stroke();
    context.closePath();

    return;
}

  const start = transformPoint(
    shape.startX,
    shape.startY,
    camera
);

const end = transformPoint(
    shape.endX,
    shape.endY,
    camera
);

context.beginPath();

context.moveTo(
    start.x,
    start.y
);

context.lineTo(
    end.x,
    end.y
);

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
