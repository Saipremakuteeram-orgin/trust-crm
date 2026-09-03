export default function LogButton({ onPress, disabled }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className="m-tap w-16 h-16 rounded-full bg-gradient-to-br from-saffron-500 to-saffron-600 text-white flex items-center justify-center shadow-lg shadow-saffron-500/30 active:scale-95 transition-transform disabled:opacity-50"
      aria-label="Log transaction"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
