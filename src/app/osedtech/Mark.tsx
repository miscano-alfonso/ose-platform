// The OH-SO ED TECH logotype (Alfonso's sketch, Oct 2026): "OH–SO ED" with "TECH" spaced out and centred underneath, a little bolder.
export function Mark({ small }: { small?: boolean }) {
  return <span className={`edt-mark${small ? " sm" : ""}`} aria-label="OH-SO ED Tech"><span className="t" aria-hidden="true">OH–SO ED</span><span className="s" aria-hidden="true">TECH</span></span>;
}
