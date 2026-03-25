import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  onObjectUpdate,
  onFinishDrawing,
  onObjectSelected,
  selectedObjectId,
  selectedPoint,
  activePointTool = null,
  onPointToolHover,
  onPointSelected,
  isWorker = false,
  showGrid = false,
}) {
  // ── Drawing state ─────────────────────────────────────────────────────────
  const [currentPoints, setCurrentPoints] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [mousePos, setMousePos] = useState(null);
  const [fixtureDraftRect, setFixtureDraftRect] = useState(null);

  // ── Drag-to-reposition state ──────────────────────────────────────────────
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startClient: null, startPoints: null, objId: null });

  // ── Image overlay geometry ────────────────────────────────────────────────
  const [imgRect, setImgRect] = useState(null);     // rendered rect inside container
  const [naturalSize, setNaturalSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [shiftPressed, setShiftPressed] = useState(false);

  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;

  const normalizeRect = useCallback((start, end) => {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    return {
      x: left,
      y: top,
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }, []);

  const getFixtureConnectionPoints = useCallback((rect, connectionCount = 1) => {
    if (!rect || !rect.width || !rect.height) return [];
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const spread = Math.max(8, Math.min(rect.width, rect.height) * 0.2);
    const count = Math.min(4, Math.max(1, Number(connectionCount) || 1));

    if (count === 1) return [{ x: centerX, y: centerY }];
    if (count === 2) {
      return [
        { x: centerX - spread, y: centerY },
        { x: centerX + spread, y: centerY },
      ];
    }
    if (count === 3) {
      return [
        { x: centerX, y: centerY - spread },
        { x: centerX - spread, y: centerY + spread },
        { x: centerX + spread, y: centerY + spread },
      ];
    }
    return [
      { x: centerX, y: centerY - spread },
      { x: centerX + spread, y: centerY },
      { x: centerX, y: centerY + spread },
      { x: centerX - spread, y: centerY },
    ];
  }, []);

  const clampZoom = useCallback(
    (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)),
    [],
  );

  const changeZoom = useCallback(
    (delta) => {
      setZoom((prev) => clampZoom(prev + delta));
    },
    [clampZoom],
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

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
    setZoom(1);
  }, [imageUrl]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      measureImage();
    });
    return () => cancelAnimationFrame(rafId);
  }, [zoom, measureImage]);

  // ── Reset drawing state when active element changes ───────────────────────
  useEffect(() => {
    setCurrentPoints([]);
    setRedoStack([]);
    setMousePos(null);
    setFixtureDraftRect(null);
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

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Shift") setShiftPressed(true);
    };
    const onKeyUp = (e) => {
      if (e.key === "Shift") setShiftPressed(false);
    };
    const onWindowBlur = () => setShiftPressed(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  const handleWheelZoom = (e) => {
    if (!imageUrl) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    changeZoom(delta);
  };

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

  const gridSpacing = useMemo(() => {
    if (!imgRect || !naturalSize) return null;
    const zoomStep = Math.floor(Math.log2(Math.max(zoom, 0.001)));
    const baseScreenSpacing = 40;
    const screenSpacing = Math.min(
      120,
      Math.max(12, baseScreenSpacing * Math.pow(2, -zoomStep)),
    );
    return (screenSpacing / imgRect.width) * naturalSize.w;
  }, [imgRect, naturalSize, zoom]);

  const gridLines = useMemo(() => {
    if (!showGrid || !gridSpacing || !naturalSize) return { x: [], y: [] };
    const x = [];
    const y = [];
    for (let position = 0; position <= naturalSize.w; position += gridSpacing) {
      x.push(position);
    }
    for (let position = 0; position <= naturalSize.h; position += gridSpacing) {
      y.push(position);
    }
    return { x, y };
  }, [showGrid, gridSpacing, naturalSize]);

  const snapToGrid = useCallback(
    (point) => {
      if (!gridSpacing || !naturalSize) return point;
      const snappedX = Math.round(point.x / gridSpacing) * gridSpacing;
      const snappedY = Math.round(point.y / gridSpacing) * gridSpacing;
      return {
        x: Math.min(naturalSize.w, Math.max(0, snappedX)),
        y: Math.min(naturalSize.h, Math.max(0, snappedY)),
      };
    },
    [gridSpacing, naturalSize],
  );

  const activeType = objects.find((o) => o.id === activeObjectId)?.type || "";
  const isDrawingFixtureArea = activeType === "fixture_area";

  const fixtureSnapPoints = useMemo(
    () =>
      objects
        .filter((obj) => obj.type === "fixture_area" && obj.rect)
        .flatMap((obj) =>
          getFixtureConnectionPoints(obj.rect, obj.connectionCount || 1),
        ),
    [objects, getFixtureConnectionPoints],
  );

  const snapToFixturePoint = useCallback(
    (point) => {
      if (!imgRect || !naturalSize || fixtureSnapPoints.length === 0) return point;
      const pixelToNatural = naturalSize.w / imgRect.width;
      const threshold = 12 * pixelToNatural;
      let nearest = null;
      let nearestDist = Infinity;

      fixtureSnapPoints.forEach((candidate) => {
        const dx = candidate.x - point.x;
        const dy = candidate.y - point.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = candidate;
        }
      });

      return nearest && nearestDist <= threshold ? nearest : point;
    },
    [fixtureSnapPoints, imgRect, naturalSize],
  );

  // ── SVG drawing handlers ──────────────────────────────────────────────────
  const handleSvgMouseMove = (e) => {
    const raw = clientToSvg(e.clientX, e.clientY);

    if (isDrawingFixtureArea && fixtureDraftRect?.start) {
      const rect = normalizeRect(fixtureDraftRect.start, raw);
      setFixtureDraftRect((prev) => ({ ...prev, current: raw, rect }));
    }

    if (activeObjectId) {
      const snappedToGrid = shiftPressed ? snapToGrid(raw) : raw;
      const shouldSnapToFixture = ["pipe", "hot_pipe", "cold_pipe", "drain_pipe", "connection"].includes(activeType);
      setMousePos(shouldSnapToFixture ? snapToFixturePoint(snappedToGrid) : snappedToGrid);
    }
    if (dragging) {
      handleDragMove(e);
    }
  };

  const handleSvgClick = (e) => {
    if (!activeObjectId || dragging) return;
    if (isDrawingFixtureArea) return;
    const raw = clientToSvg(e.clientX, e.clientY);
    const snappedToGrid = shiftPressed ? snapToGrid(raw) : raw;
    const shouldSnapToFixture = ["pipe", "hot_pipe", "cold_pipe", "drain_pipe", "connection"].includes(activeType);
    const pos = shouldSnapToFixture ? snapToFixturePoint(snappedToGrid) : snappedToGrid;
    setCurrentPoints((prev) => [...prev, pos]);
    setRedoStack([]);
  };

  const handleSvgDoubleClick = (e) => {
    if (!activeObjectId) return;
    if (isDrawingFixtureArea) return;
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

  const handleSvgMouseDown = (e) => {
    if (!activeObjectId || !isDrawingFixtureArea) return;
    const start = clientToSvg(e.clientX, e.clientY);
    setFixtureDraftRect({
      start,
      current: start,
      rect: { x: start.x, y: start.y, width: 0, height: 0 },
    });
  };

  const handleSvgMouseUp = (e) => {
    if (!activeObjectId || !isDrawingFixtureArea || !fixtureDraftRect?.start) {
      handleDragEnd();
      return;
    }

    const end = clientToSvg(e.clientX, e.clientY);
    const rect = normalizeRect(fixtureDraftRect.start, end);
    setFixtureDraftRect(null);

    if (rect.width < 4 || rect.height < 4) {
      return;
    }

    if (onObjectUpdate) {
      onObjectUpdate(activeObjectId, {
        rect,
        fixtureName: "Fixture",
        connectionCount: 1,
      });
    }

    if (onFinishDrawing) onFinishDrawing(activeObjectId);
  };

  // ── Drag-to-reposition handlers ───────────────────────────────────────────
  const handlePathMouseDown = (e, obj) => {
    if (activeObjectId) return; // don't drag while drawing

    if (obj.id !== selectedObjectId) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

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

  const trianglePoints = (point, size = 7) => {
    const x = point.x;
    const y = point.y;
    return `${x},${y - size} ${x - size * 0.92},${y + size * 0.85} ${x + size * 0.92},${y + size * 0.85}`;
  };

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
    <div
      className="blueprint-canvas active"
      ref={containerRef}
      onWheel={handleWheelZoom}
    >
      <div className="zoom-controls" role="group" aria-label="Blueprint zoom controls">
        <button
          type="button"
          className="zoom-btn"
          onClick={() => changeZoom(-0.1)}
          title="Zoom out"
        >
          −
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="zoom-btn"
          onClick={() => changeZoom(0.1)}
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="zoom-btn fit"
          onClick={resetZoom}
          title="Reset zoom"
        >
          Fit
        </button>
      </div>

      <img
        ref={imgRef}
        src={imageUrl}
        alt="Blueprint"
        className="blueprint-image"
        style={{ transform: `scale(${zoom})` }}
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
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={(e) => {
            setMousePos(null);
            setFixtureDraftRect(null);
            if (dragging) handleDragEnd();
          }}
        >
          {showGrid && (
            <g className="grid-layer">
              {gridLines.x.map((xLine, index) => (
                <line
                  key={`grid-x-${index}`}
                  x1={xLine}
                  y1={0}
                  x2={xLine}
                  y2={naturalSize.h}
                  className={`grid-line${index % 5 === 0 ? " major" : ""}`}
                />
              ))}
              {gridLines.y.map((yLine, index) => (
                <line
                  key={`grid-y-${index}`}
                  x1={0}
                  y1={yLine}
                  x2={naturalSize.w}
                  y2={yLine}
                  className={`grid-line${index % 5 === 0 ? " major" : ""}`}
                />
              ))}
            </g>
          )}

          {/* Finished / in-progress objects */}
          {objects.map((obj) => {
            const isSelected = obj.id === selectedObjectId;
            // Guard: isOwn is only true when a real uid matches AND obj is actually assigned
            const isOwn = obj.isOwn === true;

            if (obj.type === "fixture_area" && obj.rect) {
              const points = getFixtureConnectionPoints(
                obj.rect,
                obj.connectionCount || 1,
              );
              return (
                <g key={obj.id}>
                  <rect
                    x={obj.rect.x}
                    y={obj.rect.y}
                    width={obj.rect.width}
                    height={obj.rect.height}
                    className={`fixture-area${isSelected ? " selected" : ""}`}
                    onClick={(e) => {
                      if (activeObjectId || dragging) return;
                      e.stopPropagation();
                      onObjectSelected && onObjectSelected(obj);
                    }}
                  />
                  {points.map((point, index) => (
                    <circle
                      key={`${obj.id}-fixture-conn-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={5}
                      className="fixture-connection-point"
                    />
                  ))}
                </g>
              );
            }

            const d = pointsToPath(obj.pathPoints);
            return (
              <g key={obj.id}>
                {/* Green outline rendered BEHIND the colored path for completed elements */}
                {obj.completed && d && (
                  <path
                    d={d}
                    className="blueprint-object completed-outline"
                    strokeWidth={isSelected ? 13 : 8}
                    fill="none"
                  />
                )}
                <path
                  d={d}
                  className={`blueprint-object ${obj.type}${isSelected ? " selected" : ""}${isOwn ? " own-element" : ""}`}
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

                {(obj.pathPoints || []).map((point, pointIndex) => {
                  const isPointSelected =
                    selectedPoint?.objectId === obj.id &&
                    selectedPoint?.pointIndex === pointIndex;

                  return (
                    <g key={`${obj.id}-point-${pointIndex}`}>
                      <polygon
                        points={trianglePoints(point)}
                        className={`path-point-triangle${isPointSelected ? " selected" : ""}`}
                        onClick={(e) => {
                          if (activeObjectId || dragging) return;
                          e.stopPropagation();
                          if (activePointTool && onPointToolHover) {
                            onPointToolHover(obj.id, pointIndex, activePointTool);
                          }
                          onPointSelected &&
                            onPointSelected({ objectId: obj.id, pointIndex });
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {isDrawingFixtureArea && fixtureDraftRect?.rect && (
            <rect
              x={fixtureDraftRect.rect.x}
              y={fixtureDraftRect.rect.y}
              width={fixtureDraftRect.rect.width}
              height={fixtureDraftRect.rect.height}
              className="fixture-area preview"
            />
          )}

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
