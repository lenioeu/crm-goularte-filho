import { NOME_ESCRITORIO } from "@/lib/config";

export function Marca() {
  return (
    <div className="brand">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M12 4v16M6 7h12M8 7l-3 6.5a3 3 0 0 0 6 0zM16 7l-3 6.5a3 3 0 0 0 6 0zM8.5 20h7" />
        </svg>
      </span>
      <div>
        <b>Órion</b>
        <small>{NOME_ESCRITORIO.toUpperCase()}</small>
      </div>
    </div>
  );
}
