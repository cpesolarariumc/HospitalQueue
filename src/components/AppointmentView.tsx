import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  XCircle 
} from 'lucide-react';
import { 
  requestAppointment, 
  subscribeToAppointments, 
  subscribeToAppointmentSlots,
  updateAppointmentStatus,
  type AppointmentRequest 
} from '../services/appointmentService';
import { useUiFeedback } from './uiFeedbackContext';

interface AppointmentViewProps {
  currentUser: { name: string; accountNo?: string; uid: string };
  onNotify: (kind: 'success' | 'error' | 'info', message: string) => void;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const appointmentTimeSlots = Array.from({ length: 15 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
});

function normalizeTimeSlot(timeSlot: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(timeSlot.trim());
  if (!match) return timeSlot.trim().toUpperCase();

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || hour > 24) return timeSlot.trim().toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return timeSlot.trim().toUpperCase();
    hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function AppointmentView({ currentUser, onNotify }: AppointmentViewProps) {
  const { confirm: confirmInUi } = useUiFeedback();
  const [viewMode, setViewMode] = useState<'month' | 'day' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [serviceType, setServiceType] = useState('General Checkup');
  const [timeSlot, setTimeSlot] = useState('08:00 AM');
  const [appointments, setAppointments] = useState<AppointmentRequest[]>([]);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [slotAvailability, setSlotAvailability] = useState<{
    date: string;
    slots: string[];
    error?: string;
  }>({ date: '', slots: [] });

  useEffect(() => {
    const unsubscribe = subscribeToAppointments((data) => {
      setAppointments(data);
      setAppointmentsError(null);
    }, currentUser.uid, (error) => setAppointmentsError(error.message));
    return () => unsubscribe();
  }, [currentUser.uid]);

  useEffect(() => subscribeToAppointmentSlots(
    toDateKey(selectedDate),
    (slots) => {
      setSlotAvailability({
        date: toDateKey(selectedDate),
        slots: slots.map((slot) => normalizeTimeSlot(slot.timeSlot)),
      });
    },
    (error) => setSlotAvailability({
      date: toDateKey(selectedDate),
      slots: [],
      error: error.message,
    }),
  ), [selectedDate]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slotAvailability.date !== selectedDateKey || slotAvailability.error) {
      if (slotAvailability.error) {
        alert(`Could not verify appointment availability: ${slotAvailability.error}`);
      } else {
        onNotify('info', 'Still checking availability. Please try again in a moment.');
      }
      return;
    }
    const bookingTimeSlot = availableTimeSlots.includes(timeSlot)
      ? timeSlot
      : availableTimeSlots[0] || '';
    if (!bookingTimeSlot) {
      onNotify('info', 'There are no available appointment times on this date. Please choose another date.');
      return;
    }

    const slotIsTaken = appointments.some((appointment) =>
      appointment.date === selectedDateKey &&
      appointment.status !== 'cancelled' &&
      normalizeTimeSlot(appointment.timeSlot) === normalizeTimeSlot(bookingTimeSlot)
    ) || slotAvailability.slots.includes(normalizeTimeSlot(bookingTimeSlot));
    if (slotIsTaken) {
      onNotify('error', 'That time has just been booked. Please choose another available time.');
      return;
    }

    try {
      await requestAppointment({
        patientId: currentUser.uid,
        accountNo: currentUser.accountNo || 'PTNT1AC2B',
        patientName: currentUser.name,
        date: selectedDateKey,
        timeSlot: bookingTimeSlot,
        serviceType,
      });
      onNotify('success', 'Appointment request submitted! Pending admin approval.');
      setShowModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify('error', `Error booking appointment: ${message}`);
    }
  };

