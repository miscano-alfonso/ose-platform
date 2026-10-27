export function Mark({ small }: { small?: boolean }) {
  return <span className={`edt-mark${small ? " sm" : ""}`}><span className="edt-dot" aria-hidden="true" />OH–SO <b>EdTech</b></span>;
}
