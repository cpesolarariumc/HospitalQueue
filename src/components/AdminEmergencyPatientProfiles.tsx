import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  mergeEmergencyPatientProfile,
  subscribeToPatientDirectory,
  updateEmergencyPatientProfile,
  type PatientDirectoryEntry,
} from '../services/patientMedicalRecordService';
import { calculateAgeFromBirthday } from '../utils/dateUtils';

type EmergencyPatientProfileDraft = Pick<
  PatientDirectoryEntry,
  'fullName' | 'email' | 'sex' | 'age' | 'birthday' | 'contact' | 'address' | 'allergies'
>;

interface AdminEmergencyPatientProfilesProps {
  onNotify: (kind: 'success' | 'error' | 'info', message: string) => void;
}

const emptyProfile: EmergencyPatientProfileDraft = {
  fullName: '',
  email: '',
  sex: '',
  age: '',
  birthday: '',
  contact: '',
  address: '',
  allergies: '',
};

export default function AdminEmergencyPatientProfiles({
  onNotify,
}: AdminEmergencyPatientProfilesProps) {
  const [patients, setPatients] = useState<PatientDirectoryEntry[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [matchCandidates, setMatchCandidates] = useState<PatientDirectoryEntry[]>([]);
  const [selectedMatchPatientId, setSelectedMatchPatientId] = useState('');
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState<EmergencyPatientProfileDraft>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [isMergeConfirmationVisible, setIsMergeConfirmationVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToPatientDirectory(
    (patientList) => {
      setPatients(patientList);
      setLoading(false);
      setError(null);
    },
    (subscriptionError) => {
      setError(`Could not load emergency patient profiles: ${subscriptionError.message}`);
      setLoading(false);
    },
  ), []);

  const emergencyPatients = useMemo(
    () => patients.filter((patient) =>
      patient.accountNo.trim().toUpperCase().startsWith('PTNT-EMER-'),
    ),
    [patients],
  );
  const filteredPatients = useMemo(() => {
    const searchText = search.trim().toUpperCase();
    if (!searchText) return emergencyPatients;
    return emergencyPatients.filter((patient) =>
      patient.accountNo.trim().toUpperCase().includes(searchText),
    );
  }, [emergencyPatients, search]);
  const selectedPatient = emergencyPatients.find((patient) => patient.id === selectedPatientId);

  const selectPatient = (patient: PatientDirectoryEntry) => {
    setSelectedPatientId(patient.id);
    setProfile({
      fullName: patient.fullName,
      email: patient.email,
      sex: patient.sex,
      age: calculateAgeFromBirthday(patient.birthday) || patient.age,
      birthday: patient.birthday,
      contact: patient.contact,
      address: patient.address,
      allergies: patient.allergies,
    });
    setMatchCandidates([]);
    setSelectedMatchPatientId('');
    setIsMergeConfirmationVisible(false);
    setError(null);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPatient) return;
    if (profile.birthday.trim() && !calculateAgeFromBirthday(profile.birthday)) {
      onNotify('error', 'Enter a valid birthday as YYYY-MM-DD before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateEmergencyPatientProfile(selectedPatient.id, profile);
      const normalizedName = profile.fullName.trim().replace(/\s+/g, ' ').toLowerCase();
      const matches = patients.filter((patient) =>
        patient.id !== selectedPatient.id &&
        patient.temporary !== true &&
        !patient.accountNo.trim().toUpperCase().startsWith('PTNT-EMER-') &&
        patient.fullName.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedName,
      );
      setMatchCandidates(matches);
      setSelectedMatchPatientId('');
      setIsMergeConfirmationVisible(false);
      onNotify(
        matches.length > 0 ? 'info' : 'success',
        matches.length > 0
          ? 'Profile saved. A registered patient has the same name; select the correct account to merge.'
          : `Profile for ${selectedPatient.accountNo} was updated.`,
      );
    } catch (saveError) {
      onNotify(
        'error',
        `Could not update the emergency patient profile: ${
          saveError instanceof Error ? saveError.message : String(saveError)
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof EmergencyPatientProfileDraft, value: string) => {
    setProfile((currentProfile) => ({ ...currentProfile, [field]: value }));
    if (field === 'fullName') {
      setMatchCandidates([]);
      setSelectedMatchPatientId('');
      setIsMergeConfirmationVisible(false);
    }
  };

  const updateBirthday = (birthday: string) => {
    setProfile((currentProfile) => ({
      ...currentProfile,
      birthday,
      age: calculateAgeFromBirthday(birthday),
    }));
  };

  const mergeSelectedPatient = async () => {
    if (!selectedPatient) return;
    const matchedPatient = matchCandidates.find(
      (patient) => patient.id === selectedMatchPatientId,
    );
    if (!matchedPatient) return;

    setMerging(true);
    try {
      await mergeEmergencyPatientProfile(
        selectedPatient.id,
        matchedPatient.id,
        profile,
      );
      setSelectedPatientId('');
      setMatchCandidates([]);
      setSelectedMatchPatientId('');
      setIsMergeConfirmationVisible(false);
      setProfile(emptyProfile);
      onNotify(
        'success',
        `Emergency profile merged into ${matchedPatient.accountNo}; the temporary profile was deleted.`,
      );
    } catch (mergeError) {
      onNotify(
        'error',
        `Could not merge the emergency profile: ${
          mergeError instanceof Error ? mergeError.message : String(mergeError)
        }`,
      );
    } finally {
      setMerging(false);
    }
  };

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-xl font-bold text-slate-800">Emergency Patient Profiles</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search by patient number and update the emergency patient’s profile.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label htmlFor="emergency-patient-search" className="block text-sm font-bold text-slate-700">
            Search by patient number
          </label>
          <input
            id="emergency-patient-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="PTNT-EMER-001"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-600"
          />
          {loading ? (
            <p className="text-sm text-slate-500">Loading emergency patients...</p>
          ) : filteredPatients.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              {emergencyPatients.length === 0
                ? 'No patients with a PTNT-EMER number were found.'
                : 'No emergency patient number matches your search.'}
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
              {filteredPatients.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => selectPatient(patient)}
                    aria-pressed={patient.id === selectedPatientId}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      patient.id === selectedPatientId
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-mono text-sm font-bold text-slate-800">
                      {patient.accountNo}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">{patient.fullName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {!selectedPatient ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
              Select an emergency patient to edit their profile.
            </p>
          ) : (
            <div className="space-y-4">
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-800">Edit patient profile</h3>
                <p className="mt-1 font-mono text-sm text-slate-500">{selectedPatient.accountNo}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Full name
                  <input
                    required
                    value={profile.fullName}
                    onChange={(event) => updateField('fullName', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Patient number
                  <input
                    readOnly
                    value={selectedPatient.accountNo}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-3 font-mono font-normal text-slate-500"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Email
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Contact number
                  <input
                    type="tel"
                    value={profile.contact}
                    onChange={(event) => updateField('contact', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Sex
                  <input
                    value={profile.sex}
                    onChange={(event) => updateField('sex', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Birthday
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}-\d{2}-\d{2}"
                    value={profile.birthday}
                    onChange={(event) => updateBirthday(event.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Type as YYYY-MM-DD. Age fills in automatically.
                  </span>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Age
                  <input
                    readOnly
                    aria-readonly="true"
                    value={profile.age}
                    placeholder="Set birthday to calculate age"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-3 font-normal text-slate-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                  Address
                  <textarea
                    rows={2}
                    value={profile.address}
                    onChange={(event) => updateField('address', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                  Allergies
                  <textarea
                    rows={2}
                    value={profile.allergies}
                    onChange={(event) => updateField('allergies', event.target.value)}
                    placeholder="None recorded"
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving profile...' : 'Save profile'}
              </button>
            </form>
            {matchCandidates.length > 0 && (
              <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div>
                  <h4 className="font-bold text-amber-900">Confirm existing patient match</h4>
                  <p className="mt-1 text-sm text-amber-800">
                    Choose the registered account that belongs to this patient. The temporary emergency account will not be deleted until you confirm the merge.
                  </p>
                </div>
                <ul className="space-y-2">
                  {matchCandidates.map((patient) => (
                    <li key={patient.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMatchPatientId(patient.id);
                          setIsMergeConfirmationVisible(false);
                        }}
                        aria-pressed={patient.id === selectedMatchPatientId}
                        className={`w-full rounded-xl border p-3 text-left ${
                          patient.id === selectedMatchPatientId
                            ? 'border-amber-600 bg-white ring-2 ring-amber-200'
                            : 'border-amber-200 bg-amber-50 hover:bg-white'
                        }`}
                      >
                        <span className="block font-bold text-slate-800">{patient.fullName}</span>
                        <span className="mt-1 block font-mono text-xs text-slate-600">
                          {patient.accountNo}
                        </span>
                        {patient.email && (
                          <span className="mt-1 block break-all text-xs text-slate-500">
                            {patient.email}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {!isMergeConfirmationVisible ? (
                  <button
                    type="button"
                    onClick={() => setIsMergeConfirmationVisible(true)}
                    disabled={!selectedMatchPatientId || merging}
                    className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Review merge
                  </button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-amber-300 bg-white p-3">
                    <div role="group" aria-labelledby="confirm-emergency-profile-merge">
                      <h5 id="confirm-emergency-profile-merge" className="font-bold text-slate-800">
                        Confirm profile merge
                      </h5>
                      <p className="mt-1 text-sm text-slate-600">
                        The emergency queue and records will move to the selected patient. The temporary emergency profile will be deleted.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void mergeSelectedPatient()}
                        disabled={merging}
                        className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {merging ? 'Merging profiles...' : 'Confirm and merge'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMergeConfirmationVisible(false)}
                        disabled={merging}
                        className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
