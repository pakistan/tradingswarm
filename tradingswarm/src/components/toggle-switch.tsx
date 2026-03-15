export function ToggleSwitch({ on, onChange }: { on: boolean; onChange?: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-gray-300'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}
