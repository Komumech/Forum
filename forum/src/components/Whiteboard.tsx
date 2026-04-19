import * as React from 'react';
import { useRef, useEffect, useState } from 'react';
import { Download, Trash2, Undo, Redo, Type, MousePointer, Square, Circle, Minus, Pencil, Eraser } from 'lucide-react';
import { cn } from '../lib/utils';

interface Point {
  x: number;
  y: number;
}

interface Shape {
  type: 'pencil' | 'line' | 'rect' | 'circle' | 'text';
  points: Point[];
  color: string;
  width: number;
  text?: string;
  id: string;
}

export default function Whiteboard({ meetingId }: { meetingId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Shape['type'] | 'eraser'>('pencil');
  const [color, setColor] = useState('#2563eb');
  const [lineWidth, setLineWidth] = useState(3);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [textInput, setTextInput] = useState<{ x: number, y: number, value: string } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        redraw();
      }
    };

    const observer = new ResizeObserver(() => requestAnimationFrame(handleResize));
    if (containerRef.current) observer.observe(containerRef.current);
    handleResize();
    return () => observer.disconnect();
  }, [shapes]); // Only re-run when actual committed shapes change

  // Separate effect for redrawing current active drawing
  useEffect(() => {
    redraw();
  }, [shapes, currentShape]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allShapes = [...shapes, ...(currentShape ? [currentShape] : [])];
    
    allShapes.forEach(shape => {
      ctx.beginPath();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;

      if (shape.type === 'pencil') {
        if (shape.points.length < 2) return;
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
      } else if (shape.type === 'line') {
        if (shape.points.length < 2) return;
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else if (shape.type === 'rect') {
        if (shape.points.length < 2) return;
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      } else if (shape.type === 'circle') {
        if (shape.points.length < 2) return;
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (shape.type === 'text' && shape.text) {
        ctx.font = `bold ${shape.width * 5}px Inter, sans-serif`;
        ctx.fillStyle = shape.color;
        ctx.fillText(shape.text, shape.points[0].x, shape.points[0].y);
      }
    });
  };

  const startDrawing = (e: React.PointerEvent) => {
    const pos = getPos(e);
    setIsDrawing(true);
    
    // Set pointer capture to ensure we get events even if user moves outside canvas
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

    if (tool === 'pencil') {
      setCurrentShape({
        type: 'pencil',
        points: [pos, { x: pos.x + 0.1, y: pos.y + 0.1 }], // Add a second point to ensure dot visibility
        color: color,
        width: lineWidth,
        id: Math.random().toString(36).substr(2, 9)
      });
    } else if (tool === 'eraser') {
       // Eraser logic is just a white pencil for now
       setCurrentShape({
        type: 'pencil',
        points: [pos, { x: pos.x + 0.1, y: pos.y + 0.1 }],
        color: '#ffffff',
        width: lineWidth * 4,
        id: Math.random().toString(36).substr(2, 9)
      });
    } else if (tool === 'text') {
      setTextInput({ x: pos.x, y: pos.y, value: '' });
      setIsDrawing(false);
      return;
    } else {
      setCurrentShape({
        type: tool as any,
        points: [pos, pos],
        color: color,
        width: lineWidth,
        id: Math.random().toString(36).substr(2, 9)
      });
    }
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing || !currentShape) return;
    const pos = getPos(e);

    if (currentShape.type === 'pencil') {
      setCurrentShape({
        ...currentShape,
        points: [...currentShape.points, pos]
      });
    } else {
      setCurrentShape({
        ...currentShape,
        points: [currentShape.points[0], pos]
      });
    }
  };

  const endDrawing = () => {
    if (!isDrawing || !currentShape) return;
    setIsDrawing(false);
    setUndoStack([...undoStack, shapes]);
    setShapes([...shapes, currentShape]);
    setCurrentShape(null);
  };

  const getPos = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const clear = () => {
    setUndoStack([...undoStack, shapes]);
    setShapes([]);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setShapes(prev);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ToolButton active={tool === 'pencil'} icon={<Pencil size={18} />} onClick={() => setTool('pencil')} />
          <ToolButton active={tool === 'eraser'} icon={<Eraser size={18} />} onClick={() => setTool('eraser')} />
          <ToolButton active={tool === 'text'} icon={<Type size={18} />} onClick={() => setTool('text')} />
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <ToolButton active={tool === 'line'} icon={<Minus size={18} />} onClick={() => setTool('line')} />
          <ToolButton active={tool === 'rect'} icon={<Square size={18} />} onClick={() => setTool('rect')} />
          <ToolButton active={tool === 'circle'} icon={<Circle size={18} />} onClick={() => setTool('circle')} />
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <input 
            type="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded-lg cursor-pointer border-2 border-white shadow-sm"
          />
          <select 
            value={lineWidth} 
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="bg-white border-none rounded-lg text-xs font-bold px-2 py-1 outline-none"
          >
            {[1, 3, 5, 8, 12].map(w => <option key={w} value={w}>{w}px</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} className="p-2 text-gray-500 hover:bg-white hover:text-accent-blue rounded-xl transition-all">
            <Undo size={18} />
          </button>
          <button onClick={clear} className="p-2 text-gray-500 hover:bg-white hover:text-accent-red rounded-xl transition-all">
            <Trash2 size={18} />
          </button>
          <button onClick={download} className="px-4 py-2 bg-accent-blue text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm">
            <Download size={14} />
            Export
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 bg-white cursor-crosshair relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={endDrawing}
          onPointerLeave={endDrawing}
          className="absolute inset-0 touch-none w-full h-full bg-white select-none"
          style={{ imageRendering: 'auto' }}
        />
        {textInput && (
          <div 
            className="absolute z-10 p-2 bg-white rounded-lg shadow-xl border border-gray-100 min-w-[200px]"
            style={{ left: textInput.x, top: textInput.y }}
          >
            <input
              autoFocus
              className="w-full px-2 py-1 text-sm border-none outline-none focus:ring-0"
              placeholder="Type something..."
              value={textInput.value}
              onChange={e => setTextInput({ ...textInput, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (textInput.value) {
                    const newShape: Shape = {
                      type: 'text',
                      points: [{ x: textInput.x, y: textInput.y }],
                      color: color,
                      width: lineWidth,
                      text: textInput.value,
                      id: Math.random().toString(36).substr(2, 9)
                    };
                    setUndoStack([...undoStack, shapes]);
                    setShapes([...shapes, newShape]);
                  }
                  setTextInput(null);
                } else if (e.key === 'Escape') {
                  setTextInput(null);
                }
              }}
              onBlur={() => {
                if (textInput.value) {
                  const newShape: Shape = {
                    type: 'text',
                    points: [{ x: textInput.x, y: textInput.y }],
                    color: color,
                    width: lineWidth,
                    text: textInput.value,
                    id: Math.random().toString(36).substr(2, 9)
                  };
                  setUndoStack([...undoStack, shapes]);
                  setShapes([...shapes, newShape]);
                }
                setTextInput(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({ active, icon, onClick }: { active: boolean, icon: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-2.5 rounded-xl transition-all",
        active ? "bg-accent-blue text-white shadow-md" : "text-gray-500 hover:bg-white"
      )}
    >
      {icon}
    </button>
  );
}
