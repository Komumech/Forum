import { useRef, useEffect, useState, MouseEvent, TouchEvent } from 'react';
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

function Whiteboard({ meetingId }: { meetingId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Shape['type'] | 'eraser'>('pencil');
  const [color, setColor] = useState('#2563eb');
  const [lineWidth, setLineWidth] = useState(3);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const { width, height } = container.getBoundingClientRect();
      
      // Save content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) tempCtx.drawImage(canvas, 0, 0);

      canvas.width = width;
      canvas.height = height;
      
      // Restore content if needed or redraw shapes
      redraw();
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    redraw();
  }, [shapes, currentShape]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    [...shapes, ...(currentShape ? [currentShape] : [])].forEach(shape => {
      ctx.beginPath();
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;

      if (shape.type === 'pencil' || shape.type === 'line') {
        shape.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      } else if (shape.type === 'rect') {
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      } else if (shape.type === 'circle') {
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
  };

  const startDrawing = (e: MouseEvent | TouchEvent) => {
    const pos = getPos(e);
    setIsDrawing(true);
    
    if (tool === 'pencil') {
      setCurrentShape({
        type: 'pencil',
        points: [pos],
        color: color,
        width: lineWidth,
        id: Math.random().toString(36).substr(2, 9)
      });
    } else if (tool === 'eraser') {
       // Eraser logic is just a white pencil for now or we could filter shapes
       setCurrentShape({
        type: 'pencil',
        points: [pos],
        color: '#ffffff',
        width: lineWidth * 4,
        id: Math.random().toString(36).substr(2, 9)
      });
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

  const draw = (e: MouseEvent | TouchEvent) => {
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

  const getPos = (e: MouseEvent | TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
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
      <div ref={containerRef} className="flex-1 bg-white cursor-crosshair relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          className="absolute inset-0"
        />
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

export default Whiteboard;
