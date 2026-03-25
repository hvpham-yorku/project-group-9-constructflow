import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
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

function toDayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function WorkerShiftsPage() {
  const { currentUser, organizationId } = useAuth();

  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [shifts, setShifts] = useState([]);
  const [attendanceEntries, setAttendanceEntries] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

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
          const me = list.find((worker) => worker.uid === currentUser?.uid);
          setSelectedWorkerId(me ? me.uid : list[0].uid);
        }
      } catch (err) {
        console.error("Failed to load workers:", err);
      }
      setLoadingData(false);
    };

    loadWorkers();
  }, [organizationId, currentUser?.uid]);

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
        const allShifts = shiftSnap.docs
          .map((shiftDoc) => {
            const raw = shiftDoc.data();
            return {
              id: shiftDoc.id,
              start: toDate(raw.startAt),
              end: toDate(raw.endAt),
              workerId: raw.workerId,
              workerName: raw.workerName,
              workerRole: raw.workerRole,
            };
          })
          .filter((shift) => shift.start && shift.end);

        const weekEnd = addDays(weekStart, 7);
        const inWeek = allShifts.filter(
          (shift) => shift.start >= weekStart && shift.start < weekEnd,
        );

        inWeek.sort((a, b) => a.start.getTime() - b.start.getTime());
        setShifts(inWeek);
      } catch (err) {
        console.error("Failed to load shifts:", err);
      }
    };

    loadShifts();
  }, [organizationId, selectedWorkerId, weekStart]);

  useEffect(() => {
    if (!organizationId || !selectedWorkerId) return;

    const loadAttendance = async () => {
      try {
        const attendanceQuery = query(
          collection(db, "workerAttendance"),
          where("organizationId", "==", organizationId),
          where("workerId", "==", selectedWorkerId),
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const weekEnd = addDays(weekStart, 7);

        const entries = attendanceSnap.docs
          .map((recordDoc) => {
            const raw = recordDoc.data();
            return {
              id: recordDoc.id,
              dayKey: raw.dayKey || null,
              clockInAt: toDate(raw.clockInAt),
              clockOutAt: toDate(raw.clockOutAt),
            };
          })
          .filter((entry) => entry.clockInAt)
          .filter(
            (entry) =>
              entry.clockInAt >= weekStart && entry.clockInAt < weekEnd,
          );

        if (selectedWorker?.isClockedIn && selectedWorker?.clockedInAt) {
          const liveClockIn = toDate(selectedWorker.clockedInAt);
          if (
            liveClockIn &&
            liveClockIn >= weekStart &&
            liveClockIn < weekEnd
          ) {
            const liveDayKey = toDayKey(liveClockIn);
            const alreadyHasEntry = entries.some(
              (entry) =>
                (entry.dayKey || toDayKey(entry.clockInAt)) === liveDayKey,
            );
            if (!alreadyHasEntry) {
              entries.push({
                id: `live-${selectedWorkerId}-${liveDayKey}`,
                dayKey: liveDayKey,
                clockInAt: liveClockIn,
                clockOutAt: null,
              });
            }
          }
        }

        setAttendanceEntries(entries);
      } catch (err) {
        console.error("Failed to load attendance:", err);
        setAttendanceEntries([]);
      }
    };

    loadAttendance();
  }, [organizationId, selectedWorkerId, weekStart, selectedWorker]);

  const shiftsByDay = useMemo(() => {
    const map = new Map();
    weekDays.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    shifts.forEach((shift) => {
      const key = new Date(
        shift.start.getFullYear(),
        shift.start.getMonth(),
        shift.start.getDate(),
      ).toDateString();
      if (!map.has(key)) return;
      map.get(key).push(shift);
    });

    return map;
  }, [shifts, weekDays]);

  const attendanceByDay = useMemo(() => {
    const map = new Map();
    weekDays.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    attendanceEntries.forEach((entry) => {
      const start = entry.clockInAt;
      if (!start) return;
      const dayKey = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      ).toDateString();
      if (!map.has(dayKey)) return;
      const end = entry.clockOutAt || new Date();
      map.get(dayKey).push({ ...entry, start, end });
    });

    return map;
  }, [attendanceEntries, weekDays]);

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Shifts" />

        <div className="shift-planner-page">
          <div className="shift-planner-header">
            <div>
              <h2>Weekly Shifts</h2>
              <p>
                Read-only view. You can browse your team schedule and attendance
                overlays.
              </p>
            </div>
            <div className="week-nav">
              <button
                className="btn-secondary"
                onClick={() => setWeekStart((prev) => addDays(prev, -7))}
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

                      {weekDays.map((day) => {
                        const dayShifts =
                          shiftsByDay.get(day.toDateString()) || [];
                        const dayAttendance =
                          attendanceByDay.get(day.toDateString()) || [];
                        return (
                          <div key={day.toDateString()} className="day-col">
                            {HOURS.map((hour) => (
                              <div
                                key={`${day.toDateString()}-${hour}`}
                                className="grid-cell"
                              />
                            ))}

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
                                </div>
                              );
                            })}

                            {dayAttendance.map((entry) => {
                              const startDecimal =
                                entry.start.getHours() +
                                entry.start.getMinutes() / 60;
                              const endDecimal =
                                entry.end.getHours() +
                                entry.end.getMinutes() / 60;
                              const top = startDecimal * 48;
                              const height = Math.max(
                                12,
                                (endDecimal - startDecimal) * 48,
                              );

                              return (
                                <div
                                  key={entry.id}
                                  className="shift-attendance-overlay"
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                  }}
                                >
                                  <span className="shift-attendance-time">
                                    {entry.clockOutAt
                                      ? `Attended ${formatShiftRange(entry.start, entry.end)}`
                                      : `In shift since ${entry.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                                  </span>
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
                Select a worker to view their weekly shifts.
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
