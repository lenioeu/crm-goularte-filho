import { NOME_ESCRITORIO } from "@/lib/config";

export function Marca() {
  return (
    <div className="brand">
      <span className="mark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/orion-simbolo.svg" alt="" width={30} height={30} />
      </span>
      <div>
        <b>Órion</b>
        <small>{NOME_ESCRITORIO.toUpperCase()}</small>
      </div>
    </div>
  );
}
