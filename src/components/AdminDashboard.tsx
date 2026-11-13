import type { QueuePatient } from '../services/patientService';

interface AdminDashboardProps {
  queue: QueuePatient[];
  cancelledCount: number;
}

export default function AdminDashboard({ queue, cancelledCount }: AdminDashboardProps) {
  const emergencyCount = queue.filter(p => p.isEmergency).length;
  const appointCount = queue.length;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase">Emergency</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{emergencyCount}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase">Appointment</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{appointCount}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase">Canceled</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{cancelledCount}</p>
        </div>
      </div>

      {/* Live Queue Box */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-center font-bold text-slate-800 text-lg mb-4">Live Queue</h3>
        <hr className="border-slate-100 mb-4" />
        
        <div className="space-y-3">
          {queue.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">No patients currently in the queue.</p>
          ) : (
            queue.map((patient, index) => (
              <div key={patient.accountNo || index} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="font-bold text-slate-800">{patient.fullName}</p>
                  <p className="text-xs text-slate-500 font-mono">ID: {patient.accountNo}</p>
                  {patient.traumaType && (
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      {patient.traumaType}
                      {patient.traumaLevel ? ` · Trauma Level ${patient.traumaLevel}` : ''}
                    </p>
                  )}
                  {patient.traumaSpecification && (
                    <p className="mt-1 text-xs text-slate-600">
                      Details: {patient.traumaSpecification}
                    </p>
                  )}
                  {patient.room && (
                    <p className="mt-0.5 text-xs font-semibold text-emerald-700">{patient.room}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {patient.isEmergency && (
                    <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-lg">Emergency</span>
                  )}
                  <span className="text-sm font-bold text-[#1b7a57]">#{index + 1}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}