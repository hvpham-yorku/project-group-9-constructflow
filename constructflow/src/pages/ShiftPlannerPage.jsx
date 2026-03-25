import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import "../styles/ShiftPlanner.css";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROLE_LABELS = {
  electrician: "Electrician",
  plumber: "Plumber",
};

function startOfWeek(date) {
  const base = new Date(date);
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + mondayOffset);
  return base;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatHour(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized}:00 ${suffix}`;
}

function formatShiftRange(start, end) {
  return `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ShiftPlannerPage() {
  const { currentUser, organizationId } = useAuth();

  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [shifts, setShifts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingShift, setSavingShift] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrentHour, setDragCurrentHour] = useState(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const selectedWorker =
    workers.find((worker) => worker.uid === selectedWorkerId) || null;

  useEffect(() => {
    if (!organizationId) return;
    const loadWorkers = async () => {
      setLoadingData(true);
      try {
        const workersQuery = query(
          collection(db, "users"),
          where("organizationId", "==", organizationId),
          where("role", "in", ["electrician", "plumber"]),
        );
        const workerSnap = await getDocs(workersQuery);
        const list = workerSnap.docs
          .map((workerDoc) => ({ uid: workerDoc.id, ...workerDoc.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        setWorkers(list);
        if (list.length > 0) {
          setSelectedWorkerId((prev) => prev || list[0].uid);
        }
      } catch (err) {
        console.error("Failed to load workers:", err);
      }
      setLoadingData(false);
    };

    loadWorkers();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !selectedWorkerId) return;

    const loadShifts = async () => {
      try {
        const shiftsQuery = query(
          collection(db, "workerShifts"),
          where("organizationId", "==", organizationId),
          where("workerId", "==", selectedWorkerId),
        );
        const shiftSnap = await getDocs(shiftsQuery);
        const allShifts = shiftSnap.docs.map((shiftDoc) => ({
          id: shiftDoc.id,
          ...shiftDoc.data(),
        }));

        const weekEnd = addDays(weekStart, 7);
        const inWeek = allShifts.filter((shift) => {
          const start = toDate(shift.startAt);
          return start && start >= weekStart && start < weekEnd;
        });

        inWeek.sort(
          (a, b) =>
            (toDate(a.startAt)?.getTime() || 0) -
            (toDate(b.startAt)?.getTime() || 0),
        );
        setShifts(inWeek);
      } catch (err) {
        console.error("Failed to load shifts:", err);
      }
    };

    loadShifts();
  }, [organizationId, selectedWorkerId, weekStart]);

  const shiftsByDay = useMemo(() => {
    const map = new Map();
    weekDays.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    shifts.forEach((shift) => {
      const start = toDate(shift.startAt);
      const end = toDate(shift.endAt);
      if (!start || !end) return;
      const key = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      ).toDateString();
      if (!map.has(key)) return;
      map.get(key).push({ ...shift, start, end });
    });

    return map;
  }, [shifts, weekDays]);

  const draftRange = useMemo(() => {
    if (!dragStart || dragCurrentHour === null) return null;
    const startHour = Math.min(dragStart.hour, dragCurrentHour);
    const endHour = Math.max(dragStart.hour, dragCurrentHour) + 1;
    return { dayIndex: dragStart.dayIndex, startHour, endHour };
  }, [dragStart, dragCurrentHour]);

  const deleteShift = async (shiftId) => {
    if (!window.confirm("Delete this shift block?")) return;
    try {
      await deleteDoc(doc(db, "workerShifts", shiftId));
      setShifts((prev) => prev.filter((shift) => shift.id !== shiftId));
    } catch (err) {
      console.error("Failed to delete shift:", err);
      alert("Failed to delete shift block.");
    }
  };

  useEffect(() => {
    if (!dragStart || draftRange === null) return;

    const handleMouseUp = async () => {
      if (
        !selectedWorker ||
        !organizationId ||
        !currentUser?.uid ||
        !draftRange
      ) {
        setDragStart(null);
        setDragCurrentHour(null);
        return;
      }

      setSavingShift(true);
      try {
        const day = weekDays[draftRange.dayIndex];
        const startDate = new Date(day);
        startDate.setHours(draftRange.startHour, 0, 0, 0);
        const endDate = new Date(day);
        endDate.setHours(draftRange.endHour, 0, 0, 0);

        await addDoc(collection(db, "workerShifts"), {
          organizationId,
          workerId: selectedWorker.uid,
          workerName: selectedWorker.name || selectedWorker.email || "Worker",
          workerRole: selectedWorker.role || null,
          startAt: startDate,
          endAt: endDate,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "users", selectedWorker.uid), {
          shiftStartAt: startDate,
          shiftEndAt: endDate,
        });

        const refreshed = await getDocs(
          query(
            collection(db, "workerShifts"),
            where("organizationId", "==", organizationId),
            where("workerId", "==", selectedWorker.uid),
          ),
        );
        const weekEnd = addDays(weekStart, 7);
        const inWeek = refreshed.docs
          .map((shiftDoc) => ({ id: shiftDoc.id, ...shiftDoc.data() }))
          .filter((shift) => {
            const start = toDate(shift.startAt);
            return start && start >= weekStart && start < weekEnd;
          });
        setShifts(inWeek);
      } catch (err) {
        console.error("Failed to create shift:", err);
        alert("Failed to create shift block.");
      }
      setSavingShift(false);
      setDragStart(null);
      setDragCurrentHour(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [
    currentUser?.uid,
    dragStart,
    draftRange,
    organizationId,
    selectedWorker,
    weekDays,
    weekStart,
  ]);

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Shift Planner" />

        <div className="shift-planner-page">
          <div className="shift-planner-header">
            <div>
              <h2>Weekly Shift Planner</h2>
              <p>
                Select a worker from the right panel. Calendar blocks only show
                shifts for that selected worker.
              </p>
            </div>
            <div className="week-nav">
              <button
                className="btn-secondary"
                onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                disabled={savingShift}
              >
                <MdChevronLeft /> Previous
              </button>
              <div className="week-label">
                {weekStart.toLocaleDateString()} -{" "}
                {addDays(weekStart, 6).toLocaleDateString()}
              </div>
              <button
                className="btn-secondary"
                onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                disabled={savingShift}
              >
                Next <MdChevronRight />
              </button>
            </div>
          </div>

          <div className="shift-planner-layout">
            <div className="shift-calendar-wrap">
              {loadingData ? (
                <div className="shift-loading">Loading workers...</div>
              ) : !selectedWorker ? (
                <div className="shift-loading">No workers available.</div>
              ) : (
                <>
                  <div className="shift-days-header">
                    <div className="time-col-header" />
                    {weekDays.map((day) => (
                      <div key={day.toDateString()} className="day-col-header">
                        <span>
                          {day.toLocaleDateString([], { weekday: "short" })}
                        </span>
                        <strong>
                          {day.toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <div className="shift-grid-scroll">
                    <div className="shift-grid">
                      <div className="time-col">
                        {HOURS.map((hour) => (
                          <div key={hour} className="time-cell">
                            {formatHour(hour)}
                          </div>
                        ))}
                      </div>

                      {weekDays.map((day, dayIndex) => {
                        const dayShifts =
                          shiftsByDay.get(day.toDateString()) || [];
                        return (
                          <div key={day.toDateString()} className="day-col">
                            {HOURS.map((hour) => {
                              const isDraft =
                                draftRange &&
                                draftRange.dayIndex === dayIndex &&
                                hour >= draftRange.startHour &&
                                hour < draftRange.endHour;

                              return (
                                <div
                                  key={`${day.toDateString()}-${hour}`}
                                  className={`grid-cell${isDraft ? " draft" : ""}`}
                                  onMouseDown={() => {
                                    if (savingShift) return;
                                    setDragStart({ dayIndex, hour });
                                    setDragCurrentHour(hour);
                                  }}
                                  onMouseEnter={() => {
                                    if (
                                      !dragStart ||
                                      dragStart.dayIndex !== dayIndex
                                    )
                                      return;
                                    setDragCurrentHour(hour);
                                  }}
                                />
                              );
                            })}

                            {dayShifts.map((shift) => {
                              const top = shift.start.getHours() * 48;
                              const hours = Math.max(
                                1,
                                (shift.end.getTime() - shift.start.getTime()) /
                                  (60 * 60 * 1000),
                              );
                              const height = hours * 48;

                              return (
                                <div
                                  key={shift.id}
                                  className="shift-block"
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                  }}
                                >
                                  <div className="shift-block-time">
                                    {formatShiftRange(shift.start, shift.end)}
                                  </div>
                                  <button
                                    className="shift-delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteShift(shift.id);
                                    }}
                                    title="Delete shift"
                                  >
                                    x
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <aside className="shift-workers-panel">
              <h3>Workers</h3>
              <p className="shift-workers-hint">
                Choose one worker to display and edit their weekly blocks.
              </p>

              <div className="shift-worker-list">
                {workers.map((worker) => {
                  const isSelected = selectedWorkerId === worker.uid;
                  return (
                    <button
                      key={worker.uid}
                      className={`shift-worker-item${isSelected ? " active" : ""}`}
                      onClick={() => setSelectedWorkerId(worker.uid)}
                    >
                      <span className="shift-worker-name">
                        {worker.name || worker.email}
                      </span>
                      <span className="shift-worker-role">
                        {ROLE_LABELS[worker.role] || worker.role || "Worker"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
