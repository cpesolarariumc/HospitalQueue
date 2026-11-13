import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { auth } from '../firebaseConfig';
import { createPrescription, removeFromQueue } from '../services/patientService';
import {
  addPatientMedicalRecord,
  subscribeToPatientDirectory,
  type PatientDirectoryEntry,
} from '../services/patientMedicalRecordService';
import PatientProfileCard from './PatientProfileCard';
import DiagnosticTestSelector from './DiagnosticTestSelector';
import DiagnosticTestProgress from './DiagnosticTestProgress';
import {
  assignDiagnosticTests,
  diagnosticTestCatalog,
} from '../services/diagnosticProgressService';
import { useUiFeedback } from './uiFeedbackContext';

function getAssignmentErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  if (code === 'permission-denied') {
    return 'Firestore denied the diagnostic write. Publish the rules in firebaseRuling.txt to the Firebase project configured by VITE_FIREBASE_PROJECT_ID. Confirm /doctors/{your-auth-uid} uses the signed-in UID and has role "doctor", and that its diagnosticPlans and diagnosticTests create rules are current.';
  }

  return error instanceof Error ? error.message : String(error);
}

interface DoctorProgressUpdateProps {
  doctorName: string;
}

export default function DoctorProgressUpdate({ doctorName }: DoctorProgressUpdateProps) {
  const { notify } = useUiFeedback();
  const [step, setStep] = useState<'selectPatient' | 'diagnosis' | 'prescription'>('selectPatient');
  const [comment, setComment] = useState('');
  const [prescriptionText, setPrescriptionText] = useState('');
  const [patients, setPatients] = useState<PatientDirectoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState<PatientDirectoryEntry | null>(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);

  useEffect(() => subscribeToPatientDirectory(
    (patientList) => {
      setPatients(patientList);
      setIsLoadingPatients(false);
      setLookupError(null);
      setPatient((currentPatient) =>
        currentPatient
          ? patientList.find((entry) => entry.id === currentPatient.id) || null
          : null,
      );
    },
    (subscriptionError) => {
      setLookupError(
        `Could not load patient profiles: ${subscriptionError.message} ` +
        'Check that the latest rules in firebaseRuling.txt are published and your doctor profile is stored at /doctors/{your-auth-uid}.',
      );
      setIsLoadingPatients(false);
    },
  ), []);

  const filteredPatients = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    if (!searchText) return patients;
    return patients.filter((entry) =>
      [entry.fullName, entry.accountNo, entry.email]
        .some((value) => value.toLowerCase().includes(searchText)),
    );
  }, [patients, search]);

  const selectPatient = (selectedPatient: PatientDirectoryEntry) => {
    setPatient(selectedPatient);
    setLookupError(null);
    setComment('');
    setPrescriptionText('');
    setSelectedTests([]);
    setStep('diagnosis');
  };

  const handleAssignTests = async () => {
    if (!patient || !comment.trim() || selectedTests.length === 0) {
      setLookupError('Find a patient, enter the diagnosis, and select at least one test before assigning.');
      return;
    }

    const tests = diagnosticTestCatalog.flatMap((group) =>
      group.tests
        .filter(([name]) => selectedTests.includes(`${group.category}::${name}`))
        .map(([name, description]) => ({ category: group.category, name, description }))
    );

    setIsAssigning(true);
    setLookupError(null);
    try {
      await assignDiagnosticTests(patient.id, comment, doctorName, tests);
      setStep('prescription');
    } catch (error) {
      setLookupError(getAssignmentErrorMessage(error));
    } finally {
      setIsAssigning(false);
    }
  };

  const handleFinish = async () => {
    if (!patient) return;

    const doctorId = auth.currentUser?.uid;
    if (!doctorId) {
      setLookupError('Your doctor session has expired. Sign in again before completing this consultation.');
      return;
    }

    setIsFinishing(true);
    setLookupError(null);
    try {
      const completedAt = new Date();
      const completedDate = completedAt.toLocaleDateString();
      const selectedTestNames = selectedTests.map((test) => test.split('::').at(-1) || test);
      const recordDetails = [
        `Diagnosis:\n${comment.trim()}`,
        `Prescription:\n${prescriptionText.trim()}`,
        selectedTestNames.length > 0
          ? `Diagnostic tests ordered:\n${selectedTestNames.map((test) => `- ${test}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n\n');

      await addPatientMedicalRecord(
        patient.id,
        `Completed consultation - ${completedDate}`,
        recordDetails,
        doctorName,
        doctorId,
      );
      await createPrescription(patient.accountNo, doctorName, prescriptionText);
      await removeFromQueue(patient.accountNo);
      notify('success', 'Consultation progress and prescription saved to the patient records.');
      setStep('selectPatient');
      setSearch('');
      setComment('');
      setPrescriptionText('');
      setPatient(null);
      setSelectedTests([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLookupError(`Could not save the completed consultation: ${message}`);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {step === 'selectPatient' && (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <header>
            <h3 className="text-lg font-bold text-slate-700">Find patient profile</h3>
            <p className="mt-1 text-sm text-slate-500">Search by patient name, account number, or email, then select a profile.</p>
          </header>
          <label className="block">
            <span className="sr-only">Search patients</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:ring-2 focus:ring-[#1b7a57]"
              placeholder="Search patient name, account number, or email"
            />
          </label>
          {lookupError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{lookupError}</p>}
          {isLoadingPatients ? (
            <p className="text-sm text-slate-500">Loading patient profiles...</p>
          ) : filteredPatients.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              {patients.length === 0 ? 'No patient profiles are available.' : 'No patients match your search.'}
            </p>
          ) : (
            <ul className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {filteredPatients.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => selectPatient(entry)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-400 hover:bg-slate-50"
                  >
                    <span className="block font-bold text-slate-800">{entry.fullName}</span>
                    <span className="mt-1 block text-xs font-mono text-slate-500">{entry.accountNo}</span>
                    {entry.email && <span className="mt-1 block break-all text-xs text-slate-500">{entry.email}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 'diagnosis' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {patient && <PatientProfileCard patient={patient} />}
          <div className="flex flex-col justify-between space-y-4 rounded-3xl border border-slate-200 bg-white p-6 lg:col-span-2">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Diagnosis Comment</label>
              <textarea
                rows={5}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#1b7a57] text-sm"
                placeholder="Enter diagnosis notes..."
              />
            </div>
            <DiagnosticTestSelector
              diagnosis={comment}
              selectedTests={selectedTests}
              onSelectionChange={setSelectedTests}
            />
            {lookupError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{lookupError}</p>}
            {(!comment.trim() || selectedTests.length === 0) && (
              <p className="text-xs text-slate-500">
                To enable assignment, enter a diagnosis and select at least one test ({selectedTests.length} selected).
              </p>
            )}
            <div className="flex space-x-4">
              <button
                onClick={() => setStep('selectPatient')}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-[#1b7a57]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to patients
              </button>
              <button
                disabled={!comment.trim() || selectedTests.length === 0 || isAssigning}
                onClick={() => void handleAssignTests()}
                className="flex-1 rounded-2xl bg-[#1b7a57] py-3 font-bold text-white shadow transition hover:bg-[#155f44] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAssigning ? 'Assigning tests...' : 'Assign tests & continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'prescription' && (
        <div className="space-y-6">
          {patient && <PatientProfileCard patient={patient} />}
          {patient && <DiagnosticTestProgress patientId={patient.id} canUpdate />}
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="border-b pb-2 text-lg font-bold text-slate-800">Prescription</h3>
            {lookupError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{lookupError}</p>}
            <textarea
              required
              rows={6}
              value={prescriptionText}
              onChange={(e) => setPrescriptionText(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-[#1b7a57]"
              placeholder="Write prescription or upload images..."
            />
            <div className="flex space-x-4">
              <button
                onClick={() => setStep('diagnosis')}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-[#1b7a57]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to diagnosis
              </button>
              <button
                disabled={!prescriptionText.trim() || isFinishing}
                onClick={() => void handleFinish()}
                className="flex-1 rounded-2xl bg-[#1b7a57] py-3 font-bold text-white shadow transition hover:bg-[#155f44] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFinishing ? 'Saving consultation...' : 'Finish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}