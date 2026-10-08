// Gizmo's face on its own, cropped to the head -- for the bottom bar's
// bubble and the chat bubbles. Same art as the full character in GizmoTab;
// the eyes close on `blink` exactly like his big version.

export function GizmoHead({ size = 28, blink = false }: { size?: number; blink?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="14 14 52 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 36 Q4 6 22 18 Q19 26 17 34 Z" fill="#6B4020"/>
      <path d="M14 34 Q7 10 21 20 Q18 27 17 33 Z" fill="#A87048"/>
      <path d="M67 36 Q76 6 58 18 Q61 26 63 34 Z" fill="#6B4020"/>
      <path d="M66 34 Q73 10 59 20 Q62 27 63 33 Z" fill="#A87048"/>
      <ellipse cx="40" cy="38" rx="27" ry="24" fill="#C09870"/>
      <ellipse cx="40" cy="24" rx="26" ry="5" fill="#7B5030" opacity=".45"/>
      <ellipse cx="40" cy="40" rx="21" ry="18" fill="#D4B490"/>
      <circle cx="27" cy="36" r="11" fill="white"/>
      <circle cx="53" cy="36" r="11" fill="white"/>
      {blink ? (
        <>
          <rect x="19.5" y="34" width="15" height="3" rx="1.5" fill="#9B6A38"/>
          <rect x="45.5" y="34" width="15" height="3" rx="1.5" fill="#9B6A38"/>
        </>
      ) : (
        <>
          <circle cx="27" cy="37" r="7.5" fill="#9B6A38"/>
          <circle cx="53" cy="37" r="7.5" fill="#9B6A38"/>
          <circle cx="27" cy="37" r="4.5" fill="#1A0C04"/>
          <circle cx="53" cy="37" r="4.5" fill="#1A0C04"/>
          <circle cx="29.5" cy="33.5" r="2" fill="white"/>
          <circle cx="55.5" cy="33.5" r="2" fill="white"/>
        </>
      )}
      <circle cx="27" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <circle cx="53" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <path d="M39.5 35 Q40 33 40.5 35" stroke="#2A1A0A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="40" cy="46" rx="3.5" ry="2.5" fill="#8B4A28"/>
      <path d="M34 53 Q40 58 46 53" stroke="#6A3018" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}