  const handleCancelAppointment = async (id: string) => {
    const accepted = await confirmInUi({
      title: 'Cancel appointment request?',
      message: 'Are you sure you want to cancel this appointment request?',
      confirmLabel: 'Cancel appointment',
      destructive: true,
    });
    if (accepted) {
      try {
        await updateAppointmentStatus(id, 'cancelled');
        onNotify('success', 'Appointment cancelled successfully.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onNotify('error', `Error cancelling appointment: ${message}`);
      }
    }
  };

  const userAppointments = appointments.filter(
    (a) => a.accountNo === (currentUser.accountNo || 'PTNT1AC2B')
  );
  const selectedDateKey = toDateKey(selectedDate);
  const slotAvailabilityLoaded = slotAvailability.date === selectedDateKey && !slotAvailability.error;
  const takenTimeSlots = new Set(
    appointments
      .filter((appointment) => appointment.date === selectedDateKey && appointment.status !== 'cancelled')
      .map((appointment) => normalizeTimeSlot(appointment.timeSlot))
  );
  if (slotAvailabilityLoaded) {
    slotAvailability.slots.forEach((slot) => takenTimeSlots.add(slot));
  }
  const availableTimeSlots = appointmentTimeSlots.filter(
    (slot) => slotAvailabilityLoaded && !takenTimeSlots.has(normalizeTimeSlot(slot))
  );
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const calendarCellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: calendarCellCount }, (_, index) => {
    const dayNumber = index - leadingDays + 1;
    return dayNumber > 0 && dayNumber <= daysInMonth ? dayNumber : null;
  });
  const todayKey = toDateKey(new Date());
  const displayedMonth = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(selectedDate);

  const navigateCalendar = (direction: -1 | 1) => {
    if (viewMode === 'day') {
      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + direction);
      setSelectedDate(nextDate);
      return;
    }

    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + direction, 1));
  };

  const goToToday = () => setSelectedDate(new Date());

  return (
    <div className="min-w-0 space-y-4 font-sans sm:space-y-6">
      {appointmentsError && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          Could not load your appointment requests: {appointmentsError}
        </p>
      )}
      {/* Top Controls Header */}
      <div className="flex flex-col items-stretch justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:p-4">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            aria-label={viewMode === 'day' ? 'Previous day' : 'Previous month'}
            onClick={() => navigateCalendar(-1)}
            className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
          >
            <ChevronLeft className="w-4 h-4 text-slate-700" />
          </button>
          <button
            type="button"
            aria-label={viewMode === 'day' ? 'Next day' : 'Next month'}
            onClick={() => navigateCalendar(1)}
            className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
          >
            <ChevronRight className="w-4 h-4 text-slate-700" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-4 py-2 bg-[#1b7a57] text-white font-bold rounded-xl text-sm shadow"
          >
            Today
          </button>
        </div>

        <h2 className="text-center text-base font-extrabold tracking-wide text-slate-800 sm:text-lg">
          {displayedMonth}
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:space-x-3">
          <div className="bg-slate-100 p-1 rounded-xl flex space-x-1">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'day' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Day
            </button>
            
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'month' ? 'bg-[#1b7a57] text-white shadow' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Month
            </button>
          </div>

          <button
            onClick={() => {
              setTimeSlot(availableTimeSlots[0] || '');
              setShowModal(true);
            }}
            className="flex items-center space-x-2 rounded-xl bg-[#1b7a57] px-3 py-2 text-sm font-bold text-white shadow transition hover:bg-emerald-700 sm:px-4"
          >
            <Plus className="w-4 h-4" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
          <div>
            <div className="grid grid-cols-7 gap-1 border-b border-slate-100 py-2 text-center text-[10px] font-bold text-slate-400 sm:gap-2 sm:text-xs">
              <span><span className="sm:hidden">M</span><span className="hidden sm:inline">Mon</span></span>
              <span><span className="sm:hidden">T</span><span className="hidden sm:inline">Tue</span></span>
              <span><span className="sm:hidden">W</span><span className="hidden sm:inline">Wed</span></span>
              <span><span className="sm:hidden">T</span><span className="hidden sm:inline">Thu</span></span>
              <span><span className="sm:hidden">F</span><span className="hidden sm:inline">Fri</span></span>
              <span><span className="sm:hidden">S</span><span className="hidden sm:inline">Sat</span></span>
              <span><span className="sm:hidden">S</span><span className="hidden sm:inline">Sun</span></span>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((dayNum, i) => {
              if (dayNum === null) {
                return <div key={`empty-${i}`} aria-hidden="true" />;
              }

              const dayDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), dayNum);
              const dayKey = toDateKey(dayDate);
              const dayAppts = userAppointments.filter((a) => a.date === dayKey);
              const isSelected = selectedDateKey === dayKey;
              const isToday = todayKey === dayKey;

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${dayDate.toLocaleDateString()}`}
                  onClick={() => setSelectedDate(dayDate)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedDate(dayDate);
                    }
                  }}
                  className={`flex min-h-[64px] min-w-0 cursor-pointer flex-col rounded-lg border p-1 text-left transition focus:outline-none focus:ring-2 focus:ring-[#1b7a57] sm:min-h-[110px] sm:justify-between sm:rounded-2xl sm:p-3 ${
                    isSelected ? 'border-[#1b7a57] bg-emerald-50/50' : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(dayDate)}
                    aria-label={`Select ${dayDate.toLocaleDateString()}`}
                    className={`mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-[#1b7a57] text-white' : 'text-slate-700'}`}
                  >
                    {dayNum}
                  </button>
                  <div className="hidden space-y-1 sm:block">
                    {dayAppts.map((app) => (
                      <div
                        key={app.id}
                        className={`text-[10px] font-semibold p-1.5 rounded border flex items-center justify-between ${
                          app.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : app.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-red-100 text-red-800 border-red-200 line-through'
                        }`}
                      >
                        <span className="truncate">{app.timeSlot}</span>
                        {app.status !== 'cancelled' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelAppointment(app.id!);
                            }}
                            title="Cancel Appointment"
                            className="ml-1 text-red-600 hover:text-red-900"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {dayAppts.length > 0 && (
                    <div
                      aria-label={`${dayAppts.length} appointment${dayAppts.length === 1 ? '' : 's'}`}
                      className="flex min-h-2 flex-wrap items-center gap-0.5 sm:hidden"
                    >
                      {dayAppts.slice(0, 3).map((app) => (
                        <span
                          key={app.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            app.status === 'confirmed'
                              ? 'bg-emerald-600'
                              : app.status === 'pending'
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                        />
                      ))}
                      {dayAppts.length > 3 && (
                        <span className="text-[9px] leading-none text-slate-500">+{dayAppts.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* DAY / AGENDA VIEW */}
      {viewMode === 'day' && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
          {slotAvailability.date === selectedDateKey && slotAvailability.error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              Could not load booked appointment times: {slotAvailability.error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800">
              Agenda for {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h3>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
              {userAppointments.filter((a) => a.date === selectedDateKey && a.status !== 'cancelled').length} Scheduled
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {appointmentTimeSlots.map((slot) => {
              const matched = userAppointments.find(
                (appointment) =>
                  appointment.date === selectedDateKey &&
                  appointment.status !== 'cancelled' &&
                  normalizeTimeSlot(appointment.timeSlot) === normalizeTimeSlot(slot)
              );
              const slotIsTaken = takenTimeSlots.has(normalizeTimeSlot(slot));

              return (
                <div key={slot} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
                  <div className="flex items-center space-x-3 text-sm font-semibold text-slate-600">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>{slot}</span>
                  </div>

                  {matched ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 sm:space-x-3 sm:px-4">
                      <span>{matched.serviceType} ({matched.status})</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {matched.status !== 'cancelled' && (
                        <button onClick={() => handleCancelAppointment(matched.id!)} className="text-red-600 hover:text-red-800 ml-2">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ) : slotIsTaken ? (
                    <span className="text-xs font-bold text-slate-400">Unavailable</span>
                  ) : (
                    <button
                      onClick={() => { setTimeSlot(slot); setShowModal(true); }}
                      className="text-xs font-bold text-[#1b7a57] hover:underline"
                    >
                      + Click to book slot
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* NEW BOOKING MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-md space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-8">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>

            <h3 className="font-bold text-xl text-slate-800 flex items-center space-x-2">
              <CalendarIcon className="w-6 h-6 text-[#1b7a57]" />
              <span>Request New Appointment</span>
            </h3>

            <form onSubmit={handleBookingSubmit} className="space-y-4">
              {slotAvailability.date === selectedDateKey && slotAvailability.error && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  Could not verify availability: {slotAvailability.error}
                </p>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Service / Checkup Type</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-800 text-sm focus:ring-2 focus:ring-[#1b7a57]"
                >
                  <option value="General Checkup">General Checkup</option>
                  <option value="Follow-up Scan">Follow-up Scan</option>
                  <option value="Cardiology Consultation">Cardiology Consultation</option>
                  <option value="Diagnostic Lab Work">Diagnostic Lab Work</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={selectedDateKey}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const nextDate = fromDateKey(e.target.value);
                    setSelectedDate(nextDate);
                    const nextDateKey = toDateKey(nextDate);
                    const nextTakenSlots = new Set(
                      appointments
                        .filter((appointment) => appointment.date === nextDateKey && appointment.status !== 'cancelled')
                        .map((appointment) => normalizeTimeSlot(appointment.timeSlot))
                    );
                    const nextAvailableSlot = appointmentTimeSlots.find(
                      (slot) => !nextTakenSlots.has(normalizeTimeSlot(slot))
                    );
                    if (nextAvailableSlot) setTimeSlot(nextAvailableSlot);
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-800 text-sm focus:ring-2 focus:ring-[#1b7a57]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Time Slot</label>
                <select
                  required
                  value={availableTimeSlots.includes(timeSlot) ? timeSlot : availableTimeSlots[0] || ''}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-800 text-sm focus:ring-2 focus:ring-[#1b7a57]"
                >
                  {availableTimeSlots.length === 0 ? (
                    <option value="" disabled>No times available</option>
                  ) : (
                    availableTimeSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)
                  )}
                </select>
              </div>

              <button
                type="submit"
                disabled={!slotAvailabilityLoaded || availableTimeSlots.length === 0}
                className="w-full py-3.5 bg-[#1b7a57] hover:bg-emerald-700 text-white font-bold rounded-2xl shadow transition"
              >
                Submit Request for Admin Approval
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}