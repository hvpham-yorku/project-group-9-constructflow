import { useState, useRef, useEffect, useCallback } from "react";
import { MdArchitecture } from "react-icons/md";
import "../styles/BlueprintCanvas.css";

/**
 * BlueprintCanvas
 *
 * SVG overlay is pixel-locked to the rendered image via getBoundingClientRect +
 * ResizeObserver. Coordinates are stored in natural-image-pixel space so they
 * are stable across zoom / resize.
 *
 * Modes:
 *   drawing  — activeObjectId is set; clicks add points, double-click finishes
 *   dragging — selectedObjectId is set and user mousedowns on a finished path;
 *              the whole path translates without changing its shape
 */
function BlueprintCanvas({
  imageUrl,
  objects = [],
  activeObjectId,
  onPathUpdate,
  onFinishDrawing,
  onObjectSelected,
  selectedObjectId,
  isWorker = false,
}) {
  // ── Drawing state ─────────────────────────────────────────────────────────
  const [currentPoints, setCurrentPoints] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [mousePos, setMousePos] = useState(null);

  // ── Drag-to-reposition state ──────────────────────────────────────────────
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startClient: null, startPoints: null, objId: null });

  // ── Image overlay geometry ────────────────────────────────────────────────
  const [imgRect, setImgRect] = useState(null);     // rendered rect inside container
  const [naturalSize, setNaturalSize] = useState(null);

  const containerRef = useRef(null);
  const imgRef = useRef(null);

  // ── Measure rendered image rect ───────────────────────────────────────────
  const measureImage = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth) return;

    const cRect = container.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();

    setImgRect({
      left: iRect.left - cRect.left,
      top: iRect.top - cRect.top,
      width: iRect.width,
      height: iRect.height,
    });
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measureImage);
    ro.observe(container);
    return () => ro.disconnect();
  }, [measureImage, imageUrl]);

  useEffect(() => {
    setImgRect(null);
    setNaturalSize(null);
  }, [imageUrl]);

  // ── Reset drawing state when active element changes ───────────────────────
  useEffect(() => {
    setCurrentPoints([]);
    setRedoStack([]);
    setMousePos(null);
  }, [activeObjectId]);

  // ── Keyboard undo / redo ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!activeObjectId) return;
    if (e.ctrlKey && e.shiftKey && (e.key === "Z" || e.key === "z")) {
      e.preventDefault();
      setRedoStack((prev) => {
        if (prev.length === 0) return prev;
        const point = prev[prev.length - 1];
        setCurrentPoints((pts) => [...pts, point]);
        return prev.slice(0, -1);
      });
    } else if (e.ctrlKey && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      setCurrentPoints((prev) => {
        if (prev.length === 0) return prev;
        const removed = prev[prev.length - 1];
        setRedoStack((r) => [...r, removed]);
        return prev.slice(0, -1);
      });
    }
  }, [activeObjectId]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Coordinate conversion: client → natural-image pixels ─────────────────
  const clientToSvg = useCallback((clientX, clientY) => {
    if (!imgRect || !naturalSize) return { x: 0, y: 0 };
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const cRect = container.getBoundingClientRect();
    const relX = clientX - cRect.left - imgRect.left;
    const relY = clientY - cRect.top - imgRect.top;
    return {
      x: (relX / imgRect.width) * naturalSize.w,
      y: (relY / imgRect.height) * naturalSize.h,
    };
  }, [imgRect, naturalSize]);

  // ── SVG drawing handlers ──────────────────────────────────────────────────
  const handleSvgMouseMove = (e) => {
    if (activeObjectId) {
      setMousePos(clientToSvg(e.clientX, e.clientY));
    }
    if (dragging) {
      handleDragMove(e);
    }
  };

  const handleSvgClick = (e) => {
    if (!activeObjectId || dragging) return;
    const pos = clientToSvg(e.clientX, e.clientY);
    setCurrentPoints((prev) => [...prev, pos]);
    setRedoStack([]);
  };

  const handleSvgDoubleClick = (e) => {
    if (!activeObjectId) return;
    e.preventDefault();
    e.stopPropagation();

    // A double-click fires: click → click → dblclick
    // So currentPoints already has 2 extra points added by the two clicks.
    // We remove the last one (the second click of the double-click).
    const trimmed = currentPoints.slice(0, -1);

    if (trimmed.length < 2) {
      // Not enough points for a line — cancel this element
      setCurrentPoints([]);
      setRedoStack([]);
      setMousePos(null);
      return;
    }

    // Push final path to parent FIRST, then mark as finished
    if (onPathUpdate) onPathUpdate(activeObjectId, trimmed);
    if (onFinishDrawing) onFinishDrawing(activeObjectId);

    // Clear local drawing state
    setCurrentPoints([]);
    setRedoStack([]);
    setMousePos(null);
  };

  // ── Drag-to-reposition handlers ───────────────────────────────────────────
  const handlePathMouseDown = (e, obj) => {
    if (activeObjectId) return; // don't drag while drawing
    e.stopPropagation();
    e.preventDefault();

    onObjectSelected && onObjectSelected(obj);

    dragRef.current = {
      startClient: { x: e.clientX, y: e.clientY },
      startPoints: obj.pathPoints.map((p) => ({ ...p })),
      objId: obj.id,
    };
    setDragging(true);
  };

  const handleDragMove = (e) => {
    const { startClient, startPoints, objId } = dragRef.current;
    if (!startClient || !imgRect || !naturalSize) return;

    // Delta in client pixels → convert to natural-image pixels
    const dxClient = e.clientX - startClient.x;
    const dyClient = e.clientY - startClient.y;
    const dxNat = (dxClient / imgRect.width) * naturalSize.w;
    const dyNat = (dyClient / imgRect.height) * naturalSize.h;

    const movedPoints = startPoints.map((p) => ({
      x: p.x + dxNat,
      y: p.y + dyNat,
    }));

    if (onPathUpdate) onPathUpdate(objId, movedPoints);
  };

  const handleDragEnd = () => {
    setDragging(false);
    dragRef.current = { startClient: null, startPoints: null, objId: null };
  };

  // ── Path helpers ──────────────────────────────────────────────────────────
  const pointsToPath = (points) => {
    if (!points || points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
  };

  const previewPath = () => {
    if (currentPoints.length === 0 || !mousePos) return "";
    const last = currentPoints[currentPoints.length - 1];
    return `M ${last.x.toFixed(2)} ${last.y.toFixed(2)} L ${mousePos.x.toFixed(2)} ${mousePos.y.toFixed(2)}`;
  };

  const activeType = objects.find((o) => o.id === activeObjectId)?.type || "";

  // ── Placeholder ───────────────────────────────────────────────────────────
  if (!imageUrl) {
    return (
      <div className="blueprint-canvas">
        <div className="blueprint-placeholder">
          <div className="placeholder-content">
            <MdArchitecture className="placeholder-icon" />
            <p>No blueprint uploaded</p>
            <p className="placeholder-hint">Upload a blueprint image to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blueprint-canvas active" ref={containerRef}>
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Blueprint"
        className="blueprint-image"
        onLoad={measureImage}
        draggable={false}
      />

      {imgRect && naturalSize && (
        <svg
          className={`drawing-layer${activeObjectId ? " drawing" : ""}${dragging ? " dragging" : ""}`}
          style={{
            position: "absolute",
            left: imgRect.left,
            top: imgRect.top,
            width: imgRect.width,
            height: imgRect.height,
            pointerEvents: "all",
          }}
          viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
          preserveAspectRatio="none"
          onClick={handleSvgClick}
          onDoubleClick={handleSvgDoubleClick}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={(e) => {
            setMousePos(null);
            if (dragging) handleDragEnd();
          }}
        >
          {/* Finished / in-progress objects */}
          {objects.map((obj) => {
            const isSelected = obj.id === selectedObjectId;
            const isOwn = obj.isOwn; // worker's own element → yellow
            return (
              <path
                key={obj.id}
                d={pointsToPath(obj.pathPoints)}
                className={`blueprint-object ${obj.type}${obj.completed ? " completed" : ""}${isSelected ? " selected" : ""}${isOwn ? " own-element" : ""}`}
                strokeWidth={isSelected ? 7 : 5}
                fill="none"
                style={{
                  cursor: activeObjectId
                    ? "crosshair"
                    : isSelected && !isWorker
                    ? (dragging ? "grabbing" : "grab")
                    : "pointer",
                }}
                onMouseDown={(e) => !isWorker && handlePathMouseDown(e, obj)}
                onClick={(e) => {
                  if (activeObjectId || dragging) return;
                  e.stopPropagation();
                  onObjectSelected && onObjectSelected(obj);
                }}
              />
            );
          })}

          {/* Live preview while drawing */}
          {activeObjectId && currentPoints.length > 0 && (
            <>
              <path
                d={pointsToPath(currentPoints)}
                className={`blueprint-object preview ${activeType}`}
                strokeWidth="5"
                fill="none"
              />
              {mousePos && (
                <path
                  d={previewPath()}
                  className="rubber-band"
                  strokeWidth="3"
                  fill="none"
                />
              )}
              {currentPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="6" className="path-point" />
              ))}
            </>
          )}
        </svg>
      )}
    </div>
  );
}

export default BlueprintCanvas;
